import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { db } from '../db/pool';
import crypto from 'crypto';

// ==========================================================================
// Real-time chat via WebSocket
// Handles: 1-to-1 messages, group messages, typing indicators,
//          read receipts, and live unread count pushes.
// ==========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN!;

// userId -> Set<WebSocket>
const connections = new Map<string, Set<WebSocket>>();

function validateInitData(initData: string): number | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (expectedHash !== hash) return null;
    const user = JSON.parse(params.get('user') || '{}');
    return user.id ?? null;
  } catch { return null; }
}

// Push updated unread count to a user across all their connections
async function pushUnreadCount(userId: string) {
  const sockets = connections.get(userId);
  if (!sockets || sockets.size === 0) return;

  try {
    const result = await db.query(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM conversations c
       WHERE (c.user_a = $1 OR c.user_b = $1)
         AND EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id
             AND m.sender_id != $1
             AND m.read_at IS NULL
         )`,
      [userId]
    );
    const unreadConversations = parseInt(result.rows[0].count);

    const payload = JSON.stringify({ type: 'unread_count', count: unreadConversations });
    sockets.forEach(sock => {
      if (sock.readyState === WebSocket.OPEN) sock.send(payload);
    });
  } catch (err) {
    console.error('pushUnreadCount error:', err);
  }
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    let userId: string = '';
    let authed = false;

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // ── Auth handshake ──────────────────────────────────────────
        if (msg.type === 'auth') {
          const telegramId = validateInitData(msg.initData || '');
          if (!telegramId) { ws.close(4001, 'Unauthorized'); return; }

          const result = await db.query(
            'SELECT id FROM users WHERE telegram_id = $1', [telegramId]
          );
          if (!result.rows[0]) { ws.close(4001, 'User not found'); return; }

          userId = result.rows[0].id;
          authed = true;

          if (!connections.has(userId)) connections.set(userId, new Set());
          connections.get(userId)!.add(ws);

          ws.send(JSON.stringify({ type: 'auth_ok', userId }));

          await db.query(
            `UPDATE users SET is_online = true, last_active_at = NOW() WHERE id = $1`, [userId]
          );

          // Send current unread count immediately after auth
          await pushUnreadCount(userId);
          return;
        }

        if (!authed || !userId.length) { ws.close(4001, 'Not authenticated'); return; }

        // ── Send 1:1 message ────────────────────────────────────────
        if (msg.type === 'send_message') {
          const { conversationId, text } = msg;
          if (!conversationId || !text?.trim()) return;

          const conv = await db.query(
            `SELECT * FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
            [conversationId, userId]
          );
          if (!conv.rows[0]) return;

          if (conv.rows[0].is_request && conv.rows[0].user_b === userId) {
            await db.query(`UPDATE conversations SET is_request = FALSE WHERE id = $1`, [conversationId]);
          }

          const saved = await db.query(
            `INSERT INTO messages (conversation_id, sender_id, content_type, text)
             VALUES ($1, $2, 'text', $3)
             RETURNING id, conversation_id, sender_id, content_type as type, text, sent_at, read_at`,
            [conversationId, userId, text.trim()]
          );
          const message = {
            id: saved.rows[0].id,
            conversationId: saved.rows[0].conversation_id,
            senderId: saved.rows[0].sender_id,
            type: saved.rows[0].type,
            text: saved.rows[0].text,
            sentAt: saved.rows[0].sent_at,
            readAt: saved.rows[0].read_at,
          };

          // Confirm delivery to sender
          ws.send(JSON.stringify({ type: 'message', message }));

          const recipientId = conv.rows[0].user_a === userId
            ? conv.rows[0].user_b
            : conv.rows[0].user_a;

          const recipientSockets = connections.get(recipientId);
          if (recipientSockets && recipientSockets.size > 0) {
            const payload = JSON.stringify({ type: 'message', message });
            recipientSockets.forEach(sock => {
              if (sock.readyState === WebSocket.OPEN) sock.send(payload);
            });
            // Push updated unread count to recipient
            await pushUnreadCount(recipientId);
          } else {
            // Recipient offline — check if first unread, send Telegram notification
            try {
              const recipientData = await db.query(
                `SELECT u.telegram_id,
                  (SELECT COUNT(*) FROM messages
                   WHERE conversation_id = $2 AND sender_id != $3 AND read_at IS NULL
                   AND id != $4) as unread_before
                 FROM users u WHERE u.id = $1`,
                [recipientId, conversationId, recipientId, saved.rows[0].id]
              );
              const unreadBefore = parseInt(recipientData.rows[0]?.unread_before ?? '1');
              if (recipientData.rows[0] && unreadBefore === 0) {
                const { sendNotification } = await import('../bot/bot');
                await sendNotification(
                  recipientData.rows[0].telegram_id,
                  '💬 You have a new message on GayTrix.'
                );
              }
            } catch (notifErr) {
              console.error('Notification error:', notifErr);
            }
          }
        }

        // ── Send group message ───────────────────────────────────────
        if (msg.type === 'send_group_message') {
          const { conversationId, text } = msg;
          if (!conversationId || !text?.trim()) return;

          const memberRes = await db.query(
            'SELECT 1 FROM group_members WHERE conversation_id = $1 AND user_id = $2',
            [conversationId, userId]
          );
          if (!memberRes.rows[0]) return;

          const saved = await db.query(
            `INSERT INTO group_messages (conversation_id, sender_id, content_type, text)
             VALUES ($1, $2, 'text', $3) RETURNING *`,
            [conversationId, userId, text.trim()]
          );

          const userRes = await db.query(
            'SELECT display_name, photos FROM users WHERE id = $1', [userId]
          );

          const groupMsg = {
            id: saved.rows[0].id,
            conversationId,
            senderId: userId,
            senderName: userRes.rows[0].display_name,
            senderPhoto: userRes.rows[0].photos?.[0] ?? null,
            type: 'text',
            text: saved.rows[0].text,
            sentAt: saved.rows[0].sent_at,
          };

          // Get all members and push to online ones
          const membersRes = await db.query(
            'SELECT user_id FROM group_members WHERE conversation_id = $1', [conversationId]
          );
          const payload = JSON.stringify({ type: 'group_message', message: groupMsg });
          membersRes.rows.forEach(row => {
            if (row.user_id === userId) {
              ws.send(payload); // confirm to sender
            } else {
              const memberSockets = connections.get(row.user_id);
              memberSockets?.forEach(sock => {
                if (sock.readyState === WebSocket.OPEN) sock.send(payload);
              });
            }
          });
        }

        // ── Typing indicator ────────────────────────────────────────
        if (msg.type === 'typing') {
          const { conversationId } = msg;
          if (!conversationId) return;

          const conv = await db.query(
            `SELECT user_a, user_b FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
            [conversationId, userId]
          );
          if (!conv.rows[0]) return;

          const recipientId = conv.rows[0].user_a === userId
            ? conv.rows[0].user_b
            : conv.rows[0].user_a;

          const recipientSockets = connections.get(recipientId);
          if (recipientSockets) {
            const payload = JSON.stringify({ type: 'typing', conversationId, userId });
            recipientSockets.forEach(sock => {
              if (sock.readyState === WebSocket.OPEN) sock.send(payload);
            });
          }
        }

        // ── Mark read ───────────────────────────────────────────────
        if (msg.type === 'mark_read') {
          const { conversationId } = msg;
          if (!conversationId) return;

          await db.query(
            `UPDATE messages SET read_at = NOW()
             WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
            [conversationId, userId]
          );

          const conv = await db.query(
            `SELECT user_a, user_b FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
            [conversationId, userId]
          );
          if (conv.rows[0]) {
            const recipientId = conv.rows[0].user_a === userId
              ? conv.rows[0].user_b
              : conv.rows[0].user_a;

            const recipientSockets = connections.get(recipientId);
            if (recipientSockets) {
              const payload = JSON.stringify({ type: 'read_receipt', conversationId, readBy: userId });
              recipientSockets.forEach(sock => {
                if (sock.readyState === WebSocket.OPEN) sock.send(payload);
              });
            }
          }

          // Update the reader's own unread count after marking read
          await pushUnreadCount(userId);
        }

        // ── Request current unread count ─────────────────────────────
        if (msg.type === 'get_unread_count') {
          await pushUnreadCount(userId);
        }

      } catch (err) {
        console.error('WS message error:', err);
      }
    });

    ws.on('close', async () => {
      clearInterval(heartbeat);
      if (userId) {
        connections.get(userId)?.delete(ws);
        if (connections.get(userId)?.size === 0) {
          connections.delete(userId);
          await db.query(
            `UPDATE users SET is_online = false, last_active_at = NOW() WHERE id = $1`, [userId]
          );
        }
      }
    });
  });

  console.log('✅ WebSocket server ready on /ws');
  return wss;
}
