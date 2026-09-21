import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  db,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  getUserById,
  getUserByUsername,
  getAllUsers,
  createUser,
  updateUser,
  updateUserPassword,
  deleteAllUserSessions,
  deleteUser,
  getUserSettings,
  updateUserSettings,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  addSecurityAuditLog,
  getSecurityAuditLogs,
  getSystemConfig,
  setSystemConfig
} from './server/db.js';
import {
  getClientIp,
  runDummyPasswordVerification,
  validateUsername,
  validatePassword,
  checkLoginAllowed,
  isIpLocked,
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  createRateLimiter,
  securityHeadersMiddleware,
  getSecurityStats,
  unlockIp,
  unlockAccount
} from './server/security.js';
import {
  fetchWebUntisClasses,
  fetchWebUntisTimetable,
  syncTimetables,
  scanFullSemesterForUser,
  getSemesterPeriodInfo,
  getUserTimetable,
  generateIcsCalendar
} from './server/webuntis.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    displayName: string;
    role: 'admin' | 'user';
  };
}

function getNextTopOfTheHour(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  // Ensure target is at least 30 seconds into the future
  if (next.getTime() - now.getTime() < 30 * 1000) {
    next.setHours(next.getHours() + 1);
  }
  return next;
}

let lastSyncTime: string | null = null;
let nextSyncTime: string | null = getNextTopOfTheHour().toISOString();
let isSyncing = false;
let syncTimer: NodeJS.Timeout | null = null;
const sseClients = new Set<Response>();

function broadcastSyncEvent(data: { type: string; lastSync?: string | null; nextSync?: string | null; isSyncing?: boolean }) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security: Trust reverse proxy (Nginx / Cloud Run) for accurate IP resolution
  app.set('trust proxy', 1);

  // Security: HTTP headers hardening
  app.use(securityHeadersMiddleware);

  // Security: Prevent request body payload memory exhaustion attacks
  app.use(express.json({ limit: '1mb' }));

  // Simple Auth Middleware
  const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : (req.query.token as string | undefined);

    if (!sessionToken) {
      res.status(401).json({ error: 'Nicht authentifiziert' });
      return;
    }

    const user = validateSession(sessionToken);
    if (!user) {
      res.status(401).json({ error: 'Sitzung abgelaufen oder ungültig' });
      return;
    }

    req.user = user;
    next();
  };

  const adminMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Nur für Administratoren zugänglich' });
      return;
    }
    next();
  };

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // -------------------------------------------------------------
  // AUTH API (Hardened with Brute-Force & SQL-Injection Protection)
  // -------------------------------------------------------------
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const { username: rawUsername, password: rawPassword } = req.body;

    // 1. Strict Input Validation (Prevents SQL-Injection & malformed inputs before touching DB)
    const userCheck = validateUsername(rawUsername);
    if (!userCheck.valid) {
      addSecurityAuditLog('FAILED_LOGIN', ip, String(rawUsername || ''), 'Input validation rejected: ' + userCheck.error);
      res.status(400).json({ error: userCheck.error || 'Ungültiger Benutzername' });
      return;
    }
    const username = userCheck.value;

    const passCheck = validatePassword(rawPassword);
    if (!passCheck.valid) {
      res.status(400).json({ error: passCheck.error || 'Ungültiges Passwort' });
      return;
    }
    const password = passCheck.value;

    // 2. Strict IP-Level Lockout (Protects server from volumetric abuse)
    const ipLock = isIpLocked(ip);
    if (ipLock.locked) {
      if (ipLock.retryAfterSeconds) {
        res.setHeader('Retry-After', ipLock.retryAfterSeconds.toString());
      }
      res.status(429).json({
        error: ipLock.reason || 'Zugriff von dieser IP-Adresse vorübergehend gesperrt wegen zu vieler Fehlversuche.',
        retryAfter: ipLock.retryAfterSeconds
      });
      return;
    }

    // 3. User Lookup (Secure parameterized query)
    const userWithSecrets = getUserByUsername(username);
    const accountLock = isAccountLocked(username);

    // 4. If account is currently targeted/locked:
    // Only allow access if the caller provides the genuine correct password (owner recovery)
    // If the password is wrong, deny with 429 to prevent further password guessing.
    if (accountLock.locked) {
      if (!userWithSecrets) {
        runDummyPasswordVerification(password);
        res.setHeader('Retry-After', (accountLock.retryAfterSeconds || 900).toString());
        res.status(429).json({
          error: accountLock.reason,
          retryAfter: accountLock.retryAfterSeconds
        });
        return;
      }

      const isRealOwner = verifyPassword(password, userWithSecrets.password_hash, userWithSecrets.salt);
      if (!isRealOwner) {
        recordFailedLogin(ip, username);
        res.setHeader('Retry-After', (accountLock.retryAfterSeconds || 900).toString());
        res.status(429).json({
          error: accountLock.reason,
          retryAfter: accountLock.retryAfterSeconds
        });
        return;
      }

      // Legitimate user authenticated! Clear lockout and proceed
      recordSuccessfulLogin(ip, username);
      const token = createSession(userWithSecrets.id);
      const settings = getUserSettings(userWithSecrets.id);

      res.json({
        token,
        user: {
          id: userWithSecrets.id,
          username: userWithSecrets.username,
          displayName: userWithSecrets.displayName,
          role: userWithSecrets.role
        },
        settings
      });
      return;
    }

    // Timing attack defense: execute constant-time scrypt calculation even if user does not exist!
    if (!userWithSecrets) {
      runDummyPasswordVerification(password);
      const failStatus = recordFailedLogin(ip, username);
      if (failStatus.isLocked) {
        res.setHeader('Retry-After', (failStatus.retryAfterSeconds || 900).toString());
        res.status(429).json({
          error: 'Zu viele Fehlversuche! Das Konto bzw. Ihre IP-Adresse wurde für 15 Minuten gesperrt.',
          retryAfter: failStatus.retryAfterSeconds
        });
        return;
      }
      res.status(401).json({
        error: `Ungültige Anmeldedaten. Noch ${failStatus.remainingAttempts} Versuch(e) verbleibend vor einer temporären Sperre.`
      });
      return;
    }

    // 5. Verify password with constant-time buffer comparison
    const valid = verifyPassword(password, userWithSecrets.password_hash, userWithSecrets.salt);
    if (!valid) {
      const failStatus = recordFailedLogin(ip, username);
      if (failStatus.isLocked) {
        res.setHeader('Retry-After', (failStatus.retryAfterSeconds || 900).toString());
        res.status(429).json({
          error: 'Zu viele Fehlversuche! Das Konto bzw. Ihre IP-Adresse wurde für 15 Minuten gesperrt.',
          retryAfter: failStatus.retryAfterSeconds
        });
        return;
      }
      res.status(401).json({
        error: `Ungültige Anmeldedaten. Noch ${failStatus.remainingAttempts} Versuch(e) verbleibend vor einer temporären Sperre.`
      });
      return;
    }

    // 6. Successful login: Clear fail counter and issue session
    recordSuccessfulLogin(ip, username);
    const token = createSession(userWithSecrets.id);
    const settings = getUserSettings(userWithSecrets.id);

    res.json({
      token,
      user: {
        id: userWithSecrets.id,
        username: userWithSecrets.username,
        displayName: userWithSecrets.displayName,
        role: userWithSecrets.role
      },
      settings
    });
  });

  app.get('/api/auth/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const settings = getUserSettings(req.user!.id);
    res.json({
      user: req.user,
      settings
    });
  });

  app.post('/api/auth/logout', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
    if (sessionToken) {
      deleteSession(sessionToken);
    }
    res.json({ success: true });
  });

  // Password change with rate-limiting and validation
  const passwordChangeLimiter = createRateLimiter({
    maxRequests: 5,
    windowSeconds: 60,
    name: 'Passwort-Änderung'
  });

  const handleChangePassword = (req: AuthenticatedRequest, res: Response) => {
    const ip = getClientIp(req);
    const { oldPassword, newPassword } = req.body;

    const passCheck = validatePassword(newPassword, req.user!.role === 'admin');
    if (!passCheck.valid) {
      res.status(400).json({ error: passCheck.error });
      return;
    }

    const user = getUserByUsername(req.user!.username);
    if (!user || !verifyPassword(oldPassword, user.password_hash, user.salt)) {
      addSecurityAuditLog('FAILED_LOGIN', ip, req.user!.username, 'Failed attempt to change password (wrong current password)');
      res.status(400).json({ error: 'Das aktuelle Passwort ist nicht korrekt' });
      return;
    }

    updateUserPassword(req.user!.id, passCheck.value);
    addSecurityAuditLog('PASSWORD_CHANGED', ip, req.user!.username, 'User updated password successfully');
    res.json({ success: true, message: 'Passwort erfolgreich aktualisiert' });
  };

  app.post('/api/auth/change-password', authMiddleware, passwordChangeLimiter, handleChangePassword);
  app.post('/api/user/change-password', authMiddleware, passwordChangeLimiter, handleChangePassword);

  // -------------------------------------------------------------
  // USER MANAGEMENT (Admin only)
  // -------------------------------------------------------------
  app.get('/api/admin/users', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const users = getAllUsers();
    res.json(users);
  });

  app.post('/api/admin/users', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const ip = getClientIp(req);
    const { username: rawUsername, password: rawPassword, displayName: rawDisplayName, role } = req.body;

    const userCheck = validateUsername(rawUsername);
    if (!userCheck.valid) {
      res.status(400).json({ error: userCheck.error });
      return;
    }
    const username = userCheck.value;

    const passCheck = validatePassword(rawPassword, role === 'admin');
    if (!passCheck.valid) {
      res.status(400).json({ error: passCheck.error });
      return;
    }

    const displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim().substring(0, 60) : '';
    if (!displayName) {
      res.status(400).json({ error: 'Anzeigename muss ausgefüllt sein' });
      return;
    }

    const existing = getUserByUsername(username);
    if (existing) {
      res.status(400).json({ error: 'Benutzername ist bereits vergeben' });
      return;
    }

    const assignedRole = role === 'admin' ? 'admin' : 'user';
    const newUser = createUser(username, passCheck.value, displayName, assignedRole);
    addSecurityAuditLog('ADMIN_ACTION', ip, req.user!.username, `Created new user "${username}" with role "${assignedRole}"`);
    res.status(201).json(newUser);
  });

  // Edit user (change name, username, role, optional password reset, and session invalidation)
  app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const ip = getClientIp(req);
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Ungültige Benutzer-ID' });
      return;
    }

    const targetUser = getUserById(targetUserId);
    if (!targetUser) {
      res.status(404).json({ error: 'Benutzer nicht gefunden' });
      return;
    }

    const { username: rawUsername, displayName: rawDisplayName, role, newPassword, logoutAllSessions } = req.body;

    // Validate username if changing
    let updatedUsername: string | undefined = undefined;
    if (rawUsername !== undefined && rawUsername.trim() !== targetUser.username) {
      const userCheck = validateUsername(rawUsername);
      if (!userCheck.valid) {
        res.status(400).json({ error: userCheck.error });
        return;
      }
      updatedUsername = userCheck.value;
    }

    // Validate displayName if changing
    let updatedDisplayName: string | undefined = undefined;
    if (rawDisplayName !== undefined) {
      if (typeof rawDisplayName !== 'string' || !rawDisplayName.trim()) {
        res.status(400).json({ error: 'Anzeigename darf nicht leer sein' });
        return;
      }
      updatedDisplayName = rawDisplayName.trim().substring(0, 60);
    }

    // Validate role
    let updatedRole: 'admin' | 'user' | undefined = undefined;
    if (role !== undefined) {
      if (role !== 'admin' && role !== 'user') {
        res.status(400).json({ error: 'Ungültige Rolle' });
        return;
      }
      if ((targetUser.username === 'admin' || targetUserId === 1) && role !== 'admin') {
        res.status(403).json({ error: 'Dem primären Administrator kann die Admin-Rolle nicht entzogen werden.' });
        return;
      }
      updatedRole = role;
    }

    // Validate newPassword if provided
    let validatedPassword: string | undefined = undefined;
    if (newPassword && typeof newPassword === 'string' && newPassword.trim().length > 0) {
      const effectiveRole = updatedRole || targetUser.role;
      const passCheck = validatePassword(newPassword, effectiveRole === 'admin');
      if (!passCheck.valid) {
        res.status(400).json({ error: passCheck.error });
        return;
      }
      validatedPassword = passCheck.value;
    }

    try {
      const forceLogout = logoutAllSessions !== undefined 
        ? Boolean(logoutAllSessions) 
        : Boolean(validatedPassword || updatedUsername);

      const updatedUser = updateUser(targetUserId, {
        username: updatedUsername,
        displayName: updatedDisplayName,
        role: updatedRole,
        password: validatedPassword,
        logoutAllSessions: forceLogout
      });

      const auditDetails: string[] = [];
      if (updatedUsername) auditDetails.push(`username -> ${updatedUsername}`);
      if (updatedDisplayName) auditDetails.push(`name -> ${updatedDisplayName}`);
      if (updatedRole) auditDetails.push(`role -> ${updatedRole}`);
      if (validatedPassword) auditDetails.push('password reset');
      if (forceLogout) auditDetails.push('sessions terminated');

      addSecurityAuditLog(
        'ADMIN_ACTION',
        ip,
        req.user!.username,
        `Updated user "${targetUser.username}" (ID: ${targetUserId}): ${auditDetails.join(', ') || 'no changes'}`
      );

      res.json({
        success: true,
        user: updatedUser,
        loggedOutEverywhere: forceLogout,
        message: forceLogout
          ? `Benutzer "${updatedUser.username}" erfolgreich aktualisiert. Alle bestehenden Sitzungen wurden beendet.`
          : `Benutzer "${updatedUser.username}" erfolgreich aktualisiert.`
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Fehler beim Aktualisieren des Benutzers' });
    }
  });

  app.put('/api/admin/users/:id/password', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const ip = getClientIp(req);
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Ungültige Benutzer-ID' });
      return;
    }

    const targetUser = getUserById(targetUserId);
    if (!targetUser) {
      res.status(404).json({ error: 'Benutzer nicht gefunden' });
      return;
    }

    const passCheck = validatePassword(req.body.newPassword, targetUser.role === 'admin');
    if (!passCheck.valid) {
      res.status(400).json({ error: passCheck.error });
      return;
    }

    updateUserPassword(targetUserId, passCheck.value);
    addSecurityAuditLog('ADMIN_ACTION', ip, req.user!.username, `Reset password for user "${targetUser.username}" (ID: ${targetUserId}) & logged out all sessions`);
    res.json({ success: true, message: `Passwort für "${targetUser.username}" zurückgesetzt. Alle aktiven Sitzungen wurden beendet.` });
  });

  app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const ip = getClientIp(req);
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId)) {
      res.status(400).json({ error: 'Ungültige Benutzer-ID' });
      return;
    }

    if (targetUserId === req.user!.id) {
      res.status(400).json({ error: 'Sie können Ihren eigenen Benutzer nicht löschen' });
      return;
    }

    const targetUser = getUserById(targetUserId);
    if (!targetUser) {
      res.status(404).json({ error: 'Benutzer nicht gefunden' });
      return;
    }

    // Security: Protect primary admin account from deletion
    if (targetUserId === 1 || targetUser.username === 'admin') {
      res.status(403).json({ error: 'Der primäre Administratoraccount ("admin") kann aus Sicherheitsgründen nicht gelöscht werden' });
      return;
    }

    deleteUser(targetUserId);
    addSecurityAuditLog('ADMIN_ACTION', ip, req.user!.username, `Deleted user "${targetUser.username}" (ID: ${targetUserId})`);
    res.json({ success: true, message: 'Benutzer gelöscht' });
  });

  // -------------------------------------------------------------
  // ADMIN SECURITY AUDIT & LOCKOUT MANAGEMENT
  // -------------------------------------------------------------
  app.get('/api/admin/security/status', authMiddleware, adminMiddleware, (_req: AuthenticatedRequest, res: Response) => {
    const stats = getSecurityStats();
    const logs = getSecurityAuditLogs(100);
    res.json({ stats, logs });
  });

  app.post('/api/admin/security/unlock-ip', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const { ip } = req.body;
    if (!ip || typeof ip !== 'string') {
      res.status(400).json({ error: 'IP-Adresse erforderlich' });
      return;
    }
    const unlocked = unlockIp(ip.trim());
    res.json({ success: true, message: `IP ${ip} wurde entsperrt`, unlocked });
  });

  app.post('/api/admin/security/unlock-account', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const { account } = req.body;
    if (!account || typeof account !== 'string') {
      res.status(400).json({ error: 'Benutzername erforderlich' });
      return;
    }
    const unlocked = unlockAccount(account.trim());
    res.json({ success: true, message: `Konto ${account} wurde entsperrt`, unlocked });
  });

  // -------------------------------------------------------------
  // WEBUNTIS CLASSES & CATALOG
  // -------------------------------------------------------------
  app.get('/api/webuntis/classes', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const settings = getUserSettings(req.user!.id);
      const schoolName = (req.query.school as string) || settings.schoolName;
      const serverUrl = (req.query.server as string) || settings.serverUrl;
      const targetDate = req.query.date as string | undefined;

      const classes = await fetchWebUntisClasses(schoolName, serverUrl, targetDate);
      res.json(classes);
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Abrufen der WebUntis Klassen', details: err.message });
    }
  });

  // -------------------------------------------------------------
  // PERSONAL TIMETABLE & FILTER
  // -------------------------------------------------------------
  app.get('/api/timetable/my', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const fromDate = req.query.from as string | undefined;
      const toDate = req.query.to as string | undefined;
      const refresh = req.query.refresh === 'true';

      // If page is reloaded or user specifically requests a refresh, sync for this user only
      if (refresh) {
        try {
          await syncTimetables({ forceUserId: req.user!.id, fullSemester: false });
        } catch (syncErr: any) {
          console.warn(`[UserSync] Sync on reload for user ${req.user!.id} warning:`, syncErr.message);
        }
      }

      const result = getUserTimetable(req.user!.id, { fromDate, toDate });
      const settings = getUserSettings(req.user!.id);

      res.json({
        ...result,
        settings
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Laden des Stundenplans', details: err.message });
    }
  });

  app.post('/api/user/classes', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { classes, schoolName, serverUrl } = req.body;
      if (!Array.isArray(classes)) {
        res.status(400).json({ error: 'classes muss ein Array sein' });
        return;
      }

      const updated = updateUserSettings(req.user!.id, {
        selectedClasses: classes,
        schoolName: schoolName || undefined,
        serverUrl: serverUrl || undefined
      });

      // Synchronize full semester for newly added uncached classes only, so subject list updates automatically & fast
      if (classes.length > 0) {
        try {
          await scanFullSemesterForUser(req.user!.id, { onlyUncachedClasses: true });
        } catch (e: any) {
          console.error('[SemesterScan] Auto-scan on class update warning:', e.message);
        }
      }

      const timetable = getUserTimetable(req.user!.id);
      res.json({ success: true, settings: updated, timetable });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Speichern der Klassen', details: err.message });
    }
  });

  app.post('/api/user/filter-subjects', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { excludedSubjects } = req.body;
      if (!Array.isArray(excludedSubjects)) {
        res.status(400).json({ error: 'excludedSubjects muss ein Array sein' });
        return;
      }

      const updated = updateUserSettings(req.user!.id, { excludedSubjects });
      const timetable = getUserTimetable(req.user!.id);
      res.json({ success: true, settings: updated, timetable });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Speichern des Fächerfilters', details: err.message });
    }
  });

  app.post('/api/user/hybrid-subjects', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { hybridSubjects } = req.body;
      if (!Array.isArray(hybridSubjects)) {
        res.status(400).json({ error: 'hybridSubjects muss ein Array sein' });
        return;
      }

      const updated = updateUserSettings(req.user!.id, { hybridSubjects });
      const timetable = getUserTimetable(req.user!.id);
      res.json({ success: true, settings: updated, timetable });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Speichern der Hybrid-Fächer', details: err.message });
    }
  });

  // Full semester scan: fetch and aggregate subjects across all ~23 weeks
  app.post('/api/timetable/scan-semester', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (isSyncing) {
        res.status(429).json({ error: 'Synchronisation oder Scan läuft bereits' });
        return;
      }

      isSyncing = true;
      broadcastSyncEvent({ type: 'sync_started', isSyncing: true, nextSync: nextSyncTime });

      const scanSummary = await scanFullSemesterForUser(req.user!.id);
      lastSyncTime = new Date().toISOString();
      nextSyncTime = getNextTopOfTheHour().toISOString();
      isSyncing = false;

      broadcastSyncEvent({
        type: 'sync_completed',
        isSyncing: false,
        lastSync: lastSyncTime,
        nextSync: nextSyncTime
      });

      const timetable = getUserTimetable(req.user!.id);
      res.json({
        success: true,
        scanSummary,
        timetable
      });
    } catch (err: any) {
      isSyncing = false;
      broadcastSyncEvent({
        type: 'sync_error',
        isSyncing: false,
        lastSync: lastSyncTime,
        nextSync: nextSyncTime
      });
      res.status(500).json({ error: 'Semester-Scan fehlgeschlagen', details: err.message });
    }
  });

  app.post('/api/timetable/sync-now', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Nur Administratoren können eine manuelle Synchronisation für alle Benutzer auslösen' });
        return;
      }

      if (isSyncing) {
        res.status(429).json({ error: 'Synchronisation läuft bereits' });
        return;
      }

      isSyncing = true;
      broadcastSyncEvent({ type: 'sync_started', isSyncing: true, nextSync: nextSyncTime });

      const result = await syncTimetables();
      lastSyncTime = new Date().toISOString();
      nextSyncTime = getNextTopOfTheHour().toISOString();
      isSyncing = false;

      broadcastSyncEvent({
        type: 'sync_completed',
        isSyncing: false,
        lastSync: lastSyncTime,
        nextSync: nextSyncTime
      });

      const timetable = getUserTimetable(req.user!.id);
      res.json({
        success: true,
        summary: result,
        timetable
      });
    } catch (err: any) {
      isSyncing = false;
      broadcastSyncEvent({
        type: 'sync_error',
        isSyncing: false,
        lastSync: lastSyncTime,
        nextSync: nextSyncTime
      });
      res.status(500).json({ error: 'Synchronisation fehlgeschlagen', details: err.message });
    }
  });

  // -------------------------------------------------------------
  // NOTIFICATIONS API
  // -------------------------------------------------------------
  app.get('/api/notifications', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const notifications = getUserNotifications(req.user!.id, 100);
      res.json(notifications || []);
    } catch (err: any) {
      console.error('Error fetching notifications:', err.message);
      res.status(500).json({ error: 'Fehler beim Laden der Benachrichtigungen' });
    }
  });

  app.post('/api/notifications/:id/read', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      markNotificationAsRead(id, req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Aktualisieren der Benachrichtigung' });
    }
  });

  app.post('/api/notifications/read-all', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      markAllNotificationsAsRead(req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Aktualisieren der Benachrichtigungen' });
    }
  });

  app.delete('/api/notifications/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      deleteNotification(id, req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Löschen der Benachrichtigung' });
    }
  });

  // -------------------------------------------------------------
  // CALENDAR EXPORT & LIVE SUBSCRIPTION (iCal / .ics)
  // -------------------------------------------------------------
  app.get('/api/calendar/export.ics', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const timetable = getUserTimetable(req.user!.id);
      const ics = generateIcsCalendar(timetable.lessons, `Stundenplan - ${req.user!.displayName}`);

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="stundenplan_${req.user!.username}.ics"`);
      res.send(ics);
    } catch (err: any) {
      res.status(500).send('Fehler beim Generieren des Kalenders');
    }
  });

  // Public Webcal subscription feed using private token (supports .ics extension, without extension, or query param)
  const handleCalendarFeed = (req: Request, res: Response) => {
    try {
      let rawToken = req.params.token || (req.query.token as string) || '';
      if (!rawToken) {
        res.status(400).send('Kalender-Token fehlt');
        return;
      }

      // Strip trailing .ics if passed in param
      const token = rawToken.replace(/\.ics$/i, '').trim();

      const row = db.prepare('SELECT user_id, updated_at FROM user_settings WHERE calendar_token = ?').get(token) as { user_id: number; updated_at?: string } | undefined;

      if (!row) {
        res.status(404).send('Ungültiger Kalender-Token');
        return;
      }

      const user = getUserById(row.user_id);
      const timetable = getUserTimetable(row.user_id);

      const lastModifiedDate = row.updated_at ? new Date(row.updated_at) : new Date();
      // Calculate a stable sequence number based on updated_at timestamp (in minutes) so clients detect changes
      const sequence = Math.floor(lastModifiedDate.getTime() / 60000);

      const ics = generateIcsCalendar(
        timetable.lessons,
        `Stundenplan - ${user?.displayName || 'Mein-Stundenplan'}`,
        { sequence, lastModified: lastModifiedDate }
      );

      // Create ETag from user settings updated_at and lesson count
      const etag = `W/"${lastModifiedDate.getTime()}-${timetable.lessons.length}"`;

      // Essential headers for Apple Calendar, Google Calendar, Outlook, Thunderbird
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('ETag', etag);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Content-Disposition', `inline; filename="stundenplan_${user?.username || 'feed'}.ics"`);

      if (row.updated_at) {
        res.setHeader('Last-Modified', lastModifiedDate.toUTCString());
      }

      if (req.method === 'HEAD') {
        res.status(200).end();
        return;
      }

      res.send(ics);
    } catch (err: any) {
      console.error('Error serving calendar feed:', err);
      res.status(500).send('Fehler beim Abrufen des Kalender-Feeds');
    }
  };

  app.all('/api/calendar/feed/:token.ics', handleCalendarFeed);
  app.all('/api/calendar/feed/:token', handleCalendarFeed);
  app.all('/api/calendar/feed', handleCalendarFeed);

  // -------------------------------------------------------------
  // SYSTEM CONFIG & CUSTOM DOMAIN URL (For Calendar Feeds & Reverse Proxies)
  // -------------------------------------------------------------
  app.get('/api/system/config', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
    try {
      const customDomain = getSystemConfig('custom_public_url', process.env.APP_URL || '');
      res.json({
        customPublicUrl: customDomain
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Abrufen der Konfiguration' });
    }
  });

  app.post('/api/system/config', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { customPublicUrl } = req.body;
      let cleanUrl = typeof customPublicUrl === 'string' ? customPublicUrl.trim() : '';

      if (cleanUrl) {
        // Normalize: remove trailing slash
        cleanUrl = cleanUrl.replace(/\/+$/, '');
        // Validate protocol
        if (!/^https?:\/\//i.test(cleanUrl)) {
          cleanUrl = `https://${cleanUrl}`;
        }
      }

      setSystemConfig('custom_public_url', cleanUrl);
      addSecurityAuditLog('ADMIN_ACTION', getClientIp(req), req.user!.username, `Updated custom server URL to: "${cleanUrl}"`);

      res.json({
        success: true,
        customPublicUrl: cleanUrl,
        message: 'Server-Domain erfolgreich gespeichert'
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Fehler beim Speichern der Server-Domain' });
    }
  });

  // -------------------------------------------------------------
  // SYSTEM & SYNC STATUS
  // -------------------------------------------------------------
  app.get('/api/system/status', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    try {
      const history = db.prepare('SELECT * FROM sync_history ORDER BY id DESC LIMIT 5').all();
      const periodCount = db.prepare('SELECT COUNT(*) as count FROM cached_periods').get() as { count: number } | undefined;
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number } | undefined;

      res.json({
        lastSync: lastSyncTime,
        nextSync: nextSyncTime,
        isSyncing,
        stats: {
          totalCachedLessons: periodCount?.count || 0,
          totalUsers: userCount?.count || 0
        },
        recentSyncs: history || []
      });
    } catch (err: any) {
      console.error('Error fetching system status:', err.message);
      res.status(500).json({ error: 'Fehler beim Abrufen des Systemstatus' });
    }
  });

  // -------------------------------------------------------------
  // REAL-TIME SYSTEM EVENTS (SSE for all active users/tabs)
  // -------------------------------------------------------------
  app.get('/api/system/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);

    // Initial state sent immediately upon connecting
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      lastSync: lastSyncTime,
      nextSync: nextSyncTime,
      isSyncing
    })}\n\n`);

    // Keep-alive heartbeat every 25 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // -------------------------------------------------------------
  // SCHEDULED HOURLY SYNC BACKGROUND JOB (Always at the top of the hour :00)
  // -------------------------------------------------------------
  const runScheduledSync = async () => {
    if (isSyncing) return;
    try {
      isSyncing = true;
      broadcastSyncEvent({ type: 'sync_started', isSyncing: true, nextSync: nextSyncTime });
      console.log(`[Scheduler] Top-of-the-hour sync running at ${new Date().toISOString()}...`);
      await syncTimetables();
      lastSyncTime = new Date().toISOString();
      nextSyncTime = getNextTopOfTheHour().toISOString();
      console.log(`[Scheduler] Hourly sync finished. Next sync scheduled for: ${nextSyncTime}`);
      broadcastSyncEvent({
        type: 'sync_completed',
        isSyncing: false,
        lastSync: lastSyncTime,
        nextSync: nextSyncTime
      });
    } catch (err: any) {
      console.error('[Scheduler] Error in hourly background sync:', err.message);
      broadcastSyncEvent({
        type: 'sync_error',
        isSyncing: false,
        lastSync: lastSyncTime,
        nextSync: nextSyncTime
      });
    } finally {
      isSyncing = false;
    }
  };

  function scheduleNextHourlySync() {
    const next = getNextTopOfTheHour();
    nextSyncTime = next.toISOString();
    const delay = Math.max(1000, next.getTime() - Date.now());
    console.log(`[Scheduler] Next top-of-the-hour sync set for ${nextSyncTime} (in ${Math.round(delay / 60000)} minutes)`);

    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      await runScheduledSync();
      scheduleNextHourlySync();
    }, delay);
  }

  // Schedule next top-of-the-hour sync
  scheduleNextHourlySync();

  // Run initial sync shortly after startup (after 5 seconds)
  setTimeout(() => {
    runScheduledSync();
  }, 5000);

  // -------------------------------------------------------------
  // VITE MIDDLEWARE (Development) vs STATIC SERVING (Production)
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mein-Stundenplan Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
