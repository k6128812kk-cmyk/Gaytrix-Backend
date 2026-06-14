import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import styles from './Notifications.module.css';

// ==========================================================================
// Notifications — simple toggle list for push notification categories.
// Backed by the bot's notification dispatcher on the backend.
// ==========================================================================

const CATEGORIES = [
  { key: 'messages', label: 'New messages', description: 'Get notified when someone sends you a message' },
  { key: 'likes', label: 'Profile views', description: 'Someone viewed your profile (Premium)' },
  { key: 'events', label: 'Community events', description: 'New events near you and RSVP reminders' },
  { key: 'verification', label: 'Verification updates', description: 'Status changes to your verification request' },
  { key: 'announcements', label: 'Announcements', description: 'Important platform updates from GayTrix' },
];

export function NotificationsPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    messages: true,
    likes: true,
    events: true,
    verification: true,
    announcements: true,
  });

  return (
    <div className={styles.page}>
      <PageHeader title="Notifications" showBack />
      <div className={styles.content}>
        <section className={styles.group}>
          {CATEGORIES.map((cat) => (
            <div key={cat.key} className={styles.row}>
              <div className={styles.rowText}>
                <p className={styles.label}>{cat.label}</p>
                <p className={styles.description}>{cat.description}</p>
              </div>
              <button
                className={`${styles.toggle} ${enabled[cat.key] ? styles.toggleOn : ''}`}
                onClick={() => setEnabled((prev) => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                aria-pressed={enabled[cat.key]}
                aria-label={cat.label}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
