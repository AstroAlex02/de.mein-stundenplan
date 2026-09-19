import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar.js';
import { TimetableDashboard } from './components/TimetableDashboard.js';
import { ClassSubjectManager } from './components/ClassSubjectManager.js';
import { NotificationsView } from './components/NotificationsView.js';
import { UserManagementView } from './components/UserManagementView.js';
import { LxcSetupGuide } from './components/LxcSetupGuide.js';
import { CalendarModal } from './components/CalendarModal.js';
import { ProfileModal } from './components/ProfileModal.js';
import { LoginModal } from './components/LoginModal.js';
import {
  User,
  UserSettings,
  TimetableLesson,
  SelectedClass,
  NotificationItem,
  SyncStatus,
  SemesterInfo,
  AvailableSubject
} from './types.js';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // App Navigation
  const [activeTab, setActiveTab] = useState<'timetable' | 'classes' | 'notifications' | 'users' | 'lxc'>('timetable');
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userManagementTab, setUserManagementTab] = useState<'users' | 'security' | 'domain'>('users');

  // Data states
  const [lessons, setLessons] = useState<TimetableLesson[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<AvailableSubject[]>([]);
  const [semesterInfo, setSemesterInfo] = useState<SemesterInfo | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSync: null,
    nextSync: null,
    status: 'idle',
    classesSyncedCount: 0,
    totalPeriodsTracked: 0
  });

  const token = localStorage.getItem('stundenplan_token');
  const saveClassesRequestIdRef = useRef(0);

  // Verify auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const savedToken = localStorage.getItem('stundenplan_token');
      if (!savedToken) {
        setLoadingAuth(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` }
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setSettings(data.settings);
        } else {
          localStorage.removeItem('stundenplan_token');
          setUser(null);
        }
      } catch (err) {
        console.warn('Auth verification temporarily unavailable:', err);
      } finally {
        setLoadingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Fetch timetable data (optional WebUntis fresh sync on reload)
  const loadTimetable = useCallback(async (refresh = false) => {
    const currentToken = localStorage.getItem('stundenplan_token');
    if (!currentToken) return;

    try {
      const url = refresh ? '/api/timetable/my?refresh=true' : '/api/timetable/my';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        setLessons(data.lessons || []);
        setAvailableSubjects(data.availableSubjects || []);
        if (data.semesterInfo) {
          setSemesterInfo(data.semesterInfo);
        }
        if (data.settings) {
          setSettings(data.settings);
        }
      } else if (res.status === 401) {
        localStorage.removeItem('stundenplan_token');
        setUser(null);
      }
    } catch (err) {
      console.warn('Timetable temporarily unavailable:', err);
    }
  }, []);

  // Fetch notifications
  const loadNotifications = useCallback(async () => {
    const currentToken = localStorage.getItem('stundenplan_token');
    if (!currentToken) return;

    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      } else if (res.status === 401) {
        localStorage.removeItem('stundenplan_token');
        setUser(null);
      }
    } catch (err) {
      console.warn('Notifications temporarily unavailable:', err);
    }
  }, []);

  // Fetch system status
  const loadSystemStatus = useCallback(async () => {
    const currentToken = localStorage.getItem('stundenplan_token');
    if (!currentToken) return;

    try {
      const res = await fetch('/api/system/status', {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSyncStatus(prev => ({
          ...prev,
          lastSync: data.lastSync,
          nextSync: data.nextSync,
          status: data.isSyncing ? 'syncing' : 'idle',
          totalPeriodsTracked: data.stats?.totalCachedLessons || 0
        }));
      } else if (res.status === 401) {
        localStorage.removeItem('stundenplan_token');
        setUser(null);
      }
    } catch (err) {
      console.warn('System status temporarily unavailable:', err);
    }
  }, []);

  // Reload data and subscribe to server sync events when user is logged in
  useEffect(() => {
    if (user) {
      // Always fresh-sync WebUntis for this user on page load/reload
      loadTimetable(true);
      loadNotifications();
      loadSystemStatus();

      // Periodic backup refresh every 30 seconds
      const timer = setInterval(() => {
        loadNotifications();
        loadSystemStatus();
      }, 30000);

      // Real-time EventSource connection for instant timetable reload on server sync completion
      let eventSource: EventSource | null = null;
      try {
        eventSource = new EventSource('/api/system/events');

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'sync_started') {
              setSyncStatus(prev => ({ ...prev, status: 'syncing' }));
            } else if (data.type === 'sync_completed') {
              setSyncStatus(prev => ({
                ...prev,
                status: 'idle',
                lastSync: data.lastSync || prev.lastSync,
                nextSync: data.nextSync || prev.nextSync
              }));
              // Instant auto-reload of timetable from cache for all active users!
              loadTimetable(false);
              loadNotifications();
            } else if (data.type === 'sync_error') {
              setSyncStatus(prev => ({
                ...prev,
                status: 'idle',
                lastSync: data.lastSync || prev.lastSync,
                nextSync: data.nextSync || prev.nextSync
              }));
            } else if (data.type === 'connected') {
              setSyncStatus(prev => ({
                ...prev,
                status: data.isSyncing ? 'syncing' : prev.status,
                lastSync: data.lastSync || prev.lastSync,
                nextSync: data.nextSync || prev.nextSync
              }));
            }
          } catch (e) {
            console.warn('Error parsing SSE event data:', e);
          }
        };

        eventSource.onerror = () => {
          // EventSource will automatically attempt to reconnect in the background
        };
      } catch (err) {
        console.warn('SSE not supported or failed to connect:', err);
      }

      return () => {
        clearInterval(timer);
        if (eventSource) {
          eventSource.close();
        }
      };
    }
  }, [user, loadTimetable, loadNotifications, loadSystemStatus]);

  // Actions (Admin-only manual trigger for all users)
  const handleTriggerSync = async () => {
    if (user?.role !== 'admin') return;
    setSyncStatus(prev => ({ ...prev, status: 'syncing' }));
    try {
      const res = await fetch('/api/timetable/sync-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}` }
      });

      if (res.ok) {
        await loadTimetable(false);
        await loadNotifications();
        await loadSystemStatus();
      }
    } catch (e) {
      console.warn('Sync trigger error:', e);
    } finally {
      setSyncStatus(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const handleScanSemester = async () => {
    setSyncStatus(prev => ({ ...prev, status: 'syncing' }));
    try {
      const res = await fetch('/api/timetable/scan-semester', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}` }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.timetable) {
          setLessons(data.timetable.lessons || []);
          setAvailableSubjects(data.timetable.availableSubjects || []);
          if (data.timetable.semesterInfo) {
            setSemesterInfo(data.timetable.semesterInfo);
          }
        }
        await loadNotifications();
        await loadSystemStatus();
        return data;
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Semester-Scan fehlgeschlagen');
      }
    } finally {
      setSyncStatus(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const handleSaveClasses = async (classes: SelectedClass[], schoolName?: string, serverUrl?: string) => {
    const currentRequestId = ++saveClassesRequestIdRef.current;

    const res = await fetch('/api/user/classes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}`
      },
      body: JSON.stringify({ classes, schoolName, serverUrl })
    });

    if (res.ok) {
      const data = await res.json();
      // Drop outdated responses if a newer request was dispatched while this was in-flight
      if (currentRequestId !== saveClassesRequestIdRef.current) {
        return;
      }
      setSettings(data.settings);
      if (data.timetable) {
        setLessons(data.timetable.lessons || []);
        setAvailableSubjects(data.timetable.availableSubjects || []);
        if (data.timetable.semesterInfo) {
          setSemesterInfo(data.timetable.semesterInfo);
        }
      }
    }
  };

  const handleSaveFilter = async (excludedSubjects: string[]) => {
    const res = await fetch('/api/user/filter-subjects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}`
      },
      body: JSON.stringify({ excludedSubjects })
    });

    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      if (data.timetable) {
        setLessons(data.timetable.lessons || []);
        setAvailableSubjects(data.timetable.availableSubjects || []);
        if (data.timetable.semesterInfo) {
          setSemesterInfo(data.timetable.semesterInfo);
        }
      }
    }
  };

  const handleSaveHybridSubjects = async (hybridSubjects: string[]) => {
    const res = await fetch('/api/user/hybrid-subjects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}`
      },
      body: JSON.stringify({ hybridSubjects })
    });

    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      if (data.timetable) {
        setLessons(data.timetable.lessons || []);
        setAvailableSubjects(data.timetable.availableSubjects || []);
        if (data.timetable.semesterInfo) {
          setSemesterInfo(data.timetable.semesterInfo);
        }
      }
    }
  };

  const handleMarkAsRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}` }
    });
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleMarkAllAsRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}` }
    });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleDeleteNotification = async (id: number) => {
    await fetch(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}` }
    });
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Test notification helper for room change
  const handleTriggerTestNotification = async () => {
    // Generate a test room change notification
    const testNotif: Omit<NotificationItem, 'id' | 'userId' | 'createdAt' | 'isRead'> = {
      type: 'room_change',
      title: '🚨 Raumänderung: Einführung IT-Security',
      message: 'Der Raum für "Einführung IT-Security" (ITS-1) wurde kurzfristig von "205-017" auf "205-136 (Audimax)" geändert!',
      lessonName: 'Einführung IT-Security',
      oldValue: '205-017',
      newValue: '205-136 (Audimax)',
      date: new Date().toISOString().split('T')[0],
      startTime: '14:00'
    };

    // Client-side simulation
    const created: NotificationItem = {
      ...testNotif,
      id: Date.now(),
      userId: user?.id || 1,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    setNotifications(prev => [created, ...prev]);

    // Show desktop notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(testNotif.title, {
        body: testNotif.message,
        icon: '/favicon.ico'
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('stundenplan_token');
    setUser(null);
    setSettings(null);
    setActiveTab('timetable');
  };

  const handleLoginSuccess = (loggedInUser: User, initialSettings: UserSettings, sessionToken: string) => {
    setUser(loggedInUser);
    setSettings(initialSettings);
    setActiveTab('timetable');
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Lade Mein-Stundenplan...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      <Navbar
        user={user}
        settings={settings}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadNotificationsCount={unreadCount}
        syncStatus={syncStatus}
        onTriggerSync={handleTriggerSync}
        onOpenCalendarModal={() => setShowCalendarModal(true)}
        onOpenProfileModal={() => setShowProfileModal(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'timetable' && (
          <TimetableDashboard
            lessons={lessons}
            classes={settings?.selectedClasses || []}
            settings={settings}
            semesterInfo={semesterInfo}
            onOpenClassManager={() => setActiveTab('classes')}
            onTriggerSync={handleTriggerSync}
          />
        )}

        {activeTab === 'classes' && (
          <ClassSubjectManager
            settings={settings}
            availableSubjects={availableSubjects}
            semesterInfo={semesterInfo}
            userRole={user.role}
            onNavigateToTimetable={() => setActiveTab('timetable')}
            onSaveClasses={handleSaveClasses}
            onSaveFilter={handleSaveFilter}
            onSaveHybridSubjects={handleSaveHybridSubjects}
            onSync={handleTriggerSync}
            onScanSemester={handleScanSemester}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsView
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onDeleteNotification={handleDeleteNotification}
            onTriggerTestNotification={handleTriggerTestNotification}
          />
        )}

        {activeTab === 'users' && user.role === 'admin' && (
          <UserManagementView currentUser={user} initialTab={userManagementTab} />
        )}

        {activeTab === 'lxc' && <LxcSetupGuide />}
      </main>

      {showCalendarModal && (
        <CalendarModal
          settings={settings}
          currentUser={user}
          onClose={() => setShowCalendarModal(false)}
          onOpenClassManager={() => {
            setShowCalendarModal(false);
            setActiveTab('classes');
          }}
          onOpenServerConfig={() => {
            setShowCalendarModal(false);
            setUserManagementTab('domain');
            setActiveTab('users');
          }}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          user={user}
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}
