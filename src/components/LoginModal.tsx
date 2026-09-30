import React, { useState } from 'react';
import { Calendar, Lock, User as UserIcon, LogIn, AlertTriangle } from 'lucide-react';
import { User, UserSettings } from '../types.js';
import { ThemeToggle } from './ThemeToggle.tsx';

interface LoginModalProps {
  onLoginSuccess: (user: User, settings: UserSettings, token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isLockedOut, setIsLockedOut] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLockedOut(false);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setIsLockedOut(true);
        }
        throw new Error(data.error || 'Ungültige Anmeldedaten');
      }

      localStorage.setItem('stundenplan_token', data.token);
      onLoginSuccess(data.user, data.settings, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center items-center p-4 relative transition-colors duration-200">
      {/* Top right theme toggle for login view */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6 animate-in fade-in zoom-in duration-200 transition-colors">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-blue-500/20">
            <Calendar className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Mein-Stundenplan</h1>
          <div className="inline-flex items-center space-x-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
            <span>Dein Persönlicher Stundenplan</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto pt-1">
            Melde Dich an, um Deinen Stundenplan abzurufen.
          </p>
        </div>

        {error && (
          <div className={`p-3.5 border rounded-xl text-xs font-semibold flex items-start space-x-2.5 ${
            isLockedOut
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}>
            {isLockedOut ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Benutzername
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                maxLength={50}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Benutzername"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden transition-all text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Passwort
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                maxLength={256}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Passwort"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden transition-all text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Anmelden...' : 'Anmelden'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

