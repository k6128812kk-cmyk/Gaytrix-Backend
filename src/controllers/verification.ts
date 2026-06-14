import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';
import path from 'path';

// ==========================================================================
// Verification controller.
// Selfie URLs are ONLY returned to admin-role sessions — never to regular users.
// ==========================================================================

export async function requestVerification(req: AuthenticatedRequest, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Selfie image required' });

  try {
    // Cancel any previous pending request
    await db.query(
      `UPDATE verification_requests SET status = 'cancelled'
       WHERE user_id = $1 AND status = 'pending'`,
      [req.user!.id]
    );

    const selfieUrl = `/uploads/selfies/${file.filename}`;

    await db.query(
      `INSERT INTO verification_requests (user_id, selfie_url, status)
       VALUES ($1, $2, 'pending')`,
      [req.user!.id, selfieUrl]
    );

    await db.query(
      `UPDATE users SET verification_status = 'pending' WHERE id = $1`,
      [req.user!.id]
    );

    res.json({ status: 'pending' });
  } catch (err) {
    console.error('requestVerification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getVerificationQueue(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT vr.id, vr.selfie_url, vr.submitted_at, vr.status,
              u.id as user_id, u.telegram_id, u.telegram_username, u.display_name
       FROM verification_requests vr
       JOIN users u ON vr.user_id = u.id
       WHERE vr.status = 'pending'
       ORDER BY vr.submitted_at ASC`
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      telegramId: row.telegram_id,
      telegramUsername: row.telegram_username,
      displayName: row.display_name,
      selfieUrl: row.selfie_url,  // Only returned to admin sessions (adminMiddleware)
      submittedAt: row.submitted_at,
      status: row.status,
    })));
  } catch (err) {
    console.error('getVerificationQueue error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function approveVerification(req: AuthenticatedRequest, res: Response) {
  const { requestId } = req.params;
  try {
    const vr = await db.query(
      `UPDATE verification_requests SET status = 'verified', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING user_id`,
      [req.user!.id, requestId]
    );
    if (!vr.rows[0]) return res.status(404).json({ error: 'Request not found' });

    await db.query(
      `UPDATE users SET verification_status = 'verified' WHERE id = $1`,
      [vr.rows[0].user_id]
    );

    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason)
       VALUES ($1, $2, 'verify', 'Verification approved')`,
      [req.user!.id, vr.rows[0].user_id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('approveVerification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function rejectVerification(req: AuthenticatedRequest, res: Response) {
  const { requestId } = req.params;
  const { reason } = req.body;

  try {
    const vr = await db.query(
      `UPDATE verification_requests
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING user_id`,
      [req.user!.id, reason || 'Did not meet requirements', requestId]
    );
    if (!vr.rows[0]) return res.status(404).json({ error: 'Request not found' });

    await db.query(
      `UPDATE users SET verification_status = 'rejected' WHERE id = $1`,
      [vr.rows[0].user_id]
    );

    await db.query(
      `INSERT INTO admin_actions (admin_id, target_id, action, reason)
       VALUES ($1, $2, 'reject_verification', $3)`,
      [req.user!.id, vr.rows[0].user_id, reason]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('rejectVerification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
