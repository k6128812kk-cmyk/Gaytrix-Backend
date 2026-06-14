import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Admin controller — all endpoints protected by adminMiddleware.
// Super admin (telegramId 528269003) cannot be moderated by anyone.
// ==========================================================================

const SUPER_ADMIN_TELEGRAM_ID = parseInt(process.env.SUPER_ADMIN_TELEGRAM_ID || '528269003');

async function isProtected(userId: string): Promise<boolean> {
  const result = await db.query(
    'SELECT telegram_id, admin_role FROM users WHERE id = $1',
    [userId]
  );
  const user = result.rows[0];
  return user?.telegram_id === SUPER_ADMIN_TELEGRAM_ID || user?.admin_role === 'super_admin';
}

export async function getStats(req: AuthenticatedRequest, res: Response) {
  try {
    const [total, activeToday, activeMonth, verified, premium, pendingVerif, pendingReports, banned, newToday, newWeek] =
      await Promise.all([
        db.query(`SELECT COUNT(*) FROM users WHERE account_status != 'banned'`),
        db.query(`SELECT COUNT(*) FROM users WHERE last_active_at > NOW() - INTERVAL '1 day'`),
        db.query(`SELECT COUNT(*) FROM users WHERE last_active_at > NOW() - INTERVAL '30 days'`),
        db.query(`SELECT COUNT(*) FROM users WHERE verification_status = 'verified'`),
        db.query(`SELECT COUNT(*) FROM users WHERE membership_tier = 'premium'`),
        db.query(`SELECT COUNT(*) FROM verification_requests WHERE status = 'pending'`),
        db.query(`SELECT COUNT(*) FROM user_reports WHERE status = 'pending'`),
        db.query(`SELECT COUNT(*) FROM users WHERE account_status = 'banned'`),
        db.query(`SELECT COUNT(*) FROM users WHERE registered_at > NOW() - INTERVAL '1 day'`),
        db.query(`SELECT COUNT(*) FROM users WHERE registered_at > NOW() - INTERVAL '7 days'`),
      ]);

    res.json({
      totalUsers: parseInt(total.rows[0].count),
      activeToday: parseInt(activeToday.rows[0].count),
      activeThisMonth: parseInt(activeMonth.rows[0].count),
      verifiedUsers: parseInt(verified.rows[0].count),
      premiumUsers: parseInt(premium.rows[0].count),
      pendingVerifications: parseInt(pendingVerif.rows[0].count),
      pendingReports: parseInt(pendingReports.rows[0].count),
      bannedUsers: parseInt(banned.rows[0].count),
      newUsersToday: parseInt(newToday.rows[0].count),
      newUsersThisWeek: parseInt(newWeek.rows[0].count),
    });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getUsers(req: AuthenticatedRequest, res: Response) {
  const { search, status, verification, page = 1 } = req.query;
  const limit = 20;
  const offset = (Number(page) - 1) * limit;

  try {
    const result = await db.query(
      `SELECT u.*, (
         SELECT COUNT(*) FROM user_reports WHERE reported_id = u.id
       ) as reports_count
       FROM users u
       WHERE ($1::text IS NULL OR
              u.display_name ILIKE '%' || $1 || '%' OR
              u.telegram_username ILIKE '%' || $1 || '%' OR
              u.telegram_id::text = $1)
         AND ($2::text IS NULL OR u.account_status = $2)
         AND ($3::text IS NULL OR u.verification_status = $3)
       ORDER BY u.registered_at DESC
       LIMIT $4 OFFSET $5`,
      [search || null, status || null, verification || null, limit, offset]
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      telegramId: row.telegram_id,
      telegramUsername: row.telegram_username,
      displayName: row.display_name,
      age: row.age,
      city: row.city,
      country: row.country,
      verification: row.verification_status,
      membership: row.membership_tier,
      adminRole: row.admin_role,
      accountStatus: row.account_status,
      registeredAt: row.registered_at,
      lastActiveAt: row.last_active_at,
      reportsCount: parseInt(row.reports_count),
      photos: row.photos,
    })));
  } catch (err) {
    console.error('getUsers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function banUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  const { reason } = req.body;

  if (!reason?.trim()) return res.status(400).json({ error: 'Reason required' });
  if (await isProtected(userId)) return res.status(403).json({ error: 'Cannot moderate this account' });

  try {
    await db.query(
      `UPDATE users SET account_status = 'banned' WHERE id = $1`,
      [userId]
    );
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason) VALUES ($1, $2, 'ban', $3)`,
      [req.user!.id, userId, reason]
    );
    // Revoke all sessions for this user
    await db.query(
      `INSERT INTO revoked_sessions (telegram_id)
       SELECT telegram_id FROM users WHERE id = $1
       ON CONFLICT DO NOTHING`,
      [userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('banUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function suspendUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  const { reason, durationDays = 7 } = req.body;

  if (!reason?.trim()) return res.status(400).json({ error: 'Reason required' });
  if (await isProtected(userId)) return res.status(403).json({ error: 'Cannot moderate this account' });

  try {
    await db.query(
      `UPDATE users SET account_status = 'suspended' WHERE id = $1`,
      [userId]
    );
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason)
       VALUES ($1, $2, 'suspend', $3)`,
      [req.user!.id, userId, `${reason} (${durationDays} days)`]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('suspendUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function unsuspendUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  try {
    await db.query(
      `UPDATE users SET account_status = 'active' WHERE id = $1`,
      [userId]
    );
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action) VALUES ($1, $2, 'unsuspend')`,
      [req.user!.id, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('unsuspendUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function removeUser(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  const { reason } = req.body;

  if (!reason?.trim()) return res.status(400).json({ error: 'Reason required' });
  if (await isProtected(userId)) return res.status(403).json({ error: 'Cannot moderate this account' });

  try {
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason)
       VALUES ($1, $2, 'remove_account', $3)`,
      [req.user!.id, userId, reason]
    );
    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('removeUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getReports(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at,
              reporter.telegram_username as reporter_username,
              reported.id as reported_user_id,
              reported.telegram_username as reported_username,
              reported.display_name as reported_display_name
       FROM user_reports r
       JOIN users reporter ON r.reporter_id = reporter.id
       JOIN users reported ON r.reported_id = reported.id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      reporterUsername: row.reporter_username,
      reportedUserId: row.reported_user_id,
      reportedUsername: row.reported_username,
      reportedDisplayName: row.reported_display_name,
    })));
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function dismissReport(req: AuthenticatedRequest, res: Response) {
  try {
    await db.query(
      `UPDATE user_reports SET status = 'dismissed' WHERE id = $1`,
      [req.params.reportId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getAuditLog(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT a.id, a.action, a.reason, a.performed_at,
              admin.telegram_username as admin_username,
              target.telegram_username as target_username
       FROM admin_actions a
       JOIN users admin ON a.admin_id = admin.id
       LEFT JOIN users target ON a.target_id = target.id
       ORDER BY a.performed_at DESC
       LIMIT 100`
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      performedAt: row.performed_at,
      adminUsername: row.admin_username,
      targetUsername: row.target_username,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function revokePremium(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  if (await isProtected(userId)) return res.status(403).json({ error: 'Cannot moderate this account' });
  try {
    await db.query(`UPDATE users SET membership_tier = 'free' WHERE id = $1`, [userId]);
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason) VALUES ($1, $2, 'revoke_premium', 'Admin revoked premium')`,
      [req.user!.id, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('revokePremium error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function grantPremium(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  if (await isProtected(userId)) return res.status(403).json({ error: 'Cannot moderate this account' });
  try {
    await db.query(`UPDATE users SET membership_tier = 'premium' WHERE id = $1`, [userId]);
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason) VALUES ($1, $2, 'grant_premium', 'Admin granted premium')`,
      [req.user!.id, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('grantPremium error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function removeVerification(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  if (await isProtected(userId)) return res.status(403).json({ error: 'Cannot moderate this account' });
  try {
    // Reset verification_status to 'none' and cancel any pending verification requests
    await db.query(`UPDATE users SET verification_status = 'none' WHERE id = $1`, [userId]);
    await db.query(
      `UPDATE verification_requests SET status = 'cancelled' WHERE user_id = $1 AND status IN ('pending', 'verified')`,
      [userId]
    );
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason) VALUES ($1, $2, 'remove_verification', 'Admin removed verification badge')`,
      [req.user!.id, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('removeVerification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function grantVerification(req: AuthenticatedRequest, res: Response) {
  const { userId } = req.params;
  if (await isProtected(userId)) return res.status(403).json({ error: 'Cannot moderate this account' });
  try {
    await db.query(`UPDATE users SET verification_status = 'verified' WHERE id = $1`, [userId]);
    // Also mark any pending verification request as verified
    await db.query(
      `UPDATE verification_requests SET status = 'verified', reviewed_by = $1, reviewed_at = NOW()
       WHERE user_id = $2 AND status = 'pending'`,
      [req.user!.id, userId]
    );
    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason) VALUES ($1, $2, 'verify', 'Admin granted verification')`,
      [req.user!.id, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('grantVerification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function sendAnnouncement(req: AuthenticatedRequest, res: Response) {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    // Get all user telegram IDs to notify via bot
    const users = await db.query(
      `SELECT telegram_id FROM users WHERE account_status = 'active'`
    );

    // Import bot and send (the bot module handles this)
    const { sendBroadcast } = await import('../bot/bot');
    await sendBroadcast(
      users.rows.map(r => r.telegram_id),
      `📢 *GayTrix Announcement*\n\n${message}`
    );

    await db.query(
      `INSERT INTO admin_actions (admin_id, action, reason) VALUES ($1, 'send_announcement', $2)`,
      [req.user!.id, message.substring(0, 100)]
    );

    res.json({ ok: true, sentTo: users.rows.length });
  } catch (err) {
    console.error('sendAnnouncement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
