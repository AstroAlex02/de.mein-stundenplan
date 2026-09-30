import React, { useState } from 'react';
import {
  User as UserIcon,
  Lock,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  Calendar
} from 'lucide-react';
import { User } from '../types.js';

interface ProfileModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ user, isOpen, onClose }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!oldPassword) {
      setError('Bitte geben Sie Ihr aktuelles Passwort ein.');
      return;
    }

    if (newPassword.length < 4) {
      setError('Das neue Passwort muss mindestens 4 Zeichen lang sein.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('stundenplan_token') || ''}`
        },
        body: JSON.stringify({ oldPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Ändern des Passworts');
      }

      setSuccessMessage('Passwort wurde erfolgreich aktualisiert!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setLoading(false);
    }
  };

  const initialLetter = (user.displayName || user.username || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 relative overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20">
              {initialLetter}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Profil & Sicherheit</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Persönliche Benutzer- und Kontoeinstellungen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Read-only User Information */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Anmeldename (Benutzername)
              </label>
              <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <div className="flex items-center space-x-2">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <span>{user.username}</span>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Fest vergeben</span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Name des Benutzers
              </label>
              <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <span>{user.displayName}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Vollständiger Name</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Berechtigungsrolle:</span>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center space-x-1 ${
                user.role === 'admin'
                  ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}>
                <ShieldCheck className="w-3 h-3" />
                <span>{user.role === 'admin' ? 'Administrator' : 'Standardbenutzer'}</span>
              </span>
            </div>
          </div>

          {/* Password Change Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Passwort ändern</span>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Old password */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Aktuelles Passwort
              </label>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  placeholder="Geben Sie Ihr derzeitiges Passwort ein"
                  className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(prev => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Neues Passwort
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mindestens 4 Zeichen"
                  className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(prev => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm new password */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                Neues Passwort bestätigen
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Neues Passwort wiederholen"
                  className="w-full pl-3 pr-10 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(prev => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Schließen
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{loading ? 'Wird gespeichert...' : 'Passwort speichern'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
