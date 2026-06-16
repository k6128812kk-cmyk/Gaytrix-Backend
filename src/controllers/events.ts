import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Events controller — map-pinned community events with group chats.
// Any user can create an event. Creators and admins/moderators can delete.
// Joining an event automatically adds you to its group conversation.
// ==========================================================================

function formatEvent(row: Record<string, any>, attendeeCount: number, isAttending: boolean) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lng),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxAttendees: row.max_attendees,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    creatorPhoto: row.creator_photo,
    groupConversationId: row.group_conversation_id,
    status: row.status,
    attendeeCount,
    isAttending,
    createdAt: row.created_at,
    reportsCount: row.reports_count,
  };
}

export async function getEvents(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT e.*,
              u.display_name as creator_name,
              u.photos[1] as creator_photo,
              gc.id as group_conversation_id
       FROM map_events e
       LEFT JOIN users u ON e.created_by = u.id
       LEFT JOIN group_conversations gc ON gc.event_id = e.id
       WHERE e.status = 'active'
       ORDER BY e.starts_at ASC`
    );

    const events = await Promise.all(result.rows.map(async (row) => {
      const countRes = await db.query(
        'SELECT COUNT(*) FROM event_attendees WHERE event_id = $1', [row.id]
      );
      const attendingRes = await db.query(
        'SELECT 1 FROM event_attendees WHERE event_id = $1 AND user_id = $2',
        [row.id, req.user!.id]
      );
      return formatEvent(
        row,
        parseInt(countRes.rows[0].count),
        attendingRes.rows.length > 0
      );
    }));

    res.json(events);
  } catch (err) {
    console.error('getEvents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createEvent(req: AuthenticatedRequest, res: Response) {
  const { title, description, category, lat, lng, startsAt, endsAt, maxAttendees } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  if (!description?.trim()) return res.status(400).json({ error: 'Description required' });
  if (lat == null || lng == null) return res.status(400).json({ error: 'Location required' });
  if (!startsAt) return res.status(400).json({ error: 'Start time required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Create event
    const eventRes = await client.query(
      `INSERT INTO map_events (title, description, category, lat, lng, starts_at, ends_at, max_attendees, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        title.trim(),
        description.trim(),
        category || 'social_meetup',
        parseFloat(lat),
        parseFloat(lng),
        new Date(startsAt),
        endsAt ? new Date(endsAt) : null,
        maxAttendees ? parseInt(maxAttendees) : null,
        req.user!.id,
      ]
    );
    const event = eventRes.rows[0];

    // Create group conversation for this event
    const gcRes = await client.query(
      `INSERT INTO group_conversations (event_id, name, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [event.id, title.trim(), req.user!.id]
    );
    const gcId = gcRes.rows[0].id;

    // Add creator as first member and attendee
    await client.query(
      `INSERT INTO group_members (conversation_id, user_id) VALUES ($1, $2)`,
      [gcId, req.user!.id]
    );
    await client.query(
      `INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2)`,
      [event.id, req.user!.id]
    );

    await client.query('COMMIT');

    res.status(201).json(formatEvent(
      { ...event, creator_name: '', creator_photo: null, group_conversation_id: gcId },
      1, true
    ));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createEvent error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}

export async function joinEvent(req: AuthenticatedRequest, res: Response) {
  const { eventId } = req.params;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Get event and check it exists / not full
    const eventRes = await client.query(
      `SELECT e.*, gc.id as group_conversation_id
       FROM map_events e
       LEFT JOIN group_conversations gc ON gc.event_id = e.id
       WHERE e.id = $1 AND e.status = 'active'`, [eventId]
    );
    if (!eventRes.rows[0]) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    // Check max attendees
    if (event.max_attendees) {
      const countRes = await client.query(
        'SELECT COUNT(*) FROM event_attendees WHERE event_id = $1', [eventId]
      );
      if (parseInt(countRes.rows[0].count) >= event.max_attendees) {
        return res.status(400).json({ error: 'Event is full' });
      }
    }

    // Add attendee (ignore if already attending)
    await client.query(
      `INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, req.user!.id]
    );

    // Add to group chat
    if (event.group_conversation_id) {
      await client.query(
        `INSERT INTO group_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [event.group_conversation_id, req.user!.id]
      );
    }

    await client.query('COMMIT');

    const countRes = await db.query(
      'SELECT COUNT(*) FROM event_attendees WHERE event_id = $1', [eventId]
    );
    res.json({ ok: true, attendeeCount: parseInt(countRes.rows[0].count), groupConversationId: event.group_conversation_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('joinEvent error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}

export async function leaveEvent(req: AuthenticatedRequest, res: Response) {
  const { eventId } = req.params;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const eventRes = await client.query(
      `SELECT e.*, gc.id as group_conversation_id
       FROM map_events e
       LEFT JOIN group_conversations gc ON gc.event_id = e.id
       WHERE e.id = $1`, [eventId]
    );
    const event = eventRes.rows[0];

    await client.query(
      'DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2',
      [eventId, req.user!.id]
    );

    // Remove from group chat (unless they're the creator)
    if (event?.group_conversation_id && event.created_by !== req.user!.id) {
      await client.query(
        'DELETE FROM group_members WHERE conversation_id = $1 AND user_id = $2',
        [event.group_conversation_id, req.user!.id]
      );
    }

    await client.query('COMMIT');

    const countRes = await db.query(
      'SELECT COUNT(*) FROM event_attendees WHERE event_id = $1', [eventId]
    );
    res.json({ ok: true, attendeeCount: parseInt(countRes.rows[0].count) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('leaveEvent error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}

export async function getEventAttendees(req: AuthenticatedRequest, res: Response) {
  const { eventId } = req.params;
  try {
    const result = await db.query(
      `SELECT u.id, u.display_name, u.photos, u.verification_status, u.membership_tier, u.admin_role
       FROM event_attendees ea
       JOIN users u ON ea.user_id = u.id
       WHERE ea.event_id = $1
       ORDER BY ea.joined_at ASC`,
      [eventId]
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
    console.error('getEventAttendees error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deleteEvent(req: AuthenticatedRequest, res: Response) {
  const { eventId } = req.params;
  const { reason } = req.body;

  try {
    const eventRes = await db.query('SELECT * FROM map_events WHERE id = $1', [eventId]);
    if (!eventRes.rows[0]) return res.status(404).json({ error: 'Event not found' });

    const event = eventRes.rows[0];
    const role = req.user!.adminRole;
    const isStaff = role === 'admin' || role === 'super_admin' || role === 'moderator';
    const isCreator = event.created_by === req.user!.id;

    if (!isCreator && !isStaff) {
      return res.status(403).json({ error: 'Not authorized to delete this event' });
    }

    await db.query(`UPDATE map_events SET status = 'deleted' WHERE id = $1`, [eventId]);

    if (isStaff && !isCreator) {
      await db.query(
        `INSERT INTO admin_actions (admin_id, action, reason) VALUES ($1, 'delete_event', $2)`,
        [req.user!.id, reason || `Deleted event: ${event.title}`]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('deleteEvent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateEvent(req: AuthenticatedRequest, res: Response) {
  const { eventId } = req.params;
  const { title, description, startsAt, endsAt, maxAttendees } = req.body;

  try {
    const eventRes = await db.query('SELECT * FROM map_events WHERE id = $1', [eventId]);
    if (!eventRes.rows[0]) return res.status(404).json({ error: 'Event not found' });
    if (eventRes.rows[0].created_by !== req.user!.id) {
      return res.status(403).json({ error: 'Only the creator can edit this event' });
    }

    const result = await db.query(
      `UPDATE map_events SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         starts_at = COALESCE($3, starts_at),
         ends_at = COALESCE($4, ends_at),
         max_attendees = COALESCE($5, max_attendees)
       WHERE id = $6 RETURNING *`,
      [title?.trim() || null, description?.trim() || null,
       startsAt ? new Date(startsAt) : null,
       endsAt ? new Date(endsAt) : null,
       maxAttendees ? parseInt(maxAttendees) : null,
       eventId]
    );

    // Also update group conversation name if title changed
    if (title) {
      await db.query(
        `UPDATE group_conversations SET name = $1 WHERE event_id = $2`,
        [title.trim(), eventId]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('updateEvent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// --------------------------------------------------------------------------
// Group chat for events
// --------------------------------------------------------------------------

export async function getGroupMessages(req: AuthenticatedRequest, res: Response) {
  const { conversationId } = req.params;

  try {
    // Verify user is member
    const memberRes = await db.query(
      'SELECT 1 FROM group_members WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user!.id]
    );
    if (!memberRes.rows[0]) return res.status(403).json({ error: 'Not a member of this group' });

    const result = await db.query(
      `SELECT gm.*, u.display_name as sender_name, u.photos[1] as sender_photo
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.conversation_id = $1
       ORDER BY gm.sent_at ASC`,
      [conversationId]
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderPhoto: row.sender_photo,
      type: row.content_type,
      text: row.text,
      mediaUrl: row.media_url,
      sentAt: row.sent_at,
    })));
  } catch (err) {
    console.error('getGroupMessages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function sendGroupMessage(req: AuthenticatedRequest, res: Response) {
  const { conversationId } = req.params;
  const { text } = req.body;

  if (!text?.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    // Verify member
    const memberRes = await db.query(
      'SELECT 1 FROM group_members WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user!.id]
    );
    if (!memberRes.rows[0]) return res.status(403).json({ error: 'Not a member of this group' });

    const result = await db.query(
      `INSERT INTO group_messages (conversation_id, sender_id, content_type, text)
       VALUES ($1, $2, 'text', $3)
       RETURNING *`,
      [conversationId, req.user!.id, text.trim()]
    );

    const userRes = await db.query('SELECT display_name, photos FROM users WHERE id = $1', [req.user!.id]);

    res.json({
      id: result.rows[0].id,
      conversationId,
      senderId: req.user!.id,
      senderName: userRes.rows[0].display_name,
      senderPhoto: userRes.rows[0].photos?.[0] ?? null,
      type: 'text',
      text: result.rows[0].text,
      sentAt: result.rows[0].sent_at,
    });
  } catch (err) {
    console.error('sendGroupMessage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function reportEvent(req: AuthenticatedRequest, res: Response) {
  const { eventId } = req.params;
  try {
    await db.query(
      `UPDATE map_events SET reports_count = reports_count + 1 WHERE id = $1`,
      [eventId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
