import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { User, UserSettings, NotificationItem } from '../src/types.js';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'stundenplan.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    school_name TEXT NOT NULL DEFAULT 'hs-albstadt',
    server_url TEXT NOT NULL DEFAULT 'https://hs-albstadt.webuntis.com',
    selected_classes TEXT NOT NULL DEFAULT '[]',
    excluded_subjects TEXT NOT NULL DEFAULT '[]',
    hybrid_subjects TEXT NOT NULL DEFAULT '[]',
    calendar_token TEXT UNIQUE NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cached_periods (
    period_id INTEGER NOT NULL,
    school_name TEXT NOT NULL,
    class_id INTEGER NOT NULL,
    lesson_id INTEGER,
    date INTEGER NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    subject_id INTEGER,
    subject_name TEXT,
    subject_long_name TEXT,
    room_id INTEGER,
    room_name TEXT,
    room_long_name TEXT,
    teacher_id INTEGER,
    teacher_name TEXT,
    cell_state TEXT,
    is_cancelled INTEGER DEFAULT 0,
    raw_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (period_id, class_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    lesson_name TEXT,
    old_value TEXT,
    new_value TEXT,
    date TEXT,
    start_time TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL,
    classes_count INTEGER DEFAULT 0,
    periods_count INTEGER DEFAULT 0,
    changes_count INTEGER DEFAULT 0,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS active_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS security_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    username TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe column migrations for existing SQLite database
try {
  db.exec("ALTER TABLE user_settings ADD COLUMN hybrid_subjects TEXT NOT NULL DEFAULT '[]'");
} catch (e) {
  // column already exists
}

// System Config Helpers
export function getSystemConfig(key: string, defaultValue = ''): string {
  try {
    const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setSystemConfig(key: string, value: string): void {
  try {
    db.prepare(`
      INSERT INTO system_config (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  } catch (err: any) {
    console.error('[SystemConfig] Failed to set config:', key, err.message);
  }
}

// Password hashing utilities
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(checkHash, 'hex'), Buffer.from(hash, 'hex'));
}

// Ensure default admin user exists
const adminCheck = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminCheck) {
  const { hash, salt } = hashPassword('admin123');
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, salt, display_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', hash, salt, 'Administrator', 'admin');

  const userId = insertUser.lastInsertRowid as number;
  const token = crypto.randomBytes(24).toString('hex');

  // Prepopulate with Albstadt defaults and ITS-1 class as default sample
  const defaultClasses = JSON.stringify([
    { id: 6376, name: 'ITS-1', longName: 'IT-Security 1. Semester' }
  ]);

  db.prepare(`
    INSERT INTO user_settings (user_id, school_name, server_url, selected_classes, excluded_subjects, calendar_token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, 'hs-albstadt', 'https://hs-albstadt.webuntis.com', defaultClasses, '[]', token);

  console.log('[Database] Default admin user initialized: admin / admin123');
}

// User Helpers
export function getUserById(id: number): User | null {
  const row = db.prepare('SELECT id, username, display_name as displayName, role, created_at as createdAt FROM users WHERE id = ?').get(id) as User | undefined;
  return row || null;
}

export function getUserByUsername(username: string): (User & { password_hash: string; salt: string }) | null {
  const row = db.prepare('SELECT id, username, display_name as displayName, role, created_at as createdAt, password_hash, salt FROM users WHERE username = ?').get(username) as any;
  return row || null;
}

export function getAllUsers(): User[] {
  return db.prepare('SELECT id, username, display_name as displayName, role, created_at as createdAt FROM users ORDER BY id ASC').all() as User[];
}

export function createUser(username: string, password: string, displayName: string, role: 'admin' | 'user' = 'user'): User {
  const { hash, salt } = hashPassword(password);
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, salt, display_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, hash, salt, displayName, role);

  const userId = info.lastInsertRowid as number;
  const calendarToken = crypto.randomBytes(24).toString('hex');

  db.prepare(`
    INSERT INTO user_settings (user_id, school_name, server_url, selected_classes, excluded_subjects, calendar_token)
    VALUES (?, 'hs-albstadt', 'https://hs-albstadt.webuntis.com', '[]', '[]', ?)
  `).run(userId, calendarToken);

  return {
    id: userId,
    username,
    displayName,
    role,
    createdAt: new Date().toISOString()
  };
}

export function deleteAllUserSessions(userId: number): void {
  try {
    db.prepare('DELETE FROM active_sessions WHERE user_id = ?').run(userId);
  } catch (err: any) {
    console.error('[Database] Failed to delete active sessions for user:', userId, err.message);
  }
}

export function updateUserPassword(userId: number, newPassword: string): void {
  const { hash, salt } = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId);
  deleteAllUserSessions(userId);
}

export function updateUser(
  userId: number,
  updates: {
    username?: string;
    displayName?: string;
    role?: 'admin' | 'user';
    password?: string;
    logoutAllSessions?: boolean;
  }
): User {
  const current = getUserById(userId);
  if (!current) {
    throw new Error('Benutzer nicht gefunden.');
  }

  let shouldLogoutAll = Boolean(updates.logoutAllSessions);

  // Check and update username
  if (updates.username && updates.username.trim() !== current.username) {
    const trimmedUsername = updates.username.trim();
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(trimmedUsername, userId);
    if (existing) {
      throw new Error(`Der Benutzername "${trimmedUsername}" ist bereits vergeben.`);
    }
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(trimmedUsername, userId);
    shouldLogoutAll = true;
  }

  // Check and update displayName
  if (updates.displayName !== undefined) {
    const trimmedDisplayName = updates.displayName.trim();
    if (!trimmedDisplayName) {
      throw new Error('Anzeigename darf nicht leer sein.');
    }
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(trimmedDisplayName, userId);
  }

  // Check and update role
  if (updates.role && (updates.role === 'admin' || updates.role === 'user')) {
    if ((current.username === 'admin' || current.id === 1) && updates.role !== 'admin') {
      throw new Error('Die Administrator-Rolle des primären Admins kann nicht entzogen werden.');
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(updates.role, userId);
  }

  // Check and update password
  if (updates.password && updates.password.trim()) {
    const { hash, salt } = hashPassword(updates.password.trim());
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId);
    shouldLogoutAll = true;
  }

  // Invalidate all active sessions if requested or if credentials changed
  if (shouldLogoutAll) {
    deleteAllUserSessions(userId);
  }

  return getUserById(userId)!;
}

export function deleteUser(userId: number): void {
  deleteAllUserSessions(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

// Settings Helpers
export function getUserSettings(userId: number): UserSettings {
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;
  if (!row) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare(`
      INSERT INTO user_settings (user_id, school_name, server_url, selected_classes, excluded_subjects, calendar_token)
      VALUES (?, 'hs-albstadt', 'https://hs-albstadt.webuntis.com', '[]', '[]', ?)
    `).run(userId, token);
    return {
      userId,
      schoolName: 'hs-albstadt',
      serverUrl: 'https://hs-albstadt.webuntis.com',
      selectedClasses: [],
      excludedSubjects: [],
      calendarToken: token,
      updatedAt: new Date().toISOString()
    };
  }

  let selectedClasses = [];
  try {
    selectedClasses = JSON.parse(row.selected_classes);
  } catch (e) {
    selectedClasses = [];
  }

  let excludedSubjects = [];
  try {
    excludedSubjects = JSON.parse(row.excluded_subjects);
  } catch (e) {
    excludedSubjects = [];
  }

  let hybridSubjects: string[] = [];
  try {
    hybridSubjects = row.hybrid_subjects ? JSON.parse(row.hybrid_subjects) : [];
  } catch (e) {
    hybridSubjects = [];
  }

  return {
    userId: row.user_id,
    schoolName: row.school_name,
    serverUrl: row.server_url,
    selectedClasses,
    excludedSubjects,
    hybridSubjects,
    calendarToken: row.calendar_token,
    updatedAt: row.updated_at
  };
}

export function updateUserSettings(
  userId: number,
  updates: Partial<Pick<UserSettings, 'schoolName' | 'serverUrl' | 'selectedClasses' | 'excludedSubjects' | 'hybridSubjects'>>
): UserSettings {
  const current = getUserSettings(userId);
  const schoolName = updates.schoolName ?? current.schoolName;
  const serverUrl = updates.serverUrl ?? current.serverUrl;
  const selectedClasses = JSON.stringify(updates.selectedClasses ?? current.selectedClasses);
  const excludedSubjects = JSON.stringify(updates.excludedSubjects ?? current.excludedSubjects);
  const hybridSubjects = JSON.stringify(updates.hybridSubjects ?? current.hybridSubjects ?? []);

  db.prepare(`
    UPDATE user_settings
    SET school_name = ?, server_url = ?, selected_classes = ?, excluded_subjects = ?, hybrid_subjects = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(schoolName, serverUrl, selectedClasses, excludedSubjects, hybridSubjects, userId);

  return getUserSettings(userId);
}

// Session Helpers
export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  db.prepare('INSERT INTO active_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

export function validateSession(token: string): User | null {
  const row = db.prepare(`
    SELECT u.id, u.username, u.display_name as displayName, u.role, u.created_at as createdAt, s.expires_at
    FROM active_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) as (User & { expires_at: string }) | undefined;

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM active_sessions WHERE token = ?').run(token);
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt
  };
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM active_sessions WHERE token = ?').run(token);
}

// Notifications Helpers
export function addNotification(
  userId: number,
  notification: Omit<NotificationItem, 'id' | 'userId' | 'createdAt' | 'isRead'>
): void {
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, lesson_name, old_value, new_value, date, start_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    notification.type,
    notification.title,
    notification.message,
    notification.lessonName,
    notification.oldValue || null,
    notification.newValue || null,
    notification.date,
    notification.startTime
  );
}

export function getUserNotifications(userId: number, limit = 50): NotificationItem[] {
  const rows = db.prepare(`
    SELECT id, user_id as userId, type, title, message, lesson_name as lessonName,
           old_value as oldValue, new_value as newValue, date, start_time as startTime,
           is_read = 1 as isRead, created_at as createdAt
    FROM notifications
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, limit) as any[];

  return rows.map(r => ({ ...r, isRead: Boolean(r.isRead) }));
}

export function markNotificationAsRead(id: number, userId: number): void {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
}

export function markAllNotificationsAsRead(userId: number): void {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
}

export function deleteNotification(id: number, userId: number): void {
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId);
}

// Security Audit Log Helpers
export function addSecurityAuditLog(
  eventType: 'FAILED_LOGIN' | 'SUCCESSFUL_LOGIN' | 'IP_LOCKED' | 'ACCOUNT_LOCKED' | 'PASSWORD_CHANGED' | 'ADMIN_ACTION',
  ipAddress: string,
  username?: string,
  details?: string
): void {
  try {
    db.prepare(`
      INSERT INTO security_audit_logs (event_type, ip_address, username, details)
      VALUES (?, ?, ?, ?)
    `).run(eventType, ipAddress, username || null, details || null);
  } catch (err: any) {
    console.error('[SecurityAudit] Failed to record log:', err.message);
  }
}

export function getSecurityAuditLogs(limit = 100): Array<{
  id: number;
  eventType: string;
  ipAddress: string;
  username: string | null;
  details: string | null;
  createdAt: string;
}> {
  try {
    const rows = db.prepare(`
      SELECT id, event_type as eventType, ip_address as ipAddress, username, details, created_at as createdAt
      FROM security_audit_logs
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as any[];
    return rows;
  } catch {
    return [];
  }
}
