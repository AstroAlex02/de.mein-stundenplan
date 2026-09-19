import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  KeyRound,
  Trash2,
  Shield,
  UserCheck,
  XCircle,
  Check,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Unlock,
  Clock,
  Activity,
  Database,
  Lock,
  Edit3,
  LogOut,
  Globe,
  Save,
  Server,
  ExternalLink
} from 'lucide-react';
import { User } from '../types.js';

interface UserManagementViewProps {
  currentUser: User | null;
  initialTab?: 'users' | 'security' | 'domain';
}

interface SecurityStats {
  lockedIps: Array<{ ip: string; lockedUntil: string; attempts: number }>;
  lockedAccounts: Array<{ account: string; lockedUntil: string; attempts: number }>;
  totalTrackedIps: number;
  totalTrackedAccounts: number;
}

interface SecurityLogItem {
  id: number;
  eventType: string;
  ipAddress: string;
  username: string | null;
  details: string | null;
  createdAt: string;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ currentUser, initialTab = 'users' }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'security' | 'domain'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Domain Config state
  const [customPublicUrl, setCustomPublicUrl] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);
  const [domainSuccess, setDomainSuccess] = useState('');
  const [domainError, setDomainError] = useState('');

  // Users Tab state
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);

  // New User Form
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [createError, setCreateError] = useState('');

  // Reset Password Form
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');

  // Edit User Form
  const [editTargetUser, setEditTargetUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editLogoutAll, setEditLogoutAll] = useState(true);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Security Tab state
  const [securityStats, setSecurityStats] = useState<SecurityStats | null>(null);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogItem[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(false);
  const [securityActionMsg, setSecurityActionMsg] = useState('');

  const token = localStorage.getItem('stundenplan_token') || '';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadSecurity = useCallback(async () => {
    setLoadingSecurity(true);
    try {
      const res = await fetch('/api/admin/security/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSecurityStats(data.stats);
        setSecurityLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSecurity(false);
    }
  }, [token]);

  const loadDomainConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/system/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomPublicUrl(data.customPublicUrl || '');
      }
    } catch (e) {
      console.error('Failed to load system config', e);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
    loadSecurity();
    loadDomainConfig();
  }, [loadUsers, loadSecurity, loadDomainConfig]);

  const handleSaveDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setDomainError('');
    setDomainSuccess('');
    setSavingDomain(true);

    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ customPublicUrl: customPublicUrl.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Speichern der Server-Domain');
      }

      setCustomPublicUrl(data.customPublicUrl || '');
      setDomainSuccess('Server-Domain erfolgreich gespeichert! Alle Kalender-Abo-Links nutzen ab jetzt diese Adresse.');
      setTimeout(() => setDomainSuccess(''), 4500);
      await loadSecurity();
    } catch (err: any) {
      setDomainError(err.message);
    } finally {
      setSavingDomain(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) {
      setCreateError('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim(),
          password: newPassword,
          role: newRole
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler beim Erstellen des Nutzers');
      }

      setShowCreateModal(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setNewRole('user');
      await loadUsers();
      await loadSecurity();
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (!resetTargetUser || !resetPasswordValue.trim()) return;

    try {
      const res = await fetch(`/api/admin/users/${resetTargetUser.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: resetPasswordValue })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Zurücksetzen des Passworts');
      }

      setResetSuccess(`Passwort für "${resetTargetUser.username}" erfolgreich aktualisiert. Alle aktiven Sitzungen wurden beendet.`);
      setTimeout(() => {
        setResetSuccess('');
        setResetTargetUser(null);
        setResetPasswordValue('');
      }, 2500);
      await loadSecurity();
    } catch (e: any) {
      setResetError(e.message);
    }
  };

  const openEditModal = (user: User) => {
    setEditTargetUser(user);
    setEditDisplayName(user.displayName);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditNewPassword('');
    setEditLogoutAll(true);
    setEditError('');
    setEditSuccess('');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetUser) return;
    setEditError('');
    setEditSuccess('');

    if (!editDisplayName.trim()) {
      setEditError('Bitte gib einen Anzeigenamen an.');
      return;
    }
    if (!editUsername.trim()) {
      setEditError('Bitte gib einen Benutzernamen (Login) an.');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/users/${editTargetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          username: editUsername.trim(),
          role: editRole,
          newPassword: editNewPassword.trim() ? editNewPassword.trim() : undefined,
          logoutAllSessions: editLogoutAll
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Bearbeiten des Benutzers');
      }

      setEditSuccess(data.message || 'Benutzerdaten erfolgreich in der Datenbank aktualisiert.');
      await loadUsers();
      await loadSecurity();

      setTimeout(() => {
        setEditSuccess('');
        setEditTargetUser(null);
      }, 1800);
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.username === 'admin' || user.id === 1) {
      alert('Der Standard-Administrator ("admin") kann aus Sicherheitsgründen nicht gelöscht werden.');
      return;
    }

    if (!window.confirm(`Möchtest Du den Benutzer "${user.displayName}" (${user.username}) wirklich unwiderruflich löschen?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await loadUsers();
        await loadSecurity();
      } else {
        const data = await res.json();
        alert(data.error || 'Fehler beim Löschen');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlockIp = async (ip: string) => {
    try {
      const res = await fetch('/api/admin/security/unlock-ip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ip })
      });
      if (res.ok) {
        setSecurityActionMsg(`IP ${ip} erfolgreich entsperrt.`);
        setTimeout(() => setSecurityActionMsg(''), 4000);
        await loadSecurity();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlockAccount = async (account: string) => {
    try {
      const res = await fetch('/api/admin/security/unlock-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ account })
      });
      if (res.ok) {
        setSecurityActionMsg(`Konto "${account}" erfolgreich entsperrt.`);
        setTimeout(() => setSecurityActionMsg(''), 4000);
        await loadSecurity();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case 'FAILED_LOGIN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            Login fehlgeschlagen
          </span>
        );
      case 'IP_LOCKED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse">
            IP gesperrt (15m)
          </span>
        );
      case 'ACCOUNT_LOCKED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse">
            Konto gesperrt (15m)
          </span>
        );
      case 'SUCCESSFUL_LOGIN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Login erfolgreich
          </span>
        );
      case 'PASSWORD_CHANGED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Passwort geändert
          </span>
        );
      case 'ADMIN_ACTION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Admin-Aktion
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {eventType}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header & Tab Selector */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            {activeTab === 'users' ? (
              <Users className="w-5 h-5" />
            ) : activeTab === 'security' ? (
              <ShieldCheck className="w-5 h-5" />
            ) : (
              <Globe className="w-5 h-5" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {activeTab === 'users'
                ? 'Benutzerverwaltung'
                : activeTab === 'security'
                ? 'Sicherheits- & Brute-Force-Zentrale'
                : 'Server-Domain & Kalender-Abo-URL'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeTab === 'users'
                ? 'Verwalte Benutzer, weise Rollen zu und setze Passwörter zurück.'
                : activeTab === 'security'
                ? 'Echtzeit-Schutz vor Brute-Force, IP-Timeouts, SQL-Injection & Sicherheits-Audit-Logs.'
                : 'Passe die Domain an, über die Kalender-Abonnements (.ics/webcal) auf Deinem Server erreichbar sind.'}
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'users'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Benutzerkonten</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('security');
              loadSecurity();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'security'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sicherheit & Audit</span>
            {securityStats && (securityStats.lockedIps.length > 0 || securityStats.lockedAccounts.length > 0) && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('domain');
              loadDomainConfig();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'domain'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Server-Domain</span>
          </button>
        </div>
      </div>

      {securityActionMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl font-bold flex items-center space-x-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{securityActionMsg}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: USERS LIST */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Neuen Benutzer anlegen</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Benutzer</th>
                    <th className="py-3.5 px-4">Anzeigename</th>
                    <th className="py-3.5 px-4">Rolle</th>
                    <th className="py-3.5 px-4">Erstellt am</th>
                    <th className="py-3.5 px-4 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs">
                            {u.username[0].toUpperCase()}
                          </div>
                          <span>{u.username}</span>
                          {u.id === currentUser?.id && (
                            <span className="bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 py-0.2 rounded font-semibold border border-blue-200 dark:border-blue-800">
                              Du
                            </span>
                          )}
                          {(u.username === 'admin' || u.id === 1) && (
                            <span className="bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 text-[9px] px-1.5 py-0.2 rounded font-semibold border border-purple-200 dark:border-purple-800">
                              Geschützt
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">{u.displayName}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          u.role === 'admin'
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}>
                          {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          <span>{u.role === 'admin' ? 'Administrator' : 'Student'}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 dark:text-slate-500">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('de-DE') : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Benutzer bearbeiten (Name, Login, Passwort)"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setResetError('');
                            setResetSuccess('');
                            setResetTargetUser(u);
                          }}
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Schnelles Passwort-Reset"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {u.id !== currentUser?.id && u.username !== 'admin' && u.id !== 1 && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                            title="Benutzer löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: SECURITY & AUDIT */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security Features Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Brute-Force Schutz</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Max. 5 Fehlversuche</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Nach 5 falschen Passwörtern wird die IP & das Konto für 15 Minuten gesperrt (HTTP 429).
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SQL-Injection Schutz</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Prepared Statements</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Parameter-Binding & strenge Eingabe-Whitelist verhindern jegliche Injektionen vollständig.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Timing-Attack Schutz</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Constant-Time Scrypt</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Dummy-Hashberechnung bei unbekannten Nutzern verhindert User-Enumeration per Latenzmessung.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Admin-Immunität</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Root-Account Safe</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Der Haupt-Admin ("admin") kann weder gelöscht noch herabgestuft werden.
              </p>
            </div>
          </div>

          {/* Active Locks Section */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Aktuell gesperrte IP-Adressen & Konten</h3>
              </div>
              <button
                onClick={loadSecurity}
                disabled={loadingSecurity}
                className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center space-x-1 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSecurity ? 'animate-spin' : ''}`} />
                <span>Aktualisieren</span>
              </button>
            </div>

            {(!securityStats || (securityStats.lockedIps.length === 0 && securityStats.lockedAccounts.length === 0)) ? (
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Alles ruhig: Derzeit sind keine IP-Adressen oder Konten temporär gesperrt.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {securityStats.lockedIps.map(lock => (
                  <div key={lock.ip} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-xs">
                    <div>
                      <div className="font-bold text-red-900 dark:text-red-200 flex items-center space-x-2">
                        <span>IP: {lock.ip}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 font-semibold">
                          {lock.attempts} Fehlversuche
                        </span>
                      </div>
                      <div className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                        Gesperrt bis: {new Date(lock.lockedUntil).toLocaleTimeString('de-DE')} Uhr
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlockIp(lock.ip)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center space-x-1 cursor-pointer transition-all"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Sperre aufheben</span>
                    </button>
                  </div>
                ))}

                {securityStats.lockedAccounts.map(lock => (
                  <div key={lock.account} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-xs">
                    <div>
                      <div className="font-bold text-red-900 dark:text-red-200 flex items-center space-x-2">
                        <span>Konto: "{lock.account}"</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 font-semibold">
                          {lock.attempts} Fehlversuche
                        </span>
                      </div>
                      <div className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                        Gesperrt bis: {new Date(lock.lockedUntil).toLocaleTimeString('de-DE')} Uhr
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlockAccount(lock.account)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center space-x-1 cursor-pointer transition-all"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Konto entsperren</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security Audit Log Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Sicherheits-Audit-Log (Echtzeit)</h3>
              </div>
              <span className="text-[11px] text-slate-400">Letzte 100 Ereignisse</span>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Zeitpunkt</th>
                    <th className="py-3 px-4">Ereignis</th>
                    <th className="py-3 px-4">IP-Adresse</th>
                    <th className="py-3 px-4">Benutzer</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {securityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Noch keine Sicherheits-Ereignisse protokolliert.
                      </td>
                    </tr>
                  ) : (
                    securityLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {getEventBadge(log.eventType)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {log.ipAddress}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {log.username || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                          {log.details || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: SERVER DOMAIN CONFIGURATION */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'domain' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Server-Domain für Kalender-Abonnements
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Konfiguriere Deine externe Domain oder IP-Adresse für Apple Kalender, Google Kalender und Thunderbird.
                </p>
              </div>
            </div>

            {domainSuccess && (
              <div className="mb-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl font-medium flex items-center space-x-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{domainSuccess}</span>
              </div>
            )}

            {domainError && (
              <div className="mb-4 p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs rounded-xl font-medium flex items-center space-x-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{domainError}</span>
              </div>
            )}

            <form onSubmit={handleSaveDomain} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Öffentliche Server-Basis-URL (z. B. Deine Domain oder Portweiterleitung):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Server className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={customPublicUrl}
                    onChange={e => setCustomPublicUrl(e.target.value)}
                    placeholder="https://stundenplan.deinedomain.de oder http://192.168.1.100:3000"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Wenn leer gelassen, ermittelt das System die Adresse automatisch aus dem Browser (z. B.{' '}
                  <code>{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}</code>).
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                  <span>Vorschau der Kalender-Abo-URL für Deine Benutzer:</span>
                </span>
                <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-[11px] text-slate-800 dark:text-slate-200 select-all break-all">
                  {(customPublicUrl.trim() || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')).replace(/\/+$/, '')}
                  /api/calendar/feed/<strong>[benutzer-token]</strong>.ics
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                  <p>• <strong>Apple Kalender / iOS:</strong> Unterstützt sowohl <code>webcal://</code> als auch <code>https://</code> Feeds.</p>
                  <p>• <strong>Google Kalender:</strong> Benötigt eine öffentlich erreichbare HTTPS-URL (per Portfreigabe, Nginx Reverse Proxy, Cloudflare Tunnel oder DuckDNS).</p>
                  <p>• <strong>Automatische Aktualisierung:</strong> Der Feed wird mit <code>Cache-Control: no-cache</code> und <code>REFRESH-INTERVAL: PT15M</code> ausgeliefert, sodass Änderungen der gewählten Klassen und Fächer sofort beim nächsten Kalender-Abruf aktiv sind.</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="submit"
                  disabled={savingDomain}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingDomain ? 'Speichere...' : 'Domain-Einstellungen speichern'}</span>
                </button>

                {customPublicUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPublicUrl('');
                    }}
                    className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl cursor-pointer transition-colors"
                  >
                    Zurücksetzen (Browser-Default)
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CREATE USER */}
      {/* ------------------------------------------------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Neuen Benutzer anlegen</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs rounded-lg font-medium">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Benutzername (Login)
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="z.B. max_mustermann"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Erlaubt: Buchstaben, Zahlen, . _ - @ (2–50 Zeichen)
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Anzeigename</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={newDisplayName}
                  onChange={e => setNewDisplayName(e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Initiales Passwort</label>
                <input
                  type="password"
                  required
                  maxLength={256}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder={newRole === 'admin' ? 'Mindestens 6 Zeichen für Admins' : 'Mindestens 4 Zeichen'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Rolle</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="user">Student (eigener Stundenplan & Filter)</option>
                  <option value="admin">Administrator (Vollzugriff, Brute-Force- & Sicherheitsverwaltung)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Benutzer anlegen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: RESET PASSWORD */}
      {/* ------------------------------------------------------------- */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Passwort zurücksetzen</h3>
              <button
                onClick={() => setResetTargetUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              Neues Passwort für <strong className="text-slate-800 dark:text-slate-200">{resetTargetUser.username}</strong> festlegen:
            </p>

            {resetSuccess && (
              <div className="mb-3 p-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs rounded-lg font-semibold flex items-center space-x-1">
                <Check className="w-3.5 h-3.5" />
                <span>{resetSuccess}</span>
              </div>
            )}

            {resetError && (
              <div className="mb-3 p-2 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs rounded-lg font-semibold">
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
              <input
                type="password"
                required
                maxLength={256}
                placeholder={resetTargetUser.role === 'admin' ? 'Mindestens 6 Zeichen für Admin' : 'Mindestens 4 Zeichen'}
                value={resetPasswordValue}
                onChange={e => setResetPasswordValue(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex items-center space-x-1.5 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Der Benutzer wird sofort auf allen Geräten abgemeldet.</span>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  Passwort zurücksetzen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: EDIT USER (Name, Username, Role, Password, Logout) */}
      {/* ------------------------------------------------------------- */}
      {editTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-blue-50 dark:bg-blue-950/60 rounded-lg text-blue-600 dark:text-blue-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Benutzer bearbeiten</h3>
              </div>
              <button
                onClick={() => setEditTargetUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {editSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs rounded-xl font-semibold flex items-center space-x-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{editSuccess}</span>
              </div>
            )}

            {editError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs rounded-xl font-medium flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs">
              {/* Anzeigename */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Name (Anzeigename)
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  placeholder="z. B. Max Mustermann"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Benutzername (Login) */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Anmeldename (Login)
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  placeholder="z. B. mmustermann"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Erlaubt: Buchstaben, Zahlen, . _ - @ (min. 2 Zeichen)
                </span>
              </div>

              {/* Rolle */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Rolle
                </label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as any)}
                  disabled={editTargetUser.username === 'admin' || editTargetUser.id === 1}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="user">Student (eingeschränkter Zugriff)</option>
                  <option value="admin">Administrator (Vollzugriff)</option>
                </select>
                {(editTargetUser.username === 'admin' || editTargetUser.id === 1) && (
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 mt-1 block font-medium">
                    Die Rolle des primären Administrators kann nicht geändert werden.
                  </span>
                )}
              </div>

              {/* Neues Passwort (optional) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Passwort zurücksetzen (optional)</span>
                  <span className="text-[10px] font-normal text-slate-400 lowercase">leer lassen, um beizubehalten</span>
                </label>
                <input
                  type="password"
                  maxLength={256}
                  value={editNewPassword}
                  onChange={e => setEditNewPassword(e.target.value)}
                  placeholder={editRole === 'admin' ? 'Neues Admin-Passwort (min. 6 Zeichen)' : 'Neues Passwort (min. 4 Zeichen)'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
              </div>

              {/* Logout Everywhere Checkbox */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <label className="flex items-start space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editLogoutAll}
                    onChange={e => setEditLogoutAll(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1">
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      <span>Überall abmelden (aktive Sitzungen beenden)</span>
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Löscht alle aktiven Sitzungen dieses Nutzers in der Datenbank. Der Benutzer muss sich auf allen Geräten erneut anmelden.
                    </p>
                  </div>
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditTargetUser(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Speichert...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>In Datenbank speichern</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
