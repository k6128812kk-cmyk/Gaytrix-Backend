import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/pool';

// ==========================================================================
// Telegram initData verification — the ONLY way a user proves identity.
//
// Role system:
//   - "admin"     : @k54lid (telegramId 528269003) — full access
//   - "moderator" : can review verifications, reports, suspend/ban users
//   - "none"      : regular user
//
// Note: "super_admin" in DB is treated as "admin" for all purposes.
// ==========================================================================

const ADMIN_TELEGRAM_ID = parseInt(process.env.SUPER_ADMIN_TELEGRAM_ID || '528269003');
const BOT_TOKEN = process.env.BOT_TOKEN!;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    telegramId: number;
    telegramUsername: string;
    adminRole: string;
    accountStatus: string;
  };
}

function verifyTelegramInitData(initData: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const dataCheckArr: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') dataCheckArr.push(`${key}=${value}`);
  });
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (expectedHash !== hash) return null;

  const authDate = parseInt(params.get('auth_date') || '0');
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 3600) return null;

  const result: Record<string, string> = {};
  params.forEach((value, key) => { result[key] = value; });
  return result;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const initData = req.headers['x-telegram-init-data'] as string;

  if (!initData && process.env.NODE_ENV === 'development') {
    req.user = {
      id: 'dev-admin',
      telegramId: ADMIN_TELEGRAM_ID,
      telegramUsername: 'k54lid',
      adminRole: 'admin',
      accountStatus: 'active',
    };
    return next();
  }

  if (!initData) {
    return res.status(401).json({ error: 'Missing Telegram authentication' });
  }

  const parsed = verifyTelegramInitData(initData);
  if (!parsed) {
    return res.status(401).json({ error: 'Invalid or expired Telegram session' });
  }

  let telegramUser: { id: number; username?: string; first_name?: string };
  try {
    telegramUser = JSON.parse(parsed.user || '{}');
  } catch {
    return res.status(401).json({ error: 'Malformed user data' });
  }

  if (!telegramUser.id) {
    return res.status(401).json({ error: 'No user ID in Telegram data' });
  }

  try {
    // Admin role: if this is the admin telegram ID, always set to 'admin'
    // For existing users with super_admin in DB, treat as admin
    // For moderators, keep their moderator role
    const isAdminById = telegramUser.id === ADMIN_TELEGRAM_ID;

    const result = await db.query(
      `INSERT INTO users (telegram_id, telegram_username, admin_role, last_active_at, is_online)
       VALUES ($1, $2, $3, NOW(), TRUE)
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_username = EXCLUDED.telegram_username,
         last_active_at = NOW(),
         is_online = TRUE,
         admin_role = CASE
           WHEN users.telegram_id = $4 THEN 'admin'
           WHEN users.admin_role = 'super_admin' THEN 'admin'
           ELSE users.admin_role
         END
       RETURNING id, telegram_id, telegram_username, admin_role, account_status`,
      [
        telegramUser.id,
        telegramUser.username || '',
        isAdminById ? 'admin' : 'none',
        ADMIN_TELEGRAM_ID,
      ]
    );

    const user = result.rows[0];

    if (user.account_status === 'banned') {
      return res.status(403).json({ error: 'Account banned', accountStatus: 'banned' });
    }
    if (user.account_status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended', accountStatus: 'suspended' });
    }

    req.user = {
      id: user.id,
      telegramId: user.telegram_id,
      telegramUsername: user.telegram_username,
      adminRole: user.admin_role,
      accountStatus: user.account_status,
    };

    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// Admin or moderator access
export function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const role = req.user?.adminRole;
  if (role !== 'admin' && role !== 'super_admin' && role !== 'moderator') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Admin-only (not moderator)
export function adminOnlyMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const role = req.user?.adminRole;
  if (role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Super admin only (legacy, same as admin)
export function superAdminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const role = req.user?.adminRole;
  if (role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
