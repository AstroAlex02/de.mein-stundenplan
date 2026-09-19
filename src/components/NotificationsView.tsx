import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertTriangle,
  Clock,
  MapPin,
  Calendar,
  Sparkles,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { NotificationItem } from '../types.js';

interface NotificationsViewProps {
  notifications: NotificationItem[];
  onMarkAsRead: (id: number) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onDeleteNotification: (id: number) => Promise<void>;
  onTriggerTestNotification: () => Promise<void>;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onTriggerTestNotification
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'room' | 'time'>('all');
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const requestBrowserPush = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setBrowserPermission(perm);
      if (perm === 'granted') {
        new Notification('Mein-Stundenplan', {
          body: 'Browser-Benachrichtigungen für Raumänderungen erfolgreich aktiviert!',
          icon: '/favicon.ico'
        });
      }
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'room') return n.type === 'room_change';
    if (filter === 'time') return n.type === 'time_change';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Änderungen & Benachrichtigungen</h2>
            {unreadCount > 0 && (
              <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount} neu
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automatische Erkennung bei Raumwechsel, Zeitverschiebungen und Vorlesungsausfällen
          </p>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer border border-transparent dark:border-slate-700"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Alle gelesen</span>
            </button>
          )}

          {/* Test Trigger Button for live verification */}
          <button
            onClick={onTriggerTestNotification}
            className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-lg flex items-center space-x-1.5 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
            title="Simuliert eine kurzfristige Raumänderung zur Überprüfung"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Test-Raumänderung</span>
          </button>
        </div>
      </div>

      {/* Browser Notification Banner */}
      {browserPermission !== 'granted' && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 rounded-xl p-4 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-900 dark:text-blue-200">Desktop-Benachrichtigungen aktivieren</p>
              <p className="text-[11px] text-blue-700 dark:text-blue-300">
                Werde sofort benachrichtigt, sobald WebUntis eine Raum- oder Zeitänderung meldet.
              </p>
            </div>
          </div>
          <button
            onClick={requestBrowserPush}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-2xs whitespace-nowrap cursor-pointer"
          >
            Aktivieren
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Alle ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'unread'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Ungelesen ({unreadCount})
        </button>
        <button
          onClick={() => setFilter('room')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'room'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          🚨 Nur Raumänderungen
        </button>
        <button
          onClick={() => setFilter('time')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            filter === 'time'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          ⏰ Zeitverschiebungen
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Keine Benachrichtigungen</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Aktuell liegen keine kurzfristigen Änderungen für Deine ausgewählten Vorlesungen vor. Der Stundenplan wird stündlich abgeglichen.
            </p>
          </div>
        ) : (
          filtered.map(item => {
            const isRoom = item.type === 'room_change';
            const isCancel = item.type === 'cancellation';
            const isTime = item.type === 'time_change';

            return (
              <div
                key={item.id}
                className={`p-4 rounded-xl border transition-all ${
                  !item.isRead
                    ? 'bg-amber-50/40 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/80 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isRoom
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                          : isCancel
                          ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                          : 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300'
                      }`}
                    >
                      {isRoom ? (
                        <MapPin className="w-5 h-5" />
                      ) : isCancel ? (
                        <XCircle className="w-5 h-5" />
                      ) : (
                        <Clock className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h4>
                        {!item.isRead && (
                          <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase">
                            Neu
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{item.message}</p>

                      {/* Visual Diff Box for Room Changes */}
                      {isRoom && item.oldValue && item.newValue && (
                        <div className="mt-2 inline-flex items-center space-x-2 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs shadow-2xs">
                          <span className="text-slate-400 dark:text-slate-500 font-medium">Alt:</span>
                          <span className="font-semibold line-through text-slate-500 dark:text-slate-400">{item.oldValue}</span>
                          <span className="text-slate-400 dark:text-slate-500">➔</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            Neu: {item.newValue}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleString('de-DE') : ''}</span>
                        {item.date && (
                          <>
                            <span>•</span>
                            <span>Betrifft Termin am {item.date} {item.startTime} Uhr</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {!item.isRead && (
                      <button
                        onClick={() => onMarkAsRead(item.id)}
                        title="Als gelesen markieren"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteNotification(item.id)}
                      title="Löschen"
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
