import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { addSecurityAuditLog } from './db.js';

// -------------------------------------------------------------
// CONFIGURATION FOR BRUTE-FORCE PROTECTION & RATE LIMITING
// -------------------------------------------------------------
export const SECURITY_CONFIG = {
  // Max failed login attempts before locking
  MAX_FAILED_LOGINS_PER_IP: 5,
  MAX_FAILED_LOGINS_PER_ACCOUNT: 5,

  // Lockout duration in milliseconds (15 minutes)
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,

  // Sliding window to count failed attempts (15 minutes)
  ATTEMPT_WINDOW_MS: 15 * 60 * 1000,

  // Minimum password length
  MIN_PASSWORD_LENGTH: 4,
  MIN_ADMIN_PASSWORD_LENGTH: 6,

  // Max input lengths to prevent memory / ReDoS attacks
  MAX_USERNAME_LENGTH: 50,
  MAX_PASSWORD_LENGTH: 256,
};

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  lockedUntil?: number;
}

// In-memory rate limiting state
const ipFailedAttempts = new Map<string, AttemptRecord>();
const accountFailedAttempts = new Map<string, AttemptRecord>();
const genericRateLimits = new Map<string, { count: number; windowStart: number }>();

// Pre-computed dummy salt and hash for constant-time dummy verification
const DUMMY_SALT = '0123456789abcdef0123456789abcdef';
const DUMMY_HASH = crypto.scryptSync('dummy-password-check', DUMMY_SALT, 64).toString('hex');

// Periodic cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();

  for (const [ip, record] of ipFailedAttempts.entries()) {
    if ((record.lockedUntil && record.lockedUntil < now) || (now - record.lastAttemptAt > SECURITY_CONFIG.ATTEMPT_WINDOW_MS)) {
      ipFailedAttempts.delete(ip);
    }
  }

  for (const [account, record] of accountFailedAttempts.entries()) {
    if ((record.lockedUntil && record.lockedUntil < now) || (now - record.lastAttemptAt > SECURITY_CONFIG.ATTEMPT_WINDOW_MS)) {
      accountFailedAttempts.delete(account);
    }
  }

  for (const [key, record] of genericRateLimits.entries()) {
    if (now - record.windowStart > 60000) {
      genericRateLimits.delete(key);
    }
  }
}, 10 * 60 * 1000);

// -------------------------------------------------------------
// UTILITIES: IP EXTRACTION & TIME
// -------------------------------------------------------------
export function getClientIp(req: Request): string {
  // Trust proxy first IP if present (e.g. behind Nginx or Cloud Run proxy)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp && !firstIp.startsWith('127.0.0.1') && !firstIp.startsWith('::1')) {
      return firstIp;
    }
    if (firstIp) return firstIp;
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

// -------------------------------------------------------------
// TIMING ATTACK DEFENSE
// -------------------------------------------------------------
export function runDummyPasswordVerification(password: string): void {
  try {
    const dummyCheck = crypto.scryptSync(password || 'dummy', DUMMY_SALT, 64).toString('hex');
    crypto.timingSafeEqual(Buffer.from(dummyCheck, 'hex'), Buffer.from(DUMMY_HASH, 'hex'));
  } catch {
    // Ignore
  }
}

// -------------------------------------------------------------
// INPUT VALIDATION & SQL INJECTION SANITIZATION
// -------------------------------------------------------------
const USERNAME_REGEX = /^[a-zA-Z0-9_.@\-]{2,50}$/;

export function validateUsername(username: unknown): { valid: boolean; value: string; error?: string } {
  if (typeof username !== 'string') {
    return { valid: false, value: '', error: 'Benutzername muss eine gültige Zeichenkette sein' };
  }

  const trimmed = username.trim();
  if (trimmed.length < 2) {
    return { valid: false, value: '', error: 'Benutzername muss mindestens 2 Zeichen lang sein' };
  }

  if (trimmed.length > SECURITY_CONFIG.MAX_USERNAME_LENGTH) {
    return { valid: false, value: '', error: `Benutzername darf maximal ${SECURITY_CONFIG.MAX_USERNAME_LENGTH} Zeichen lang sein` };
  }

  if (!USERNAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      value: '',
      error: 'Benutzername darf nur Buchstaben, Zahlen sowie die Zeichen . _ - @ enthalten (keine Leerzeichen oder Sonderzeichen)'
    };
  }

  return { valid: true, value: trimmed.toLowerCase() };
}

export function validatePassword(password: unknown, isAdminUser = false): { valid: boolean; value: string; error?: string } {
  if (typeof password !== 'string') {
    return { valid: false, value: '', error: 'Passwort muss angegeben werden' };
  }

  const minLength = isAdminUser ? SECURITY_CONFIG.MIN_ADMIN_PASSWORD_LENGTH : SECURITY_CONFIG.MIN_PASSWORD_LENGTH;
  if (password.length < minLength) {
    return { valid: false, value: '', error: `Das Passwort muss mindestens ${minLength} Zeichen lang sein` };
  }

  if (password.length > SECURITY_CONFIG.MAX_PASSWORD_LENGTH) {
    return { valid: false, value: '', error: `Das Passwort darf maximal ${SECURITY_CONFIG.MAX_PASSWORD_LENGTH} Zeichen lang sein` };
  }

  return { valid: true, value: password };
}

// -------------------------------------------------------------
// BRUTE-FORCE & TIMEOUT MANAGEMENT
// -------------------------------------------------------------
export interface LoginCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
  reason?: string;
}

export function isIpLocked(ip: string): { locked: boolean; retryAfterSeconds?: number; reason?: string } {
  const now = Date.now();
  const ipRecord = ipFailedAttempts.get(ip);
  if (ipRecord && ipRecord.lockedUntil && ipRecord.lockedUntil > now) {
    const retryAfter = Math.ceil((ipRecord.lockedUntil - now) / 1000);
    const minutesLeft = Math.ceil(retryAfter / 60);
    return {
      locked: true,
      retryAfterSeconds: retryAfter,
      reason: `Zu viele fehlgeschlagene Versuche von dieser IP-Adresse (${ip}). Vorübergehend gesperrt. Bitte versuchen Sie es in ${minutesLeft} Minute(n) erneut.`
    };
  }
  return { locked: false };
}

export function isAccountLocked(normalizedUsername: string): { locked: boolean; retryAfterSeconds?: number; reason?: string } {
  const now = Date.now();
  const accountRecord = accountFailedAttempts.get(normalizedUsername);
  if (accountRecord && accountRecord.lockedUntil && accountRecord.lockedUntil > now) {
    const retryAfter = Math.ceil((accountRecord.lockedUntil - now) / 1000);
    const minutesLeft = Math.ceil(retryAfter / 60);
    return {
      locked: true,
      retryAfterSeconds: retryAfter,
      reason: `Zu viele fehlgeschlagene Versuche für das Konto "${normalizedUsername}". Das Konto ist zum Schutz vor Brute-Force-Angriffen für ${minutesLeft} Minute(n) gesperrt.`
    };
  }
  return { locked: false };
}

export function checkLoginAllowed(ip: string, normalizedUsername: string): LoginCheckResult {
  const now = Date.now();

  // 1. Check IP-based lockout
  const ipStatus = isIpLocked(ip);
  if (ipStatus.locked) {
    return {
      allowed: false,
      retryAfterSeconds: ipStatus.retryAfterSeconds,
      reason: ipStatus.reason
    };
  }

  // 2. Check Account-targeted lockout
  const accountStatus = isAccountLocked(normalizedUsername);
  if (accountStatus.locked) {
    return {
      allowed: false,
      retryAfterSeconds: accountStatus.retryAfterSeconds,
      reason: accountStatus.reason
    };
  }

  const ipRecord = ipFailedAttempts.get(ip);
  const accountRecord = accountFailedAttempts.get(normalizedUsername);
  const attemptsMadeByIp = ipRecord && (now - ipRecord.firstAttemptAt < SECURITY_CONFIG.ATTEMPT_WINDOW_MS) ? ipRecord.count : 0;
  const attemptsMadeByAccount = accountRecord && (now - accountRecord.firstAttemptAt < SECURITY_CONFIG.ATTEMPT_WINDOW_MS) ? accountRecord.count : 0;
  const worstCount = Math.max(attemptsMadeByIp, attemptsMadeByAccount);
  const remainingAttempts = Math.max(0, SECURITY_CONFIG.MAX_FAILED_LOGINS_PER_IP - worstCount);

  return {
    allowed: true,
    remainingAttempts
  };
}

export function recordFailedLogin(ip: string, normalizedUsername: string): {
  isLocked: boolean;
  retryAfterSeconds?: number;
  remainingAttempts: number;
} {
  const now = Date.now();

  // Record IP attempt
  let ipRecord = ipFailedAttempts.get(ip);
  if (!ipRecord || (now - ipRecord.lastAttemptAt > SECURITY_CONFIG.ATTEMPT_WINDOW_MS)) {
    ipRecord = { count: 1, firstAttemptAt: now, lastAttemptAt: now };
  } else {
    ipRecord.count += 1;
    ipRecord.lastAttemptAt = now;
  }

  // Record Account attempt
  let accountRecord = accountFailedAttempts.get(normalizedUsername);
  if (!accountRecord || (now - accountRecord.lastAttemptAt > SECURITY_CONFIG.ATTEMPT_WINDOW_MS)) {
    accountRecord = { count: 1, firstAttemptAt: now, lastAttemptAt: now };
  } else {
    accountRecord.count += 1;
    accountRecord.lastAttemptAt = now;
  }

  let isLocked = false;
  let retryAfterSeconds: number | undefined;

  // Lock IP if limit exceeded
  if (ipRecord.count >= SECURITY_CONFIG.MAX_FAILED_LOGINS_PER_IP) {
    ipRecord.lockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION_MS;
    isLocked = true;
    retryAfterSeconds = Math.ceil(SECURITY_CONFIG.LOCKOUT_DURATION_MS / 1000);
    addSecurityAuditLog('IP_LOCKED', ip, normalizedUsername, `IP locked for 15 min after ${ipRecord.count} failed attempts`);
  }

  // Lock Account if limit exceeded
  if (accountRecord.count >= SECURITY_CONFIG.MAX_FAILED_LOGINS_PER_ACCOUNT) {
    accountRecord.lockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION_MS;
    isLocked = true;
    retryAfterSeconds = Math.ceil(SECURITY_CONFIG.LOCKOUT_DURATION_MS / 1000);
    addSecurityAuditLog('ACCOUNT_LOCKED', ip, normalizedUsername, `Account locked for 15 min after ${accountRecord.count} failed attempts`);
  }

  ipFailedAttempts.set(ip, ipRecord);
  accountFailedAttempts.set(normalizedUsername, accountRecord);

  addSecurityAuditLog('FAILED_LOGIN', ip, normalizedUsername, `Failed attempt #${Math.max(ipRecord.count, accountRecord.count)}`);

  const remaining = Math.max(0, SECURITY_CONFIG.MAX_FAILED_LOGINS_PER_IP - Math.max(ipRecord.count, accountRecord.count));

  return {
    isLocked,
    retryAfterSeconds,
    remainingAttempts: remaining
  };
}

export function recordSuccessfulLogin(ip: string, normalizedUsername: string): void {
  // Clear failed attempt tracking on successful authentication
  ipFailedAttempts.delete(ip);
  accountFailedAttempts.delete(normalizedUsername);
  addSecurityAuditLog('SUCCESSFUL_LOGIN', ip, normalizedUsername, 'Login successful');
}

// -------------------------------------------------------------
// GENERAL SENSITIVE ROUTE RATE LIMITER (e.g. password change)
// -------------------------------------------------------------
export function createRateLimiter(options: { maxRequests: number; windowSeconds: number; name: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const key = `${options.name}:${ip}`;
    const now = Date.now();
    const windowMs = options.windowSeconds * 1000;

    let record = genericRateLimits.get(key);
    if (!record || (now - record.windowStart > windowMs)) {
      record = { count: 1, windowStart: now };
      genericRateLimits.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > options.maxRequests) {
      const waitSeconds = Math.ceil((record.windowStart + windowMs - now) / 1000);
      res.setHeader('Retry-After', waitSeconds.toString());
      res.status(429).json({
        error: `Zu viele Anfragen für ${options.name}. Bitte warten Sie ${waitSeconds} Sekunden.`,
        retryAfter: waitSeconds
      });
      return;
    }

    next();
  };
}

// -------------------------------------------------------------
// SECURITY HEADERS MIDDLEWARE
// -------------------------------------------------------------
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Protect against MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS protection filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  next();
}

export function unlockIp(ip: string): boolean {
  const had = ipFailedAttempts.has(ip);
  ipFailedAttempts.delete(ip);
  addSecurityAuditLog('ADMIN_ACTION', ip, undefined, `IP ${ip} manually unlocked by admin`);
  return had;
}

export function unlockAccount(account: string): boolean {
  const norm = account.trim().toLowerCase();
  const had = accountFailedAttempts.has(norm);
  accountFailedAttempts.delete(norm);
  addSecurityAuditLog('ADMIN_ACTION', '127.0.0.1', norm, `Account ${norm} manually unlocked by admin`);
  return had;
}

export function getSecurityStats() {
  const now = Date.now();
  const lockedIps = Array.from(ipFailedAttempts.entries())
    .filter(([_, r]) => r.lockedUntil && r.lockedUntil > now)
    .map(([ip, r]) => ({ ip, lockedUntil: new Date(r.lockedUntil!).toISOString(), attempts: r.count }));

  const lockedAccounts = Array.from(accountFailedAttempts.entries())
    .filter(([_, r]) => r.lockedUntil && r.lockedUntil > now)
    .map(([account, r]) => ({ account, lockedUntil: new Date(r.lockedUntil!).toISOString(), attempts: r.count }));

  return {
    lockedIps,
    lockedAccounts,
    totalTrackedIps: ipFailedAttempts.size,
    totalTrackedAccounts: accountFailedAttempts.size
  };
}
