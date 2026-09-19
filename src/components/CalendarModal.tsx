import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Download,
  Copy,
  Check,
  XCircle,
  ExternalLink,
  Smartphone,
  ShieldCheck,
  Globe,
  Settings,
  AlertCircle
} from 'lucide-react';
import { UserSettings, User } from '../types.js';

interface CalendarModalProps {
  settings: UserSettings | null;
  currentUser?: User | null;
  onClose: () => void;
  onOpenClassManager?: () => void;
  onOpenServerConfig?: () => void;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({
  settings,
  currentUser,
  onClose,
  onOpenClassManager,
  onOpenServerConfig
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedWebcal, setCopiedWebcal] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState<string>('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'apple' | 'google' | 'outlook'>('apple');

  const token = localStorage.getItem('stundenplan_token') || '';

  // Load configured custom server domain from backend
  useEffect(() => {
    let isMounted = true;
    async function loadConfig() {
      if (!token) return;
      setLoadingConfig(true);
      try {
        const res = await fetch('/api/system/config', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.customPublicUrl) {
            setCustomServerUrl(data.customPublicUrl);
          }
        }
      } catch (err) {
        console.warn('Could not load custom server config', err);
      } finally {
        if (isMounted) setLoadingConfig(false);
      }
    }
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // Determine the effective base URL:
  // 1. Configured custom server domain (if set by admin)
  // 2. Or current browser origin
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const effectiveOrigin = customServerUrl || browserOrigin;

  const calendarToken = settings?.calendarToken || 'sample-token';
  const feedUrl = `${effectiveOrigin}/api/calendar/feed/${calendarToken}.ics`;
  const webcalUrl = feedUrl.replace(/^https?:/, 'webcal:');

  const copyToClipboard = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const copyWebcalToClipboard = () => {
    navigator.clipboard.writeText(webcalUrl);
    setCopiedWebcal(true);
    setTimeout(() => setCopiedWebcal(false), 2500);
  };

  const handleDownload = () => {
    window.location.href = `/api/calendar/export.ics?token=${token}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150 transition-colors max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Kalender Exportieren & Abonnieren</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dein personalisierter Stundenplan synchronisiert auf allen Geräten</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Active Filter Info with quick link to edit */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
            <div className="min-w-0 pr-2">
              <p className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                Klassen: {settings?.selectedClasses.map(c => c.name).join(', ') || 'Keine Klasse gewählt'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                {settings?.excludedSubjects && settings.excludedSubjects.length > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    ✓ {settings.excludedSubjects.length} Fächer abgewählt (nur Deine aktiven Fächer sind im Feed)
                  </span>
                ) : (
                  <span>Alle Fächer der gewählten Klassen sind im Kalender aktiv</span>
                )}
              </p>
            </div>
            {onOpenClassManager && (
              <button
                onClick={onOpenClassManager}
                className="shrink-0 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors cursor-pointer"
              >
                Fächer anpassen
              </button>
            )}
          </div>

          {/* Option 1: Live Webcal Subscription (Recommended) */}
          <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-blue-900 dark:text-blue-200 font-bold">
                <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>1. Live Kalender-Abonnement (Automatische Aktualisierung)</span>
              </div>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
              Verbinde Deinen Kalender mit dieser URL. Fächer, Ausfälle und Raumänderungen werden automatisch in Deinem Kalender aktualisiert:
            </p>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Kalender-Feed URL (HTTPS)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={feedUrl}
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 font-mono text-[11px] select-all"
                />
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center space-x-1 cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
                </button>
              </div>
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <a
                  href={webcalUrl}
                  className="inline-flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold text-[11px]"
                >
                  <span>Direkt auf iPhone / Mac öffnen</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {customServerUrl && (
                <span className="inline-flex items-center space-x-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                  <Globe className="w-3 h-3" />
                  <span>Server-Domain aktiv: {customServerUrl}</span>
                </span>
              )}
            </div>

            {/* Quick Setup Instructions Tabs */}
            <div className="pt-2 border-t border-blue-100 dark:border-blue-900/60">
              <div className="flex items-center space-x-1 mb-2">
                <button
                  onClick={() => setActiveGuideTab('apple')}
                  className={`px-2.5 py-0.5 rounded-md font-semibold text-[10px] transition-colors cursor-pointer ${
                    activeGuideTab === 'apple'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Apple Kalender
                </button>
                <button
                  onClick={() => setActiveGuideTab('google')}
                  className={`px-2.5 py-0.5 rounded-md font-semibold text-[10px] transition-colors cursor-pointer ${
                    activeGuideTab === 'google'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Google Kalender
                </button>
                <button
                  onClick={() => setActiveGuideTab('outlook')}
                  className={`px-2.5 py-0.5 rounded-md font-semibold text-[10px] transition-colors cursor-pointer ${
                    activeGuideTab === 'outlook'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Outlook
                </button>
              </div>

              {activeGuideTab === 'apple' && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                  <strong>iPhone / iPad / Mac:</strong> Klicke auf &quot;Direkt auf iPhone / Mac öffnen&quot; oder gehe in Kalender auf <em>Ablage &gt; Neues Kalenderabonnement</em> und füge die URL ein.
                </p>
              )}
              {activeGuideTab === 'google' && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                  <strong>Google Kalender (Android / Web):</strong> Öffne <em>calendar.google.com</em> am PC oder Browser, klicke links neben <em>&quot;Weitere Kalender&quot;</em> auf das <strong>+</strong> &gt; <em>&quot;Per URL hinzufügen&quot;</em> und füge die kopierte URL ein.
                </p>
              )}
              {activeGuideTab === 'outlook' && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                  <strong>Outlook:</strong> Gehe zu <em>Kalender hinzufügen &gt; Aus dem Internet abonnieren</em> und füge die Feed-URL ein.
                </p>
              )}
            </div>
          </div>

          {/* Server Domain Note for Admin */}
          {currentUser?.role === 'admin' && (
            <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-purple-900 dark:text-purple-200 font-bold text-xs">
                  <Globe className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Admin: Server-Domain für Kalender-URL</span>
                </div>
                {onOpenServerConfig && (
                  <button
                    onClick={onOpenServerConfig}
                    className="text-purple-700 dark:text-purple-300 hover:underline text-[11px] font-bold flex items-center space-x-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Domain ändern</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 leading-tight">
                {customServerUrl ? (
                  <>Konfiguriert: <code className="font-mono font-semibold">{customServerUrl}</code> (wird für alle Benutzer als Feed-Basis verwendet).</>
                ) : (
                  <>Aktuell wird die Browser-Adresse (<code>{browserOrigin}</code>) verwendet. Wenn Du Deinen LXC-Server unter einer festen Domain betreibst, kannst Du diese hier hinterlegen.</>
                )}
              </p>
            </div>
          )}

          {/* Option 2: Direct .ics file download */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">2. Einmalige .ics Datei herunterladen</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Statische Kalenderdatei für manuellen Import ohne Abo</p>
            </div>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.ics Download</span>
            </button>
          </div>

          {/* Privacy Note */}
          <div className="flex items-center space-x-2 text-[11px] text-slate-400 dark:text-slate-500 pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Dein Kalender-Feed enthält ein persönliches Token und synchronisiert Deine gewählten Fächer.</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg cursor-pointer"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
};
