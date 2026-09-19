import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  Layers,
  Bell,
  Users,
  Terminal,
  RefreshCw,
  LogOut,
  Download,
  Settings,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldCheck,
  User as UserIcon,
  Menu,
  X
} from 'lucide-react';
import { User, UserSettings, SyncStatus } from '../types.js';
import { ThemeToggle } from './ThemeToggle.tsx';

interface NavbarProps {
  user: User | null;
  settings: UserSettings | null;
  activeTab: 'timetable' | 'classes' | 'notifications' | 'users' | 'lxc';
  setActiveTab: (tab: 'timetable' | 'classes' | 'notifications' | 'users' | 'lxc') => void;
  unreadNotificationsCount: number;
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onOpenCalendarModal: () => void;
  onOpenProfileModal: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  settings,
  activeTab,
  setActiveTab,
  unreadNotificationsCount,
  syncStatus,
  onTriggerSync,
  onOpenCalendarModal,
  onOpenProfileModal,
  onLogout
}) => {
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [desktopUserMenuOpen, setDesktopUserMenuOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [countdown, setCountdown] = useState<string>('');

  const desktopSettingsRef = useRef<HTMLDivElement>(null);
  const desktopUserMenuRef = useRef<HTMLDivElement>(null);

  // Close desktop popovers on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (desktopSettingsRef.current && !desktopSettingsRef.current.contains(event.target as Node)) {
        setDesktopSettingsOpen(false);
      }
      if (desktopUserMenuRef.current && !desktopUserMenuRef.current.contains(event.target as Node)) {
        setDesktopUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate live countdown until next scheduled automatic sync
  useEffect(() => {
    if (!syncStatus.nextSync) {
      setCountdown('');
      return;
    }

    const calculateTimeLeft = () => {
      const diff = Math.floor((new Date(syncStatus.nextSync!).getTime() - Date.now()) / 1000);
      if (diff <= 0) {
        return 'in Kürze';
      }
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      return `${mins}:${secs < 10 ? '0' : ''}${secs} min`;
    };

    setCountdown(calculateTimeLeft());
    const timer = setInterval(() => {
      setCountdown(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [syncStatus.nextSync]);

  const isSettingsActive = ['classes', 'users', 'lxc'].includes(activeTab);
  const initialLetter = (user?.displayName || user?.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & School Info */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-slate-900 dark:text-white tracking-tight text-base sm:text-lg truncate">
                  Mein-Stundenplan
                </span>
                {settings?.schoolName && settings.schoolName !== 'hs-albstadt' && (
                  <span className="bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 shrink-0">
                    {settings.schoolName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden lg:flex items-center space-x-1">
            {/* 1. Stundenplan */}
            <button
              onClick={() => setActiveTab('timetable')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'timetable'
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Stundenplan</span>
            </button>

            {/* 2. Benachrichtigungen */}
            <button
              onClick={() => setActiveTab('notifications')}
              className={`relative flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Benachrichtigungen</span>
              {unreadNotificationsCount > 0 && (
                <span className="bg-rose-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* 3. Einstellungen Dropdown */}
            <div className="relative" ref={desktopSettingsRef}>
              <button
                onClick={() => {
                  setDesktopSettingsOpen(prev => !prev);
                  setDesktopUserMenuOpen(false);
                }}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isSettingsActive
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Einstellungen</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${desktopSettingsOpen ? 'rotate-180' : ''}`} />
              </button>

              {desktopSettingsOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Konfiguration
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('classes');
                      setDesktopSettingsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'classes'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Klassen & Fächer</span>
                    </div>
                    {settings?.selectedClasses && settings.selectedClasses.length > 0 && (
                      <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                        {settings.selectedClasses.length} gewählt
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      onOpenProfileModal();
                      setDesktopSettingsOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <UserIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>Profil & Passwort</span>
                  </button>

                  {/* Admin Tools */}
                  {user?.role === 'admin' && (
                    <>
                      <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center space-x-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Admin-Bereich</span>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('users');
                          setDesktopSettingsOpen(false);
                        }}
                        className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                          activeTab === 'users'
                            ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span>Benutzerverwaltung</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('lxc');
                          setDesktopSettingsOpen(false);
                        }}
                        className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                          activeTab === 'lxc'
                            ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Terminal className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <span>LXC & Update Anleitung</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </nav>

          {/* Desktop Right Side Tools */}
          <div className="hidden lg:flex items-center space-x-2">
            {/* Auto-Sync Countdown Badge */}
            <div
              title={syncStatus.nextSync ? `Automatischer Server-Sync um ${new Date(syncStatus.nextSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Uhr (immer zur vollen Stunde).` : 'Automatischer Sync zur vollen Stunde aktiv'}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors select-none"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Auto-Sync:</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                {syncStatus.status === 'syncing' ? 'Syncing...' : (countdown || 'in Kürze')}
              </span>
            </div>

            {/* Admin-Only Global Sync Button */}
            {user?.role === 'admin' && (
              <button
                onClick={onTriggerSync}
                disabled={syncStatus.status === 'syncing'}
                title="Als Admin: Manuellen Abgleich für alle Benutzer starten"
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg border border-amber-200 dark:border-amber-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.status === 'syncing' ? 'animate-spin text-amber-600 dark:text-amber-400' : 'text-amber-600 dark:text-amber-400'}`} />
                <span className="font-semibold">
                  {syncStatus.status === 'syncing' ? 'Sync läuft...' : 'Admin-Sync'}
                </span>
              </button>
            )}

            {/* Calendar Export Button */}
            <button
              onClick={onOpenCalendarModal}
              title="Kalender als .ics exportieren oder live abonnieren"
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Kalender-Abo</span>
            </button>

            {/* Dark Mode Switcher */}
            <ThemeToggle className="ml-1" />

            {/* User Profile Avatar with First Letter & Logout Dropdown */}
            <div className="relative pl-2 border-l border-slate-200 dark:border-slate-800" ref={desktopUserMenuRef}>
              <button
                onClick={() => {
                  setDesktopUserMenuOpen(prev => !prev);
                  setDesktopSettingsOpen(false);
                }}
                title={`${user?.displayName || user?.username} - Menü öffnen`}
                className="w-9 h-9 rounded-full bg-linear-to-tr from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs ring-2 ring-transparent hover:ring-blue-400/60 transition-all cursor-pointer select-none"
              >
                {initialLetter}
              </button>

              {desktopUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-linear-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-base shadow-xs">
                        {initialLetter}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                          {user?.displayName || user?.username}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          @{user?.username}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            user?.role === 'admin'
                              ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}>
                            {user?.role === 'admin' ? 'Administrator' : 'Student'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-1.5 space-y-0.5">
                    <button
                      onClick={() => {
                        setDesktopUserMenuOpen(false);
                        onOpenProfileModal();
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-left"
                    >
                      <UserIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>Profil & Passwort ändern</span>
                    </button>

                    <button
                      onClick={() => {
                        setDesktopUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                      <span>Abmelden</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile & Tablet Right Controls: ThemeToggle (active on screens < 1024px) */}
          <div className="flex lg:hidden items-center space-x-1.5 sm:space-x-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile & Tablet Quick-Navigation Tabs (3 items: Stundenplan, Alerts, Menü - Fächer moved into Menu) */}
        <div className="grid grid-cols-3 lg:hidden border-t border-slate-200 dark:border-slate-800 py-1.5 gap-1.5 text-xs">
          {/* 1. Stundenplan */}
          <button
            onClick={() => setActiveTab('timetable')}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl font-medium transition-colors cursor-pointer min-h-[44px] ${
              activeTab === 'timetable'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4 mb-0.5" />
            <span className="text-[11px] leading-tight">Stundenplan</span>
          </button>

          {/* 2. Benachrichtigungen */}
          <button
            onClick={() => setActiveTab('notifications')}
            className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl font-medium transition-colors cursor-pointer min-h-[44px] ${
              activeTab === 'notifications'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bell className="w-4 h-4 mb-0.5" />
            <span className="text-[11px] leading-tight">Alerts</span>
            {unreadNotificationsCount > 0 && (
              <span className={`absolute top-1 right-2 text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                activeTab === 'notifications' ? 'bg-white text-rose-600' : 'bg-rose-500 text-white animate-pulse'
              }`}>
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* 3. Menü Drawer Trigger (includes Fächer, Profile, Kalender, Admin) */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl font-medium transition-colors cursor-pointer min-h-[44px] ${
              ['classes', 'users', 'lxc'].includes(activeTab) || mobileDrawerOpen
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Menu className="w-4 h-4 mb-0.5" />
            <span className="text-[11px] leading-tight">Menü</span>
            {settings?.selectedClasses && settings.selectedClasses.length > 0 && (
              <span className={`absolute top-1 right-2 text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                ['classes', 'users', 'lxc'].includes(activeTab) || mobileDrawerOpen
                  ? 'bg-white text-blue-700'
                  : 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
              }`}>
                {settings.selectedClasses.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Slide-Over Drawer Sheet (active on all screens < 1024px) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer Container */}
          <div className="fixed inset-y-0 right-0 w-full max-w-xs sm:max-w-sm md:max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col z-50 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-900 dark:text-white text-sm">Menü & Navigation</span>
              </div>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* User Profile Card */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-linear-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                    {initialLetter}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {user?.displayName || user?.username}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      @{user?.username}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    user?.role === 'admin'
                      ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                      : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  }`}>
                    {user?.role === 'admin' ? 'Admin' : 'Student'}
                  </span>
                </div>

                {/* Auto-Sync Countdown in Card */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Nächster Auto-Sync:</span>
                  </span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                    {syncStatus.status === 'syncing' ? 'Syncing...' : (countdown || 'in Kürze')}
                  </span>
                </div>
              </div>

              {/* Navigation Links */}
              <div className="space-y-1">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Unterseiten & Ansichten
                </div>

                {/* 1. Stundenplan */}
                <button
                  onClick={() => {
                    setActiveTab('timetable');
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'timetable'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Stundenplan</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                {/* 2. Klassen & Fächer (Fächer auswählen) */}
                <button
                  onClick={() => {
                    setActiveTab('classes');
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'classes'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Klassen & Fächer wählen</span>
                  </div>
                  {settings?.selectedClasses && settings.selectedClasses.length > 0 ? (
                    <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                      {settings.selectedClasses.length} gewählt
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {/* 3. Benachrichtigungen */}
                <button
                  onClick={() => {
                    setActiveTab('notifications');
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'notifications'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Benachrichtigungen & Änderungen</span>
                  </div>
                  {unreadNotificationsCount > 0 ? (
                    <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {unreadNotificationsCount} neu
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>

              {/* Funktionen & Aktionen */}
              <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Kalender & Konto
                </div>

                {/* Kalender-Abo */}
                <button
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    onOpenCalendarModal();
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px]"
                >
                  <div className="flex items-center space-x-3">
                    <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Kalender abonnieren (.ics)</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                {/* Profil & Passwort */}
                <button
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    onOpenProfileModal();
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px]"
                >
                  <div className="flex items-center space-x-3">
                    <UserIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>Profil & Passwort ändern</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* Admin Tools */}
              {user?.role === 'admin' && (
                <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin-Bereich</span>
                  </div>

                  {/* Benutzerverwaltung */}
                  <button
                    onClick={() => {
                      setActiveTab('users');
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
                      activeTab === 'users'
                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Benutzerverwaltung & Sicherheit</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  {/* LXC Anleitung */}
                  <button
                    onClick={() => {
                      setActiveTab('lxc');
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer min-h-[44px] ${
                      activeTab === 'lxc'
                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Terminal className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      <span>LXC & Update Anleitung</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  {/* Admin Sync Button */}
                  <button
                    onClick={() => {
                      onTriggerSync();
                    }}
                    disabled={syncStatus.status === 'syncing'}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50 cursor-pointer min-h-[44px]"
                  >
                    <div className="flex items-center space-x-3">
                      <RefreshCw className={`w-4 h-4 text-amber-600 dark:text-amber-400 ${syncStatus.status === 'syncing' ? 'animate-spin' : ''}`} />
                      <span>{syncStatus.status === 'syncing' ? 'Server-Sync läuft...' : 'Manuellen Server-Sync starten'}</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Drawer Footer: Darkmode & Logout */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Erscheinungsbild</span>
                <ThemeToggle />
              </div>

              <button
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors cursor-pointer min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span>Abmelden</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};


