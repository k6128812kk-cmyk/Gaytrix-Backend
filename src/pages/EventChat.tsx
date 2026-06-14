import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { eventService } from '@/api/services';
import { useSessionStore } from '@/context/sessionStore';
import { wsClient, useGlobalWs } from '@/hooks/useGlobalWs';
import type { GroupMessage } from '@/types';
import styles from './Conversation.module.css';

// ==========================================================================
// EventChat — group chat for a map event.
// Uses the global WebSocket for real-time messaging.
// ==========================================================================

export function EventChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { profile } = useSessionStore();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [groupName] = useState('Event Chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use global WS
  useGlobalWs();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Load message history
  useEffect(() => {
    if (!conversationId) return;
    eventService.getGroupMessages(conversationId)
      .then(msgs => { setMessages(msgs); setLoading(false); })
      .catch(() => setLoading(false));
  }, [conversationId]);

  // Subscribe to group messages from global WS
  useEffect(() => {
    const handler = (msg: Record<string, unknown>) => {
      const gm = msg.message as GroupMessage;
      if (gm?.conversationId === conversationId) {
        setMessages(prev => {
          if (prev.some(m => m.id === gm.id)) return prev;
          return [...prev, gm];
        });
      }
    };
    wsClient.addHandler('group_message', handler);
    return () => wsClient.removeHandler('group_message', handler);
  }, [conversationId]);

  function handleSend() {
    if (!conversationId || !draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    wsClient.send({ type: 'send_group_message', conversationId, text });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{groupName}</span>
          <span className={styles.headerStatus}>Group chat</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className={styles.messages}>
        {loading && <div className={styles.loadingMsg}>Loading messages...</div>}

        {!loading && messages.length === 0 && (
          <div className={styles.emptyMsg}>
            No messages yet. Be the first to say hello! 👋
          </div>
        )}

        {messages.map(msg => {
          const isMe = msg.senderId === profile?.id;
          return (
            <div key={msg.id} className={`${styles.msgRow} ${isMe ? styles.msgRowMe : ''}`}>
              {!isMe && (
                <div className={styles.groupSender}>
                  <span className={styles.groupSenderName}>{msg.senderName}</span>
                </div>
              )}
              <div className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}>
                {msg.text && <span className={styles.msgText}>{msg.text}</span>}
                <span className={styles.msgTime}>{format(new Date(msg.sentAt), 'HH:mm')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the group..."
          rows={1}
          className={styles.input}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={!draft.trim()}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
