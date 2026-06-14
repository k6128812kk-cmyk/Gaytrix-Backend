import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/pool';

// ==========================================================================
// Telegram initData verification — the ONLY way a user proves identity.
//
// How it works:
// 1. Telegram signs initData with HMAC-SHA256 using a key derived from
//    the bot token. The signature is in the "hash" field of initData.
// 2. We recompute the expected hash and compare — if it doesn't match,
//    the request is rejected. No JWT, no session cookie needed.
// 3. We then look up (or create) the user in the database using telegramId.
// 4. Admin role is assigned in the DB based on telegramId — never by client.
//
// Super admin: telegramId 528269003 (@k54lid) — hard-enforced here and in DB.
// ==========================================================================

const SUPER_ADMIN_TELEGRAM_ID = parseInt(process.env.SUPER_ADMIN_TELEGRAM_ID || '528269003');
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

  // Build the data-check string: sorted key=value pairs (excluding hash)
  const dataCheckArr: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') dataCheckArr.push(`${key}=${value}`);
  });
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  // HMAC-SHA256 with key = HMAC-SHA256("WebAppData", botToken)
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (expectedHash !== hash) return null;

  // Check initData is not expired (max 1 hour)
  const authDate = parseInt(params.get('auth_date') || '0');
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 3600) return null;

  const result: Record<string, string> = {};
  params.forEach((value, key) => { result[key] = value; });
  return result;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const initData = req.headers['x-telegram-init-data'] as string;

  // Dev mode: allow requests without initData only in development
  if (!initData && process.env.NODE_ENV === 'development') {
    // Simulate super admin for local testing
    req.user = {
      id: 'dev-super-admin',
      telegramId: SUPER_ADMIN_TELEGRAM_ID,
      telegramUsername: 'k54lid',
      adminRole: 'super_admin',
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
    // Upsert user — creates on first login, updates username/last_active on subsequent logins
    // Admin role is set based on telegramId — never from client input
    const adminRole = telegramUser.id === SUPER_ADMIN_TELEGRAM_ID ? 'super_admin' : 'none';

    const result = await db.query(
      `INSERT INTO users (telegram_id, telegram_username, admin_role, last_active_at, is_online)
       VALUES ($1, $2, $3, NOW(), TRUE)
       ON CONFLICT (telegram_id) DO UPDATE SET
         telegram_username = EXCLUDED.telegram_username,
         last_active_at = NOW(),
         is_online = TRUE,
         -- Only upgrade to super_admin, never downgrade
         admin_role = CASE
           WHEN users.telegram_id = $4 THEN 'super_admin'
           ELSE users.admin_role
         END
       RETURNING id, telegram_id, telegram_username, admin_role, account_status`,
      [
        telegramUser.id,
        telegramUser.username || '',
        adminRole,
        SUPER_ADMIN_TELEGRAM_ID,
      ]
    );

    const user = result.rows[0];

    // Block banned users from accessing the API
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

// Admin-only middleware — must come after authMiddleware
export function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const role = req.user?.adminRole;
  if (role !== 'super_admin' && role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Super admin only
export function superAdminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.adminRole !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}
