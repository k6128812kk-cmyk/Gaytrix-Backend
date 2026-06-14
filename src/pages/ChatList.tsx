import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { chatService } from '@/api/services';
import type { Conversation } from '@/types';
import styles from './ChatList.module.css';

// ==========================================================================
// ChatList — list of conversations. Message requests (first contact from
// a non-matched user) are surfaced separately and require acceptance.
// ==========================================================================

export function ChatListPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chatService.getConversations()
      .then((data) => {
        setConversations(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load conversations:', err);
        setError('Failed to load conversations. Please try again.');
        setLoading(false);
      });
  }, []);

  const requests = conversations.filter((c) => c.isMessageRequest);
  const active = conversations.filter((c) => !c.isMessageRequest);

  return (
    <div className={styles.page}>
      <PageHeader title="Chat" />

      <div className={styles.content}>
        {loading && (
          <div className={styles.skeletonList}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className={styles.empty}>
            <h3>Something went wrong</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Message requests ({requests.length})</h2>
            {requests.map((conv) => (
              <ConversationRow key={conv.id} conversation={conv} onClick={() => navigate(`/chat/${conv.id}`)} />
            ))}
          </section>
        )}

        {!loading && (
          <section className={styles.section}>
            {active.length === 0 ? (
              <div className={styles.empty}>
                <h3>No conversations yet</h3>
                <p>Start a conversation from someone's profile in Discover.</p>
              </div>
            ) : (
              active.map((conv) => <ConversationRow key={conv.id} conversation={conv} onClick={() => navigate(`/chat/${conv.id}`)} />)
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ conversation, onClick }: { conversation: Conversation; onClick: () => void }) {
  const { participant, lastMessage, unreadCount, isMessageRequest } = conversation;

  return (
    <button className={styles.row} onClick={onClick}>
      <Avatar
        src={participant.photos[0]}
        alt={participant.displayName}
        size={52}
        isOnline={participant.isOnline}
        verification={participant.verification}
        membership={participant.membership}
        adminRole={participant.adminRole}
      />
      <div className={styles.rowText}>
        <div className={styles.rowTop}>
          <span className={styles.rowName}>{participant.displayName}</span>
          {lastMessage && (
            <span className={styles.rowTime}>{formatDistanceToNowStrict(new Date(lastMessage.sentAt))} ago</span>
          )}
        </div>
        <div className={styles.rowBottom}>
          <span className={styles.rowPreview}>
            {isMessageRequest ? 'Wants to send you a message' : lastMessage?.text ?? 'No messages yet'}
          </span>
          {unreadCount > 0 && <Badge variant="premium">{unreadCount}</Badge>}
        </div>
      </div>
    </button>
  );
}
