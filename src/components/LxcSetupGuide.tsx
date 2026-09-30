import React, { useState } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Server,
  Database,
  Cpu,
  RefreshCw,
  AlertTriangle,
  FileCode,
  ShieldCheck,
  ArrowDownToLine,
  FolderArchive,
  History,
  CheckCircle,
  HelpCircle
} from 'lucide-react';

export const LxcSetupGuide: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'update' | 'install'>('update');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyCode = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const installSteps = [
    {
      title: 'Schritt 1: Proxmox LXC Container anlegen (Debian 13)',
      desc: 'Erstelle im Proxmox Web-Interface (GUI) oder per Proxmox-CLI einen neuen unprivilegierten LXC Container:',
      code: `# Empfohlene Proxmox LXC Spezifikationen:
# - Template: debian-13-standard (oder debian-12 aktualisiert auf 13)
# - Unprivileged Container: Ja
# - CPU: 1 - 2 vCPUs
# - RAM: 1024 MB (oder 512 MB ausreichend)
# - Swap: 512 MB
# - Disk: 8 GB
# - Netzwerk: DHCP oder feste IP (z.B. 192.168.1.150/24)`
    },
    {
      title: 'Schritt 2: Debian 13 Basispakete & Node.js 22 LTS installieren',
      desc: 'Öffne die Konsole des LXC Containers und führe die folgenden Befehle als root aus:',
      code: `apt update && apt upgrade -y
apt install -y curl git build-essential python3 sqlite3 ca-certificates gnupg rsync unzip

# Node.js 22 LTS (Offizielles NodeSource Repository für Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Überprüfe die Versionen:
node -v   # sollte v22.x.x sein
npm -v`
    },
    {
      title: 'Schritt 3: Code über GitHub / Gitea (oder ZIP) herunterladen & kompilieren',
      desc: 'Erstelle das Verzeichnis /opt/webuntis-manager und klone Dein Repository direkt von GitHub oder Deiner Gitea-Instanz per CMD:',
      code: `# Option A: Klonen via GitHub oder Gitea (empfohlen)
# Falls privates Repo: Entweder https://BENUTZER:TOKEN@github.com/... oder SSH Keys nutzen
git clone https://github.com/DEIN_BENUTZERNAME/DEIN_REPO.git /opt/webuntis-manager
# ODER mit Gitea:
# git clone https://gitea.deine-domain.de/benutzer/stundenplan.git /opt/webuntis-manager

cd /opt/webuntis-manager

# Abhängigkeiten installieren & Produktions-Build kompilieren:
npm install
npm run build

# Schneller Funktionstest (Port 3000):
npm run start
# Drücke Strg+C zum Beenden des manuellen Tests.`
    },
    {
      title: 'Schritt 4: Automatischen Systemd-Dienst (24/7 Autostart) einrichten',
      desc: 'Erstelle einen systemd Service, damit das Programm im Hintergrund läuft, bei Server-Neustart automatisch startet und stündlich synchronisiert:',
      code: `cat << 'EOF' > /etc/systemd/system/stundenplan.service
[Unit]
Description=WebUntis Stundenplan Manager & Sync Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/webuntis-manager
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_PATH=/opt/webuntis-manager/stundenplan.db
Environment=SYNC_INTERVAL_MINUTES=60

[Install]
WantedBy=multi-user.target
EOF

# Service aktivieren und starten:
systemctl daemon-reload
systemctl enable --now stundenplan.service

# Status überprüfen:
systemctl status stundenplan.service`
    },
    {
      title: 'Schritt 5: Nginx Reverse-Proxy & Port 80 Freigabe',
      desc: 'Damit die Weboberfläche standardmäßig über http://<LXC_IP> ohne Portangabe erreichbar ist:',
      code: `apt install -y nginx

cat << 'EOF' > /etc/nginx/sites-available/stundenplan
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        # SSE & Realtime Unterstützung ohne Zwischenspeichern:
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
EOF

ln -s /etc/nginx/sites-available/stundenplan /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx`
    },
    {
      title: 'Schritt 6: Datenbank & Backup (SQLite)',
      desc: 'Alle Benutzer, Passwörter, Stundenpläne und Benachrichtigungen liegen in der SQLite-Datenbank /opt/webuntis-manager/stundenplan.db:',
      code: `# Live-Backup der Datenbank ohne Downtime:
sqlite3 /opt/webuntis-manager/stundenplan.db ".backup /opt/webuntis-manager/stundenplan_backup_$(date +%Y%m%d).db"

# Logs des Hintergrunddienstes live anzeigen:
journalctl -u stundenplan.service -f`
    }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Overview Banner & Tab Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-bold border border-transparent dark:border-slate-700">
              <Terminal className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Proxmox & Debian 13 LXC Leitfaden</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Administration, Deployment und Updates für Deinen Heimserver
              </p>
            </div>
          </div>

          {/* Section Switcher Tabs */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('update')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'update'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${activeTab === 'update' ? 'animate-spin-once' : ''}`} />
              <span>Update & Code-Aktualisierung</span>
              <span className="bg-amber-400 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ml-1">
                Wichtig
              </span>
            </button>
            <button
              onClick={() => setActiveTab('install')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'install'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Erstinstallation (Schritte 1–6)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200 font-bold mb-1">
              <Database className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>Wichtig: Datenbank erhalten</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Die Datei <code>stundenplan.db</code> speichert alle Accounts, Passwörter und Stundenpläne. Sie darf beim Aktualisieren <strong>nie</strong> überschrieben werden.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200 font-bold mb-1">
              <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Build nach jedem Update</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Nach jedem Code-Upload muss <code>npm install && npm run build</code> ausgeführt werden, um TypeScript und Vite neu zu kompilieren.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200 font-bold mb-1">
              <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Dienst-Neustart</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Der Dienst <code>stundenplan.service</code> muss vor dem Code-Upload gestoppt und nach dem Build wieder gestartet werden.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UPDATE SECTION (Detailed Instructions for Code Modifications & Re-upload) */}
      {/* ========================================================================= */}
      {activeTab === 'update' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Critical Warning: Database Protection */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/80 rounded-2xl p-5 shadow-xs">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2 text-xs">
                <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                  Wichtigste Regel für Updates: Die SQLite-Datenbank NIEMALS überschreiben!
                </h3>
                <p className="text-amber-900 dark:text-amber-300 leading-relaxed">
                  Deine Produktionsdatenbank befindet sich unter{' '}
                  <code className="bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded font-mono font-bold text-amber-950 dark:text-amber-200">
                    /opt/webuntis-manager/stundenplan.db
                  </code>
                  .
                  Darin sind <strong>alle Benutzerkonten, gehashte Passwörter, Stundenpläne, Klassen-Auswahlen, Filterregeln und WebUntis-Tokens</strong> gespeichert.
                </p>
                <p className="text-amber-900 dark:text-amber-300 leading-relaxed">
                  Wenn Du das Projekt erneut mit einer KI bearbeitest oder als ZIP-Archiv herunterlädst, enthält das Archiv entweder gar keine Datenbank oder eine leere Entwickler-Datenbank.
                  <strong>
                    {' '}Ersetze oder lösche die Datei <code>stundenplan.db</code> (sowie ggf. <code>stundenplan.db-wal</code> und <code>stundenplan.db-shm</code>) daher niemals!
                  </strong>
                </p>
              </div>
            </div>
          </div>

          {/* Scenario A: Full Re-Upload (e.g. AI Studio ZIP Export / SFTP / FileZilla) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <FolderArchive className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Szenario 1: Neuer Gesamt-Code hochladen (ZIP-Download aus KI / FileZilla / WinSCP)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Empfohlener Ablauf, wenn Du das gesamte Projekt neu aus der KI heruntergeladen hast
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  copyCode(
                    `# 1. Dienst stoppen\nsystemctl stop stundenplan.service\n\n# 2. Datenbank sichern\ncp /opt/webuntis-manager/stundenplan.db /root/stundenplan_backup_\$(date +%Y%m%d_%H%M%S).db\n[ -f /opt/webuntis-manager/.env ] && cp /opt/webuntis-manager/.env /root/env_backup.env\n\n# 3. Code übertragen (stundenplan.db nicht überschreiben!)\n# Nach dem Entpacken / Hochladen:\ncd /opt/webuntis-manager\n\n# 4. Abhängigkeiten & Build\nnpm install\nnpm run build\n\n# 5. Dienst starten & prüfen\nsystemctl start stundenplan.service\nsystemctl status stundenplan.service`,
                    'scenario-a'
                  )
                }
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer border border-transparent dark:border-slate-700"
              >
                {copiedKey === 'scenario-a' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'scenario-a' ? 'Kopiert!' : 'Alle Befehle kopieren'}</span>
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5 mb-1">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[11px]">1</span>
                    <span>Hintergrunddienst stoppen</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Stoppe den laufenden Node.js-Prozess, damit keine gesperrten Dateien vorliegen:
                  </p>
                  <code className="block mt-1 p-1.5 bg-slate-950 text-slate-100 rounded font-mono text-[11px]">
                    systemctl stop stundenplan.service
                  </code>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5 mb-1">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[11px]">2</span>
                    <span>Sicherheits-Backup der DB anlegen</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Kopiere die Datenbank sicherheitshalber nach <code>/root/</code>:
                  </p>
                  <code className="block mt-1 p-1.5 bg-slate-950 text-slate-100 rounded font-mono text-[11px]">
                    cp /opt/webuntis-manager/stundenplan.db /root/stundenplan_backup_$(date +%Y%m%d_%H%M%S).db
                  </code>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[11px]">3</span>
                  <span>Neuen Code hochladen & entpacken</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Übertrage das neue ZIP-Archiv per WinSCP, FileZilla oder <code>scp</code> in den LXC Container. Entpacke die Dateien nach <code>/opt/webuntis-manager/</code>.
                </p>
                <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-900 dark:text-amber-300 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    <strong>Vorsicht:</strong> Sollte Dein ZIP-Archiv eine <code>stundenplan.db</code> enthalten haben, stelle sofort das Backup aus Schritt 2 wieder her:{' '}
                    <code>cp /root/stundenplan_backup_*.db /opt/webuntis-manager/stundenplan.db</code>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5 mb-1">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[11px]">4</span>
                    <span>Abhängigkeiten & Build kompilieren</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Installiere neue Pakete und erstelle das Produktions-Bundle:
                  </p>
                  <code className="block mt-1 p-1.5 bg-slate-950 text-slate-100 rounded font-mono text-[11px]">
                    cd /opt/webuntis-manager && npm install && npm run build
                  </code>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5 mb-1">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[11px]">5</span>
                    <span>Dienst starten & prüfen</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Starte den Hintergrunddienst neu und prüfe den Status:
                  </p>
                  <code className="block mt-1 p-1.5 bg-slate-950 text-slate-100 rounded font-mono text-[11px]">
                    systemctl start stundenplan.service && systemctl status stundenplan.service
                  </code>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800">
              <pre className="whitespace-pre-wrap">{`# Kompletter Ablauf als Terminal-Befehle:
systemctl stop stundenplan.service
cp /opt/webuntis-manager/stundenplan.db /root/stundenplan_backup_$(date +%Y%m%d_%H%M%S).db

# Nach dem Hochladen/Entpacken des neuen Codes:
cd /opt/webuntis-manager
npm install
npm run build
systemctl start stundenplan.service

# Live-Logs ansehen:
journalctl -u stundenplan.service -n 50 -f`}</pre>
            </div>
          </div>

          {/* Scenario B: Git Pull Workflow */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Szenario 2: Update per GitHub / Gitea (git pull)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Befehle für Repositories auf GitHub oder selbstgehostetem Gitea
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  copyCode(
                    `cd /opt/webuntis-manager\nsystemctl stop stundenplan.service\ncp stundenplan.db /root/stundenplan_backup_\$(date +%Y%m%d_%H%M%S).db\n# Neuesten Stand von GitHub oder Gitea ziehen:\ngit pull origin main\nnpm install\nnpm run build\nsystemctl start stundenplan.service\nsystemctl status stundenplan.service`,
                    'scenario-b'
                  )
                }
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer border border-transparent dark:border-slate-700"
              >
                {copiedKey === 'scenario-b' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'scenario-b' ? 'Kopiert!' : 'Code kopieren'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Da <code>stundenplan.db</code> in der <code>.gitignore</code> eingetragen ist, überschreibt <code>git pull</code> die Datenbank nicht. Alle Passwörter, Benutzer und Einstellungen bleiben zu 100% erhalten:
            </p>

            <div className="bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800">
              <pre className="whitespace-pre-wrap">{`# In das Projektverzeichnis wechseln
cd /opt/webuntis-manager

# 1. Dienst vorübergehend stoppen
systemctl stop stundenplan.service

# 2. Sicherheitsbackup der SQLite-Datenbank erstellen
cp stundenplan.db /root/stundenplan_backup_$(date +%Y%m%d_%H%M%S).db

# 3. Neuesten Code aus GitHub / Gitea abrufen:
git pull origin main
# (Tipp: Falls Dein Standard-Branch 'master' heißt, nutze 'git pull origin master')

# 4. Pakete aktualisieren & TypeScript neu kompilieren:
npm install
npm run build

# 5. Dienst wieder starten & Log-Status prüfen:
systemctl start stundenplan.service
systemctl status stundenplan.service`}</pre>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Hinweis für private GitHub / Gitea Repositories:</div>
              <p>
                Falls Dein Repository privat ist und nach Benutzername / Passwort fragt, erstelle bei GitHub bzw. Gitea ein <strong>Personal Access Token</strong> (PAT). Du kannst die Remote-URL dauerhaft hinterlegen, damit <code>git pull</code> künftig ohne Passworteingabe durchläuft:
              </p>
              <code className="block p-1.5 bg-slate-950 text-slate-100 rounded font-mono text-[11px] overflow-x-auto">
                git remote set-url origin https://DEIN_TOKEN@github.com/DEIN_USER/DEIN_REPO.git
              </code>
            </div>
          </div>

          {/* All-in-One Automated Update Script */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Tipp für Admins: Fertiges 1-Befehl Update-Skript anlegen
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Erstelle einmalig das Skript <code>/opt/webuntis-manager/update.sh</code>, um künftig alle Updates vollautomatisch auszuführen
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  copyCode(
                    `cat << 'EOF' > /opt/webuntis-manager/update.sh
#!/bin/bash
set -e
echo "=========================================="
echo "  Mein-Stundenplan - Update wird gestartet"
echo "=========================================="
cd /opt/webuntis-manager

echo "[1/6] Stoppe Hintergrunddienst..."
systemctl stop stundenplan.service || true

if [ -f stundenplan.db ]; then
  BACKUP_FILE="/root/stundenplan_backup_$(date +%Y%m%d_%H%M%S).db"
  echo "[2/6] Sichere Datenbank nach: $BACKUP_FILE"
  cp stundenplan.db "$BACKUP_FILE"
fi

if [ -d .git ]; then
  echo "[3/6] Ziehe neuesten Code aus Git (GitHub / Gitea)..."
  git pull || true
fi

echo "[4/6] Installiere npm Abhängigkeiten..."
npm install

echo "[5/6] Kompiliere TypeScript & Vite Produktions-Build..."
npm run build

echo "[6/6] Starte Hintergrunddienst..."
systemctl start stundenplan.service

echo "=========================================="
echo "  Update erfolgreich abgeschlossen!"
echo "=========================================="
systemctl status stundenplan.service --no-pager
EOF

chmod +x /opt/webuntis-manager/update.sh`,
                    'update-script'
                  )
                }
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer border border-transparent dark:border-slate-700"
              >
                {copiedKey === 'update-script' ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'update-script' ? 'Kopiert!' : 'Skript kopieren'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Führe diesen Block einmal in Deiner LXC-Konsole aus. Danach musst Du bei künftigen Updates nach dem Hochladen neuer Dateien nur noch{' '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-slate-800 dark:text-slate-200">
                /opt/webuntis-manager/update.sh
              </code>{' '}
              ausführen (das Skript erkennt automatisch, ob GitHub/Gitea oder ein Datei-Upload genutzt wird):
            </p>

            <div className="bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800">
              <pre className="whitespace-pre-wrap">{`cat << 'EOF' > /opt/webuntis-manager/update.sh
#!/bin/bash
set -e
echo "=========================================="
echo "  Mein-Stundenplan - Update wird gestartet"
echo "=========================================="
cd /opt/webuntis-manager

echo "[1/6] Stoppe Hintergrunddienst..."
systemctl stop stundenplan.service || true

if [ -f stundenplan.db ]; then
  BACKUP_FILE="/root/stundenplan_backup_$(date +%Y%m%d_%H%M%S).db"
  echo "[2/6] Sichere Datenbank nach: $BACKUP_FILE"
  cp stundenplan.db "$BACKUP_FILE"
fi

if [ -d .git ]; then
  echo "[3/6] Ziehe neuesten Code aus Git (GitHub / Gitea)..."
  git pull || true
fi

echo "[4/6] Installiere npm Abhängigkeiten..."
npm install

echo "[5/6] Kompiliere TypeScript & Vite Produktions-Build..."
npm run build

echo "[6/6] Starte Hintergrunddienst..."
systemctl start stundenplan.service

echo "=========================================="
echo "  Update erfolgreich abgeschlossen!"
echo "=========================================="
systemctl status stundenplan.service --no-pager
EOF

chmod +x /opt/webuntis-manager/update.sh`}</pre>
            </div>
          </div>

          {/* Troubleshooting & Rollback */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Notfall-Wiederherstellung & Troubleshooting</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  1. Versehentlich die Datenbank überschrieben?
                </div>
                <p className="text-slate-600 dark:text-slate-400 mb-2">
                  Stelle einfach Dein vorher erstelltes Backup wieder her:
                </p>
                <code className="block p-1.5 bg-slate-950 text-slate-100 rounded font-mono text-[11px]">
                  cp /root/stundenplan_backup_*.db /opt/webuntis-manager/stundenplan.db && systemctl restart stundenplan.service
                </code>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  2. Dienst startet nach Update nicht?
                </div>
                <p className="text-slate-600 dark:text-slate-400 mb-2">
                  Lies die Fehlermeldungen in den systemd-Journalen aus:
                </p>
                <code className="block p-1.5 bg-slate-950 text-slate-100 rounded font-mono text-[11px]">
                  journalctl -u stundenplan.service -e --no-pager
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INSTALLATION SECTION (Step 1 to 6)                                        */}
      {/* ========================================================================= */}
      {activeTab === 'install' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {installSteps.map((step, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{step.title}</h3>
                <button
                  onClick={() => copyCode(step.code, `step-${idx}`)}
                  className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center space-x-1 transition-colors cursor-pointer border border-transparent dark:border-slate-700"
                >
                  {copiedKey === `step-${idx}` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === `step-${idx}` ? 'Kopiert!' : 'Code kopieren'}</span>
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">{step.desc}</p>

              <div className="bg-slate-950 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto shadow-inner border border-slate-800">
                <pre className="whitespace-pre-wrap">{step.code}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
