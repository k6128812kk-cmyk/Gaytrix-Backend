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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
