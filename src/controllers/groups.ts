import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';
import path from 'path';

// ==========================================================================
// Group Chats controller — public community group chats.
// Anyone can create, join, or leave a group.
// Admins and moderators can delete any group.
// ==========================================================================

function formatGroup(row: Record<string, any>, memberCount: number, isMember: boolean) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    photoUrl: row.photo_url || null,
    createdBy: row.created_by,
    creatorName: row.creator_name || '',
    creatorPhoto: row.creator_photo || null,
    memberCount,
    isMember,
    lastMessageAt: row.last_message_at || row.created_at,
    createdAt: row.created_at,
    status: row.status || 'active',
  };
}

export async function getGroups(req: AuthenticatedRequest, res: Response) {
  const { sort = 'recent', search } = req.query;

  let orderBy = 'g.created_at DESC';
  switch (sort) {
    case 'members_desc': orderBy = 'member_count DESC, g.created_at DESC'; break;
    case 'members_asc': orderBy = 'member_count ASC, g.created_at DESC'; break;
    case 'recent': orderBy = 'g.last_message_at DESC NULLS LAST, g.created_at DESC'; break;
    case 'last_message': orderBy = 'g.last_message_at DESC NULLS LAST'; break;
  }

  try {
    const result = await db.query(
      `SELECT g.*,
              u.display_name as creator_name,
              u.photos[1] as creator_photo,
              (SELECT COUNT(*) FROM community_group_members cgm WHERE cgm.group_id = g.id) as member_count
       FROM community_groups g
       LEFT JOIN users u ON g.created_by = u.id
       WHERE g.status = 'active'
         AND ($1::text IS NULL OR g.name ILIKE $1 OR g.description ILIKE $1)
       ORDER BY ${orderBy}
       LIMIT 50`,
      [search ? `%${search}%` : null]
    );

    const groups = await Promise.all(result.rows.map(async (row) => {
      const memberRes = await db.query(
        'SELECT 1 FROM community_group_members WHERE group_id = $1 AND user_id = $2',
        [row.id, req.user!.id]
      );
      return formatGroup(row, parseInt(row.member_count), memberRes.rows.length > 0);
    }));

    res.json(groups);
  } catch (err) {
    console.error('getGroups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createGroup(req: AuthenticatedRequest, res: Response) {
  const { name, description } = req.body;
  const photoFile = req.file;

  if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });

  let photoUrl: string | null = null;
  if (photoFile) {
    photoUrl = `/uploads/groups/${photoFile.filename}`;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const groupRes = await client.query(
      `INSERT INTO community_groups (name, description, photo_url, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), description?.trim() || '', photoUrl, req.user!.id]
    );
    const group = groupRes.rows[0];

    // Creator is automatically a member
    await client.query(
      `INSERT INTO community_group_members (group_id, user_id) VALUES ($1, $2)`,
      [group.id, req.user!.id]
    );

    await client.query('COMMIT');

    res.status(201).json(formatGroup(
      { ...group, creator_name: '', creator_photo: null },
      1, true
    ));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createGroup error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}

export async function joinGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    const groupRes = await db.query(
      `SELECT id FROM community_groups WHERE id = $1 AND status = 'active'`, [groupId]
    );
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    await db.query(
      `INSERT INTO community_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [groupId, req.user!.id]
    );

    const countRes = await db.query(
      'SELECT COUNT(*) FROM community_group_members WHERE group_id = $1', [groupId]
    );
    res.json({ ok: true, memberCount: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error('joinGroup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function leaveGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    await db.query(
      'DELETE FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    const countRes = await db.query(
      'SELECT COUNT(*) FROM community_group_members WHERE group_id = $1', [groupId]
    );
    res.json({ ok: true, memberCount: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error('leaveGroup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    const groupRes = await db.query('SELECT * FROM community_groups WHERE id = $1', [groupId]);
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    const role = req.user!.adminRole;
    const isStaff = role === 'admin' || role === 'super_admin' || role === 'moderator';
    const isCreator = groupRes.rows[0].created_by === req.user!.id;

    if (!isCreator && !isStaff) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.query(`UPDATE community_groups SET status = 'deleted' WHERE id = $1`, [groupId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteGroup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getGroupMessages(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    // Check member
    const memberRes = await db.query(
      'SELECT 1 FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    if (!memberRes.rows[0]) return res.status(403).json({ error: 'Not a member' });

    const result = await db.query(
      `SELECT cgm2.*, u.display_name as sender_name, u.photos[1] as sender_photo
       FROM community_group_messages cgm2
       JOIN users u ON cgm2.sender_id = u.id
       WHERE cgm2.group_id = $1
       ORDER BY cgm2.sent_at ASC
       LIMIT 200`,
      [groupId]
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      groupId: row.group_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderPhoto: row.sender_photo,
      text: row.text,
      sentAt: row.sent_at,
    })));
  } catch (err) {
    console.error('getGroupMessages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function sendGroupMessage(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    const memberRes = await db.query(
      'SELECT 1 FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    if (!memberRes.rows[0]) return res.status(403).json({ error: 'Not a member' });

    const saved = await db.query(
      `INSERT INTO community_group_messages (group_id, sender_id, text) VALUES ($1, $2, $3) RETURNING *`,
      [groupId, req.user!.id, text.trim()]
    );

    // Update last_message_at on group
    await db.query(
      `UPDATE community_groups SET last_message_at = NOW() WHERE id = $1`, [groupId]
    );

    const userRes = await db.query('SELECT display_name, photos FROM users WHERE id = $1', [req.user!.id]);

    res.json({
      id: saved.rows[0].id,
      groupId,
      senderId: req.user!.id,
      senderName: userRes.rows[0].display_name,
      senderPhoto: userRes.rows[0].photos?.[0] ?? null,
      text: saved.rows[0].text,
      sentAt: saved.rows[0].sent_at,
    });
  } catch (err) {
    console.error('sendGroupMessage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getGroupMembers(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    const result = await db.query(
      `SELECT u.id, u.display_name, u.photos, u.verification_status, u.membership_tier, u.admin_role
       FROM community_group_members cgm
       JOIN users u ON cgm.user_id = u.id
       WHERE cgm.group_id = $1
       ORDER BY cgm.joined_at ASC`,
      [groupId]
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      displayName: row.display_name,
      photos: row.photos,
      verification: row.verification_status,
      membership: row.membership_tier,
      adminRole: row.admin_role,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
