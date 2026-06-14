import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Messages controller — persistent conversations stored in PostgreSQL.
// ==========================================================================

export async function getConversations(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT
        c.id,
        c.is_request,
        -- Get the other participant
        CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END as participant_id,
        -- Last message
        (SELECT row_to_json(m) FROM (
          SELECT id, content_type as type, text, sent_at, read_at
          FROM messages WHERE conversation_id = c.id
          ORDER BY sent_at DESC LIMIT 1
        ) m) as last_message,
        -- Unread count
        (SELECT COUNT(*) FROM messages
         WHERE conversation_id = c.id
           AND sender_id != $1
           AND read_at IS NULL) as unread_count
       FROM conversations c
       WHERE c.user_a = $1 OR c.user_b = $1
       ORDER BY (
         SELECT sent_at FROM messages WHERE conversation_id = c.id
         ORDER BY sent_at DESC LIMIT 1
       ) DESC NULLS LAST`,
      [req.user!.id]
    );

    // Fetch participant details for each conversation
    const conversations = await Promise.all(
      result.rows.map(async (row) => {
        const participant = await db.query(
          `SELECT id, display_name, photos, is_online, verification_status,
                  membership_tier, admin_role, hide_online_status
           FROM users WHERE id = $1`,
          [row.participant_id]
        );
        const p = participant.rows[0];
        return {
          id: row.id,
          isMessageRequest: row.is_request,
          unreadCount: parseInt(row.unread_count),
          lastMessage: row.last_message,
          participant: p ? {
            id: p.id,
            displayName: p.display_name,
            photos: p.photos,
            isOnline: p.hide_online_status ? false : p.is_online,
            verification: p.verification_status,
            membership: p.membership_tier,
            adminRole: p.admin_role,
          } : null,
        };
      })
    );

    res.json(conversations.filter(c => c.participant !== null));
  } catch (err) {
    console.error('getConversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getMessages(req: AuthenticatedRequest, res: Response) {
  const { conversationId } = req.params;

  try {
    // Verify user is part of this conversation
    const conv = await db.query(
      `SELECT * FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
      [conversationId, req.user!.id]
    );
    if (!conv.rows[0]) return res.status(403).json({ error: 'Access denied' });

    const result = await db.query(
      `SELECT id, conversation_id, sender_id, content_type as type,
              text, media_url, duration_sec, sent_at, read_at
       FROM messages WHERE conversation_id = $1
       ORDER BY sent_at ASC`,
      [conversationId]
    );

    // Mark messages as read
    await db.query(
      `UPDATE messages SET read_at = NOW()
       WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [conversationId, req.user!.id]
    );

    res.json(result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      type: row.type,
      text: row.text,
      mediaUrl: row.media_url,
      durationSec: row.duration_sec,
      sentAt: row.sent_at,
      readAt: row.read_at,
    })));
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function sendMessage(req: AuthenticatedRequest, res: Response) {
  const { conversationId } = req.params;
  const { text } = req.body;

  if (!text?.trim()) return res.status(400).json({ error: 'Message text required' });

  try {
    // Verify user is part of this conversation
    const conv = await db.query(
      `SELECT * FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
      [conversationId, req.user!.id]
    );
    if (!conv.rows[0]) return res.status(403).json({ error: 'Access denied' });

    // After first message from recipient, mark as accepted (not a request anymore)
    if (conv.rows[0].is_request && conv.rows[0].user_b === req.user!.id) {
      await db.query(
        `UPDATE conversations SET is_request = FALSE WHERE id = $1`,
        [conversationId]
      );
    }

    const result = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content_type, text)
       VALUES ($1, $2, 'text', $3)
       RETURNING id, conversation_id, sender_id, content_type as type, text, sent_at, read_at`,
      [conversationId, req.user!.id, text.trim()]
    );

    res.json({
      id: result.rows[0].id,
      conversationId: result.rows[0].conversation_id,
      senderId: result.rows[0].sender_id,
      type: result.rows[0].type,
      text: result.rows[0].text,
      sentAt: result.rows[0].sent_at,
      readAt: result.rows[0].read_at,
    });
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function startConversation(req: AuthenticatedRequest, res: Response) {
  const { targetUserId, text } = req.body;
  if (!targetUserId || !text?.trim()) {
    return res.status(400).json({ error: 'targetUserId and text required' });
  }

  try {
    // Check if conversation already exists
    const existing = await db.query(
      `SELECT id FROM conversations
       WHERE (user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1)`,
      [req.user!.id, targetUserId]
    );

    let conversationId: string;
    if (existing.rows[0]) {
      conversationId = existing.rows[0].id;
    } else {
      const conv = await db.query(
        `INSERT INTO conversations (user_a, user_b, is_request)
         VALUES ($1, $2, TRUE) RETURNING id`,
        [req.user!.id, targetUserId]
      );
      conversationId = conv.rows[0].id;
    }

    // Send first message
    const msg = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content_type, text)
       VALUES ($1, $2, 'text', $3)
       RETURNING id, conversation_id, sender_id, content_type as type, text, sent_at, read_at`,
      [conversationId, req.user!.id, text.trim()]
    );

    res.json({
      conversationId,
      message: {
        id: msg.rows[0].id,
        senderId: msg.rows[0].sender_id,
        type: msg.rows[0].type,
        text: msg.rows[0].text,
        sentAt: msg.rows[0].sent_at,
      },
    });
  } catch (err) {
    console.error('startConversation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
