import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Stories controller — 24-hour ephemeral photo stories shown on Discover.
// ==========================================================================

export async function getStories(req: AuthenticatedRequest, res: Response) {
  try {
    // Get one story per user (most recent), within last 24h
    const result = await db.query(
      `SELECT DISTINCT ON (s.user_id)
              s.id, s.user_id, s.photo_url, s.created_at,
              u.display_name, u.photos[1] as avatar,
              u.verification_status, u.membership_tier, u.admin_role,
              EXISTS (
                SELECT 1 FROM story_views sv
                WHERE sv.story_id = s.id AND sv.viewer_id = $1
              ) as viewed
       FROM stories s
       JOIN users u ON s.user_id = u.id
       WHERE s.created_at > NOW() - INTERVAL '24 hours'
         AND s.user_id != $1
         AND u.account_status = 'active'
         AND u.invisible_mode = FALSE
         AND u.id NOT IN (
           SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           UNION
           SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
         )
       ORDER BY s.user_id, s.created_at DESC`,
      [req.user!.id]
    );

    // Also get current user's own story if any
    const myStory = await db.query(
      `SELECT s.id, s.user_id, s.photo_url, s.created_at
       FROM stories s
       WHERE s.user_id = $1 AND s.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY s.created_at DESC LIMIT 1`,
      [req.user!.id]
    );

    res.json({
      myStory: myStory.rows[0] ? {
        id: myStory.rows[0].id,
        photoUrl: myStory.rows[0].photo_url,
        createdAt: myStory.rows[0].created_at,
      } : null,
      stories: result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        photoUrl: row.photo_url,
        createdAt: row.created_at,
        displayName: row.display_name,
        avatar: row.avatar,
        verification: row.verification_status,
        membership: row.membership_tier,
        adminRole: row.admin_role,
        viewed: row.viewed,
      })),
    });
  } catch (err) {
    console.error('getStories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createStory(req: AuthenticatedRequest, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Photo required' });

  const photoUrl = `/uploads/stories/${file.filename}`;

  try {
    const result = await db.query(
      `INSERT INTO stories (user_id, photo_url) VALUES ($1, $2) RETURNING *`,
      [req.user!.id, photoUrl]
    );
    res.status(201).json({
      id: result.rows[0].id,
      photoUrl: result.rows[0].photo_url,
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    console.error('createStory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function markStoryViewed(req: AuthenticatedRequest, res: Response) {
  const { storyId } = req.params;
  try {
    await db.query(
      `INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [storyId, req.user!.id]
    );
    const countRes = await db.query(
      `SELECT COUNT(*) as count FROM story_views WHERE story_id = $1`, [storyId]
    );
    res.json({ ok: true, viewCount: parseInt(countRes.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteStory(req: AuthenticatedRequest, res: Response) {
  const { storyId } = req.params;
  try {
    const result = await db.query(
      `DELETE FROM stories WHERE id = $1 AND user_id = $2 RETURNING id`,
      [storyId, req.user!.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Story not found or not yours' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getStoryViewers(req: AuthenticatedRequest, res: Response) {
  const { storyId } = req.params;
  try {
    // Only story owner or admin can see viewers
    const storyRes = await db.query(
      `SELECT user_id FROM stories WHERE id = $1`, [storyId]
    );
    if (!storyRes.rows[0]) return res.status(404).json({ error: 'Story not found' });

    const role = req.user!.adminRole;
    const isStaff = role === 'admin' || role === 'super_admin' || role === 'moderator';
    if (storyRes.rows[0].user_id !== req.user!.id && !isStaff) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await db.query(
      `SELECT u.id, u.telegram_username as username, u.display_name, u.photos[1] as avatar,
              sv.viewed_at
       FROM story_views sv
       JOIN users u ON sv.viewer_id = u.id
       WHERE sv.story_id = $1
       ORDER BY sv.viewed_at DESC`,
      [storyId]
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      viewedAt: row.viewed_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getStoryViewCount(req: AuthenticatedRequest, res: Response) {
  const { storyId } = req.params;
  try {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM story_views WHERE story_id = $1`, [storyId]
    );
    res.json({ viewCount: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ==========================================================================
// Story reply — sends as a private message to the story owner.
// The message is tagged with the story reference.
// ==========================================================================
export async function replyToStory(req: AuthenticatedRequest, res: Response) {
  const { storyId } = req.params;
  const { text } = req.body;

  if (!text?.trim()) return res.status(400).json({ error: 'Reply text required' });

  try {
    // Get story owner
    const storyRes = await db.query(
      `SELECT s.user_id, s.photo_url, u.display_name
       FROM stories s JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.created_at > NOW() - INTERVAL '24 hours'`,
      [storyId]
    );
    if (!storyRes.rows[0]) return res.status(404).json({ error: 'Story not found or expired' });
    if (storyRes.rows[0].user_id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot reply to your own story' });
    }

    const ownerId = storyRes.rows[0].user_id;

    // Find or create a 1:1 conversation
    const userA = req.user!.id < ownerId ? req.user!.id : ownerId;
    const userB = req.user!.id < ownerId ? ownerId : req.user!.id;

    let convRes = await db.query(
      `SELECT id FROM conversations WHERE user_a = $1 AND user_b = $2`,
      [userA, userB]
    );
    if (!convRes.rows[0]) {
      convRes = await db.query(
        `INSERT INTO conversations (user_a, user_b, is_request) VALUES ($1, $2, TRUE) RETURNING id`,
        [userA, userB]
      );
    }
    const conversationId = convRes.rows[0].id;

    // Format the reply message with story reference
    const replyText = `📷 Replied to your story:\n"${text.trim()}"`;

    const msgRes = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content_type, text)
       VALUES ($1, $2, 'text', $3) RETURNING *`,
      [conversationId, req.user!.id, replyText]
    );

    // Send Telegram notification to story owner
    try {
      const notifyRes = await db.query(
        `SELECT telegram_id FROM users WHERE id = $1`, [ownerId]
      );
      if (notifyRes.rows[0]) {
        const { sendNotification } = await import('../bot/bot');
        const senderRes = await db.query('SELECT display_name FROM users WHERE id = $1', [req.user!.id]);
        const senderName = senderRes.rows[0]?.display_name || 'Someone';
        await sendNotification(
          notifyRes.rows[0].telegram_id,
          `💬 ${senderName} replied to your story on GayTrix`
        );
      }
    } catch { /* notification failure is non-fatal */ }

    res.json({
      ok: true,
      conversationId,
      messageId: msgRes.rows[0].id,
    });
  } catch (err) {
    console.error('replyToStory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
