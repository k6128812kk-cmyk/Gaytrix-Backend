import { n } from '../i18n/notifications';
import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Group Chats controller — community group chats with:
//   - Creator can edit all details (name, description, image, settings)
//   - Creator-only moderator management
//   - Private/locked groups with join request approval queue
//   - Per-user notification mute/unmute
//   - Group message media support
// ==========================================================================

function formatGroup(row: Record<string, any>, memberCount: number, isMember: boolean, userRole?: string, isMuted?: boolean) {
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
    userRole: userRole || 'none',
    isMuted: isMuted || false,
    isPrivate: row.is_private || false,
    lastMessageAt: row.last_message_at || row.created_at,
    createdAt: row.created_at,
    status: row.status || 'active',
  };
}

function getUserRoleInGroup(createdBy: string, memberRole: string | undefined, userId: string): string {
  if (createdBy === userId) return 'creator';
  return memberRole || 'member';
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
        'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
        [row.id, req.user!.id]
      );
      const isMember = memberRes.rows.length > 0;
      const memberRole = memberRes.rows[0]?.role;
      const muteRes = await db.query(
        'SELECT 1 FROM community_group_mutes WHERE group_id = $1 AND user_id = $2',
        [row.id, req.user!.id]
      );
      const userRole = getUserRoleInGroup(row.created_by, memberRole, req.user!.id);
      return formatGroup(row, parseInt(row.member_count), isMember, isMember ? userRole : 'none', muteRes.rows.length > 0);
    }));

    res.json(groups);
  } catch (err) {
    console.error('getGroups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createGroup(req: AuthenticatedRequest, res: Response) {
  const { name, description, isPrivate } = req.body;
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
      `INSERT INTO community_groups (name, description, photo_url, created_by, is_private)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), description?.trim() || '', photoUrl, req.user!.id, isPrivate === 'true' || isPrivate === true]
    );
    const group = groupRes.rows[0];

    // Creator is automatically a member with 'creator' role
    await client.query(
      `INSERT INTO community_group_members (group_id, user_id, role) VALUES ($1, $2, 'creator')`,
      [group.id, req.user!.id]
    );

    await client.query('COMMIT');

    res.status(201).json(formatGroup(
      { ...group, creator_name: '', creator_photo: null },
      1, true, 'creator', false
    ));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createGroup error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}

export async function updateGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  const { name, description, isPrivate } = req.body;
  const photoFile = req.file;

  try {
    const groupRes = await db.query('SELECT * FROM community_groups WHERE id = $1 AND status = $2', [groupId, 'active']);
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    const group = groupRes.rows[0];
    if (group.created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Only the group creator can edit group details' });
    }

    let photoUrl = group.photo_url;
    if (photoFile) {
      photoUrl = `/uploads/groups/${photoFile.filename}`;
    }

    const updated = await db.query(
      `UPDATE community_groups
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           photo_url = $3,
           is_private = COALESCE($4, is_private)
       WHERE id = $5 RETURNING *`,
      [
        name?.trim() || null,
        description?.trim() ?? null,
        photoUrl,
        isPrivate !== undefined ? (isPrivate === 'true' || isPrivate === true) : null,
        groupId,
      ]
    );

    const countRes = await db.query('SELECT COUNT(*) FROM community_group_members WHERE group_id = $1', [groupId]);
    res.json(formatGroup(
      { ...updated.rows[0], creator_name: '', creator_photo: null },
      parseInt(countRes.rows[0].count), true, 'creator', false
    ));
  } catch (err) {
    console.error('updateGroup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function joinGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    const groupRes = await db.query(
      `SELECT id, is_private, created_by FROM community_groups WHERE id = $1 AND status = 'active'`, [groupId]
    );
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    // Check if already a member
    const existingMember = await db.query(
      'SELECT 1 FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    if (existingMember.rows[0]) {
      return res.json({ ok: true, status: 'already_member' });
    }

    // If private group, create a join request instead of joining directly
    if (groupRes.rows[0].is_private) {
      // Check if there's already a pending request
      const existingReq = await db.query(
        'SELECT status FROM community_group_join_requests WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user!.id]
      );
      if (existingReq.rows[0]) {
        return res.json({ ok: true, status: existingReq.rows[0].status === 'pending' ? 'request_pending' : existingReq.rows[0].status });
      }

      await db.query(
        `INSERT INTO community_group_join_requests (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [groupId, req.user!.id]
      );
      return res.json({ ok: true, status: 'request_pending' });
    }

    await db.query(
      `INSERT INTO community_group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [groupId, req.user!.id]
    );

    const countRes = await db.query(
      'SELECT COUNT(*) FROM community_group_members WHERE group_id = $1', [groupId]
    );
    res.json({ ok: true, status: 'joined', memberCount: parseInt(countRes.rows[0].count) });
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
    // Check member or admin
    const memberRes = await db.query(
      'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    const role = req.user!.adminRole;
    const isStaff = role === 'admin' || role === 'super_admin' || role === 'moderator';
    if (!memberRes.rows[0] && !isStaff) return res.status(403).json({ error: 'Not a member' });

    // For private groups, only members/admins can see messages
    const groupRes = await db.query('SELECT is_private, created_by FROM community_groups WHERE id = $1', [groupId]);
    if (groupRes.rows[0]?.is_private && !memberRes.rows[0] && !isStaff) {
      return res.status(403).json({ error: 'This is a private group' });
    }

    const result = await db.query(
      `SELECT cgm.*, u.display_name as sender_name, u.photos[1] as sender_photo
       FROM community_group_messages cgm
       JOIN users u ON cgm.sender_id = u.id
       WHERE cgm.group_id = $1
       ORDER BY cgm.sent_at ASC
       LIMIT 200`,
      [groupId]
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      groupId: row.group_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderPhoto: row.sender_photo,
      text: row.deleted_at ? null : row.text,
      mediaUrl: row.deleted_at ? null : row.media_url,
      contentType: row.deleted_at ? 'deleted' : (row.content_type || 'text'),
      deletedAt: row.deleted_at || null,
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

  try {
    const memberRes = await db.query(
      'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    if (!memberRes.rows[0]) return res.status(403).json({ error: 'Not a member' });

    // For private groups, check approval
    const groupInfo = await db.query('SELECT is_private, created_by FROM community_groups WHERE id = $1', [groupId]);
    const gr = groupInfo.rows[0];

    // Handle photo message
    const file = req.file;
    let mediaUrl: string | null = null;
    let contentType = 'text';
    if (file) {
      mediaUrl = `/uploads/groups/${file.filename}`;
      contentType = 'image';
    }

    if (!text?.trim() && !mediaUrl) return res.status(400).json({ error: 'Message or photo required' });

    const saved = await db.query(
      `INSERT INTO community_group_messages (group_id, sender_id, text, media_url, content_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [groupId, req.user!.id, text?.trim() || null, mediaUrl, contentType]
    );

    await db.query(
      `UPDATE community_groups SET last_message_at = NOW() WHERE id = $1`, [groupId]
    );

    const userRes = await db.query('SELECT display_name, photos FROM users WHERE id = $1', [req.user!.id]);

    const message = {
      id: saved.rows[0].id,
      groupId,
      senderId: req.user!.id,
      senderName: userRes.rows[0].display_name,
      senderPhoto: userRes.rows[0].photos?.[0] ?? null,
      text: saved.rows[0].text,
      mediaUrl: saved.rows[0].media_url,
      contentType: saved.rows[0].content_type || 'text',
      sentAt: saved.rows[0].sent_at,
    };

    // Send Telegram notifications to all non-muted members (except sender)
    try {
      const membersRes = await db.query(
        `SELECT u.telegram_id FROM community_group_members cgm
         JOIN users u ON cgm.user_id = u.id
         WHERE cgm.group_id = $1 AND cgm.user_id != $2
           AND NOT EXISTS (
             SELECT 1 FROM community_group_mutes m
             WHERE m.group_id = $1 AND m.user_id = cgm.user_id
           )`,
        [groupId, req.user!.id]
      );
      if (membersRes.rows.length > 0) {
        const { sendNotification } = await import('../bot/bot');
        const groupName = gr?.name || 'a group';
        for (const member of membersRes.rows) {
          // Privacy: do NOT reveal the sender's name or message content in the notification.
          const langRes = await db.query('SELECT language_preference FROM users WHERE telegram_id = $1', [member.telegram_id]);
          const lang = langRes.rows[0]?.language_preference ?? 'en';
          sendNotification(member.telegram_id, n(lang, 'newGroupMessage', { groupName })).catch(() => {});
        }
      }
    } catch { /* notifications are non-fatal */ }

    res.json(message);
  } catch (err) {
    console.error('sendGroupMessage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getGroupMembers(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    const result = await db.query(
      `SELECT u.id, u.display_name, u.photos, u.verification_status, u.membership_tier, u.admin_role,
              CASE WHEN u.hide_online_status THEN FALSE ELSE u.is_online END as is_online,
              cgm.role as group_role
       FROM community_group_members cgm
       JOIN users u ON cgm.user_id = u.id
       WHERE cgm.group_id = $1
       ORDER BY CASE cgm.role WHEN 'creator' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, cgm.joined_at ASC`,
      [groupId]
    );
    res.json(result.rows.map(row => ({
      id: row.id,
      displayName: row.display_name,
      photos: row.photos,
      verification: row.verification_status,
      membership: row.membership_tier,
      adminRole: row.admin_role,
      isOnline: row.is_online,
      groupRole: row.group_role || 'member',
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    const result = await db.query(
      `SELECT g.*, u.display_name as creator_name, u.photos[1] as creator_photo,
              (SELECT COUNT(*) FROM community_group_members cgm WHERE cgm.group_id = g.id) as member_count
       FROM community_groups g
       LEFT JOIN users u ON g.created_by = u.id
       WHERE g.id = $1 AND g.status = 'active'`,
      [groupId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Group not found' });
    const row = result.rows[0];

    const memberRes = await db.query(
      'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    const isMember = memberRes.rows.length > 0;
    const memberRole = memberRes.rows[0]?.role;
    const userRole = getUserRoleInGroup(row.created_by, memberRole, req.user!.id);

    const muteRes = await db.query(
      'SELECT 1 FROM community_group_mutes WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );

    // For private groups, check if user has a pending join request
    let joinRequestStatus: string | null = null;
    if (row.is_private && !isMember) {
      const jrRes = await db.query(
        'SELECT status FROM community_group_join_requests WHERE group_id = $1 AND user_id = $2',
        [groupId, req.user!.id]
      );
      joinRequestStatus = jrRes.rows[0]?.status || null;
    }

    res.json({
      ...formatGroup(row, parseInt(row.member_count), isMember, isMember ? userRole : 'none', muteRes.rows.length > 0),
      joinRequestStatus,
    });
  } catch (err) {
    console.error('getGroup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Moderator management (creator only) ───────────────────────────────────
export async function addModerator(req: AuthenticatedRequest, res: Response) {
  const { groupId, userId } = req.params;
  try {
    const groupRes = await db.query('SELECT created_by FROM community_groups WHERE id = $1 AND status = $2', [groupId, 'active']);
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });
    if (groupRes.rows[0].created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Only the group creator can assign moderators' });
    }

    const memberRes = await db.query(
      'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    if (!memberRes.rows[0]) return res.status(404).json({ error: 'User is not a member' });
    if (memberRes.rows[0].role === 'creator') return res.status(400).json({ error: 'Cannot change creator role' });

    await db.query(
      'UPDATE community_group_members SET role = $1 WHERE group_id = $2 AND user_id = $3',
      ['moderator', groupId, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('addModerator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function removeModerator(req: AuthenticatedRequest, res: Response) {
  const { groupId, userId } = req.params;
  try {
    const groupRes = await db.query('SELECT created_by FROM community_groups WHERE id = $1 AND status = $2', [groupId, 'active']);
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });
    if (groupRes.rows[0].created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Only the group creator can remove moderators' });
    }

    await db.query(
      'UPDATE community_group_members SET role = $1 WHERE group_id = $2 AND user_id = $3 AND role = $4',
      ['member', groupId, userId, 'moderator']
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('removeModerator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Join request management ───────────────────────────────────────────────
export async function getJoinRequests(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    const groupRes = await db.query('SELECT created_by FROM community_groups WHERE id = $1 AND status = $2', [groupId, 'active']);
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    const memberRes = await db.query(
      'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    const role = req.user!.adminRole;
    const isStaff = role === 'admin' || role === 'super_admin' || role === 'moderator';
    const isMod = memberRes.rows[0]?.role === 'creator' || memberRes.rows[0]?.role === 'moderator';
    if (!isMod && !isStaff) return res.status(403).json({ error: 'Not authorized' });

    const result = await db.query(
      `SELECT jr.id, jr.user_id, jr.status, jr.requested_at,
              u.display_name, u.photos, u.telegram_username
       FROM community_group_join_requests jr
       JOIN users u ON jr.user_id = u.id
       WHERE jr.group_id = $1 AND jr.status = 'pending'
       ORDER BY jr.requested_at ASC`,
      [groupId]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name,
      photos: r.photos,
      telegramUsername: r.telegram_username,
      requestedAt: r.requested_at,
    })));
  } catch (err) {
    console.error('getJoinRequests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function approveJoinRequest(req: AuthenticatedRequest, res: Response) {
  const { groupId, requestId } = req.params;
  try {
    const groupRes = await db.query('SELECT created_by FROM community_groups WHERE id = $1 AND status = $2', [groupId, 'active']);
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    const memberRes = await db.query(
      'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    const isMod = memberRes.rows[0]?.role === 'creator' || memberRes.rows[0]?.role === 'moderator';
    const role = req.user!.adminRole;
    const isStaff = role === 'admin' || role === 'super_admin' || role === 'moderator';
    if (!isMod && !isStaff) return res.status(403).json({ error: 'Not authorized' });

    const reqRes = await db.query(
      'UPDATE community_group_join_requests SET status = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE id = $3 AND group_id = $4 AND status = $5 RETURNING user_id',
      ['approved', req.user!.id, requestId, groupId, 'pending']
    );
    if (!reqRes.rows[0]) return res.status(404).json({ error: 'Request not found' });

    // Add user to group
    await db.query(
      `INSERT INTO community_group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [groupId, reqRes.rows[0].user_id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('approveJoinRequest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function rejectJoinRequest(req: AuthenticatedRequest, res: Response) {
  const { groupId, requestId } = req.params;
  try {
    const groupRes = await db.query('SELECT created_by FROM community_groups WHERE id = $1 AND status = $2', [groupId, 'active']);
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    const memberRes = await db.query(
      'SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    const isMod = memberRes.rows[0]?.role === 'creator' || memberRes.rows[0]?.role === 'moderator';
    const role = req.user!.adminRole;
    const isStaff = role === 'admin' || role === 'super_admin' || role === 'moderator';
    if (!isMod && !isStaff) return res.status(403).json({ error: 'Not authorized' });

    await db.query(
      'UPDATE community_group_join_requests SET status = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE id = $3 AND group_id = $4 AND status = $5',
      ['rejected', req.user!.id, requestId, groupId, 'pending']
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('rejectJoinRequest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Notification mute/unmute ──────────────────────────────────────────────
export async function muteGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    await db.query(
      `INSERT INTO community_group_mutes (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [groupId, req.user!.id]
    );
    res.json({ ok: true, muted: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function unmuteGroup(req: AuthenticatedRequest, res: Response) {
  const { groupId } = req.params;
  try {
    await db.query(
      'DELETE FROM community_group_mutes WHERE group_id = $1 AND user_id = $2',
      [groupId, req.user!.id]
    );
    res.json({ ok: true, muted: false });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Kick (remove) a member from a group ──────────────────────────────────
export async function kickGroupMember(req: AuthenticatedRequest, res: Response) {
  const { groupId, userId } = req.params;

  try {
    const groupRes = await db.query(
      `SELECT created_by FROM community_groups WHERE id = $1 AND status = 'active'`, [groupId]
    );
    if (!groupRes.rows[0]) return res.status(404).json({ error: 'Group not found' });

    // Check requester's role in the group
    const requesterRole = await db.query(
      `SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user!.id]
    );
    const platformRole = req.user!.adminRole;
    const isSuperAdmin = platformRole === 'admin' || platformRole === 'super_admin';
    const isCreator = groupRes.rows[0].created_by === req.user!.id;
    const isMod = requesterRole.rows[0]?.role === 'moderator' || requesterRole.rows[0]?.role === 'creator';

    if (!isCreator && !isMod && !isSuperAdmin) {
      return res.status(403).json({ error: 'Not authorized to kick members' });
    }

    // Cannot kick the group creator
    if (userId === groupRes.rows[0].created_by) {
      return res.status(400).json({ error: 'Cannot remove the group creator' });
    }

    // Moderators cannot kick other moderators — only creator/admin can
    const targetRole = await db.query(
      `SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (targetRole.rows[0]?.role === 'moderator' && !isCreator && !isSuperAdmin) {
      return res.status(403).json({ error: 'Only the creator or admin can remove moderators' });
    }

    await db.query(
      `DELETE FROM community_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('kickGroupMember error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Delete a group message (admin/super-admin or sender) ──────────────────
export async function deleteGroupMessage(req: AuthenticatedRequest, res: Response) {
  const { groupId, messageId } = req.params;

  try {
    // Check message exists and belongs to this group
    const msgRes = await db.query(
      `SELECT sender_id, deleted_at FROM community_group_messages WHERE id = $1 AND group_id = $2`,
      [messageId, groupId]
    );
    if (!msgRes.rows[0]) return res.status(404).json({ error: 'Message not found' });
    if (msgRes.rows[0].deleted_at) return res.status(400).json({ error: 'Message already deleted' });

    const platformRole = req.user!.adminRole;
    const isSuperAdmin = platformRole === 'admin' || platformRole === 'super_admin';
    const isSender = msgRes.rows[0].sender_id === req.user!.id;

    // Mods/creators can also delete messages in their group
    const memberRole = await db.query(
      `SELECT role FROM community_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, req.user!.id]
    );
    const isGroupMod = memberRole.rows[0]?.role === 'creator' || memberRole.rows[0]?.role === 'moderator';

    if (!isSender && !isSuperAdmin && !isGroupMod) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    // Soft-delete: mark as deleted but keep the row for audit purposes
    await db.query(
      `UPDATE community_group_messages
       SET deleted_at = NOW(), deleted_by = $1, text = NULL, media_url = NULL
       WHERE id = $2`,
      [req.user!.id, messageId]
    );

    // Broadcast deletion to all online members in real-time via WebSocket.
    // We import the connections map from the WS module to push the event.
    try {
      const { broadcastToGroup } = await import('../ws/chat');
      broadcastToGroup(groupId, JSON.stringify({
        type: 'group_message_deleted',
        groupId,
        messageId,
      }));
    } catch { /* WS broadcast is non-fatal */ }

    res.json({ ok: true });
  } catch (err) {
    console.error('deleteGroupMessage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
