import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { db } from '../db/pool';
import crypto from 'crypto';

// ==========================================================================
// Real-time chat via WebSocket
// Auth: client sends { type:'auth', initData: '...' } as first message.
// We validate the Telegram initData HMAC, then store the connection.
// Messages are saved to DB and pushed to the recipient if online.
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

          // Mark user online
          await db.query(
            `UPDATE users SET is_online = true, last_active_at = NOW() WHERE id = $1`, [userId]
          );
          return;
        }

        if (!authed || !userId.length) { ws.close(4001, 'Not authenticated'); return; }

        // ── Send message ────────────────────────────────────────────
        if (msg.type === 'send_message') {
          const { conversationId, text } = msg;
          if (!conversationId || !text?.trim()) return;

          // Verify user belongs to conversation
          const conv = await db.query(
            `SELECT * FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
            [conversationId, userId]
          );
          if (!conv.rows[0]) return;

          // Accept message request on first reply from recipient
          if (conv.rows[0].is_request && conv.rows[0].user_b === userId) {
            await db.query(`UPDATE conversations SET is_request = FALSE WHERE id = $1`, [conversationId]);
          }

          // Save to DB
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

          // Push to sender (confirm delivery)
          ws.send(JSON.stringify({ type: 'message', message }));

          // Push to recipient if online
          const recipientId = conv.rows[0].user_a === userId
            ? conv.rows[0].user_b
            : conv.rows[0].user_a;

          const recipientSockets = connections.get(recipientId);
          if (recipientSockets) {
            const payload = JSON.stringify({ type: 'message', message });
            recipientSockets.forEach(sock => {
              if (sock.readyState === WebSocket.OPEN) sock.send(payload);
            });
          }
        }

        // ── Typing indicator ────────────────────────────────────────
        if (msg.type === 'typing') {
          const { conversationId } = msg;
          if (!conversationId) return;

          // Find the other participant and notify them
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

          // Notify the other participant that their messages have been read
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
