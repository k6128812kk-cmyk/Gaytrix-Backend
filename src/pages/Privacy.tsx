import { useEffect, useState } from 'react';
import { EyeOff, MapPin, Lock, Ghost, Users, UserX } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useSessionStore } from '@/context/sessionStore';
import { profileService } from '@/api/services';
import { api } from '@/api/client';
import type { PrivacySettings } from '@/types';
import styles from './Privacy.module.css';

const TOGGLES: {
  key: keyof PrivacySettings;
  icon: typeof EyeOff;
  label: string;
  description: string;
}[] = [
  { key: 'hideExactLocation', icon: MapPin, label: 'Approximate location only', description: 'Show your general area instead of your precise location.' },
  { key: 'invisibleMode', icon: Ghost, label: 'Invisible mode', description: "Browse without appearing in other people's discovery feeds." },
  { key: 'hideOnlineStatus', icon: EyeOff, label: 'Hide online status', description: 'Stop showing the green online indicator and "last active" time.' },
  { key: 'privateProfile', icon: Lock, label: 'Private profile', description: 'Only people you message first can view your full profile.' },
];

interface BlockedUser {
  id: string;
  displayName: string;
  photos: string[];
  telegramUsername: string;
}

export function PrivacyPage() {
  const { profile, updateProfile } = useSessionStore();
  const [saving, setSaving] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  useEffect(() => {
    api.get<BlockedUser[]>('/users/blocked')
      .then(({ data }) => { setBlockedUsers(data); setLoadingBlocked(false); })
      .catch(() => setLoadingBlocked(false));
  }, []);

  if (!profile) return null;

  async function toggle(key: keyof PrivacySettings) {
    const next = { ...profile!.privacy, [key]: !profile!.privacy[key] };
    setSaving(key);
    try {
      const updated = await profileService.updateMe({ privacy: next });
      updateProfile(updated);
    } finally {
      setSaving(null);
    }
  }

  async function handleUnblock(userId: string) {
    setUnblocking(userId);
    try {
      await api.delete(`/users/${userId}/block`);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setUnblocking(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Privacy" showBack />

      <div className={styles.content}>
        <section className={styles.group}>
          {TOGGLES.map(({ key, icon: Icon, label, description }) => (
            <div key={key} className={styles.row}>
              <span className={styles.icon}><Icon size={18} /></span>
              <div className={styles.rowText}>
                <p className={styles.label}>{label}</p>
                <p className={styles.description}>{description}</p>
              </div>
              <button
                className={`${styles.toggle} ${profile.privacy[key] ? styles.toggleOn : ''}`}
                onClick={() => toggle(key)}
                disabled={saving === key}
                aria-pressed={profile.privacy[key]}
                aria-label={label}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          ))}
        </section>

        <section className={styles.group}>
          <div className={styles.row}>
            <span className={styles.icon}><Users size={18} /></span>
            <div className={styles.rowText}>
              <p className={styles.label}>Blocked users</p>
              <p className={styles.description}>People you've blocked can't see your profile or message you.</p>
            </div>
          </div>

          {loadingBlocked && (
            <div style={{ padding: '12px 16px', color: 'var(--color-text-faint)', fontSize: 13 }}>
              Loading...
            </div>
          )}

          {!loadingBlocked && blockedUsers.length === 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--color-text-faint)', fontSize: 13 }}>
              You haven't blocked anyone.
            </div>
          )}

          {blockedUsers.map((user) => (
            <div key={user.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px', borderTop: '1px solid var(--color-border)',
            }}>
              <img
                src={user.photos?.[0] ?? 'https://i.pravatar.cc/100'}
                alt={user.displayName}
                style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.displayName}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>
                  @{user.telegramUsername}
                </p>
              </div>
              <button
                onClick={() => handleUnblock(user.id)}
                disabled={unblocking === user.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent', color: 'var(--color-text-muted)',
                  fontSize: 12, cursor: 'pointer', flexShrink: 0,
                  opacity: unblocking === user.id ? 0.5 : 1,
                }}
              >
                <UserX size={13} />
                {unblocking === user.id ? 'Unblocking...' : 'Unblock'}
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
