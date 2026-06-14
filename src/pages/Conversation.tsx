import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Mic, Image as ImageIcon, Check, CheckCheck, X } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { chatService } from '@/api/services';
import { useSessionStore } from '@/context/sessionStore';
import { wsClient } from '@/hooks/useGlobalWs';
import type { ChatMessage, Conversation } from '@/types';
import styles from './Conversation.module.css';

const WS_URL = (import.meta.env.VITE_API_BASE_URL ?? '')
  .replace('/v1', '')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://') + '/ws';

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useSessionStore();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ file: File; url: string } | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, partnerTyping]);

  // Load history via REST
  useEffect(() => {
    if (!id) return;
    Promise.all([
      chatService.getConversations(),
      chatService.getMessages(id),
    ]).then(([convos, msgs]) => {
      setConversation(convos.find((c) => c.id === id) ?? null);
      setMessages(msgs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  // WebSocket
  const connectWs = useCallback(() => {
    if (!id) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', initData }));

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'auth_ok') {
          setConnected(true);
          ws.send(JSON.stringify({ type: 'mark_read', conversationId: id }));
          // Request updated global unread count via the shared connection
          wsClient.send({ type: 'get_unread_count' });
        }
        if (msg.type === 'message' && msg.message.conversationId === id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.message.id)) return prev;
            return [...prev, msg.message];
          });
          setPartnerTyping(false);
          // Mark their message as read immediately
          ws.send(JSON.stringify({ type: 'mark_read', conversationId: id }));
        }
        if (msg.type === 'read_receipt' && msg.conversationId === id) {
          // Update all our sent messages to show read (checkmark ✓✓)
          const readAt = new Date().toISOString();
          setMessages((prev) => prev.map((m) =>
            m.senderId === profile?.id && !m.readAt ? { ...m, readAt } : m
          ));
        }
        if (msg.type === 'typing' && msg.conversationId === id && msg.userId !== profile?.id) {
          setPartnerTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setPartnerTyping(false), 3000);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connectWs, 3000);
    };

    ws.onerror = () => ws.close();
  }, [id, profile?.id]);

  useEffect(() => {
    connectWs();
    return () => {
      clearTimeout(reconnectTimer.current);
      clearTimeout(typingTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // Typing indicator — send via WS when user types
  function handleDraftChange(value: string) {
    setDraft(value);
    if (wsRef.current?.readyState === WebSocket.OPEN && connected && id) {
      wsRef.current.send(JSON.stringify({ type: 'typing', conversationId: id }));
    }
  }

  async function handleSend() {
    if (!id || !draft.trim()) return;
    const text = draft.trim();
    setDraft('');

    if (wsRef.current?.readyState === WebSocket.OPEN && connected) {
      wsRef.current.send(JSON.stringify({ type: 'send_message', conversationId: id, text }));
    } else {
      const message = await chatService.sendMessage(id, text);
      setMessages((prev) => [...prev, message]);
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview({ file, url: URL.createObjectURL(file) });
    e.target.value = '';
  }

  async function handleSendPhoto() {
    if (!id || !photoPreview) return;
    setSendingPhoto(true);
    try {
      const message = await chatService.sendPhotoMessage(id, photoPreview.file);
      setMessages((prev) => [...prev, message]);
      setPhotoPreview(null);
    } finally {
      setSendingPhoto(false);
    }
  }

  const title = conversation?.participant.displayName ?? 'Chat';
  const currentUserId = profile?.id ?? '';

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        showBack
        action={
          <span style={{ fontSize: 11, color: connected ? 'var(--color-success, #5ee6a8)' : 'var(--color-text-faint)' }}>
            {connected ? '● Live' : '○ Offline'}
          </span>
        }
      />

      <div className={styles.messages} ref={scrollRef}>
        {loading && <div className={styles.loading}>Loading messages...</div>}

        {!loading && messages.length === 0 && (
          <div className={styles.requestNotice}>
            <p>{conversation?.isMessageRequest
              ? <><strong>{title}</strong> wants to message you. Reply to start.</>
              : 'No messages yet. Say hello!'
            }</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={`${styles.bubbleRow} ${isMine ? styles.bubbleRowMine : ''}`}>
              <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                {msg.type === 'text' && <p>{msg.text}</p>}
                {msg.type === 'voice' && (
                  <div className={styles.voiceNote}>
                    <Mic size={16} />
                    <div className={styles.voiceBar} />
                    <span>{msg.durationSec}s</span>
                  </div>
                )}
                {msg.type === 'image' && msg.mediaUrl && (
                  <img
                    src={msg.mediaUrl}
                    alt="Shared photo"
                    className={styles.mediaImage}
                    style={{ maxWidth: 220, borderRadius: 12, display: 'block' }}
                  />
                )}
                <div className={styles.bubbleMeta}>
                  <span>{format(new Date(msg.sentAt), 'HH:mm')}</span>
                  {isMine && (msg.readAt ? <CheckCheck size={13} /> : <Check size={13} />)}
                </div>
              </div>
            </div>
          );
        })}

        {partnerTyping && (
          <div className={styles.bubbleRow}>
            <div className={`${styles.bubble} ${styles.bubbleTheirs}`}>
              <span style={{ fontSize: 20, letterSpacing: 2 }}>···</span>
            </div>
          </div>
        )}
      </div>

      {/* Photo preview */}
      {photoPreview && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, zIndex: 200,
        }}>
          <img src={photoPreview.url} alt="Preview" style={{ maxWidth: '80%', maxHeight: '60vh', borderRadius: 12 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setPhotoPreview(null)} style={{ padding: '10px 20px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15 }}>
              <X size={16} style={{ verticalAlign: 'middle' }} /> Cancel
            </button>
            <button
              onClick={handleSendPhoto}
              disabled={sendingPhoto}
              style={{ padding: '10px 24px', borderRadius: 20, background: 'var(--color-accent)', color: '#1a1014', fontSize: 15, fontWeight: 700 }}
            >
              {sendingPhoto ? 'Sending...' : 'Send Photo'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.composer}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
        <button className={styles.composerIcon} aria-label="Attach photo" onClick={() => fileInputRef.current?.click()}>
          <ImageIcon size={20} />
        </button>
        <input
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Message..."
          className={styles.composerInput}
        />
        {draft.trim() ? (
          <button className={styles.sendButton} onClick={handleSend} aria-label="Send">
            <Send size={18} />
          </button>
        ) : (
          <button className={styles.composerIcon} aria-label="Voice note">
            <Mic size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
