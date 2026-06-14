import { useEffect, useState } from 'react';
import { ShieldCheck, UserMinus, UserPlus, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { adminService } from '@/api/services';
import type { UserProfile } from '@/types';
import styles from './Admin.module.css';

// ==========================================================================
// AdminModerators — manage moderator team (admin only)
// ==========================================================================

export function AdminModerators() {
  const [moderators, setModerators] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [demoting, setDemoting] = useState<string | null>(null);
  const [tab, setTab] = useState<'moderators' | 'add'>('moderators');

  useEffect(() => {
    loadModerators();
  }, []);

  async function loadModerators() {
    setLoading(true);
    try {
      const mods = await adminService.getModerators();
      setModerators(mods);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (!search.trim()) return;
    const users = await adminService.getUsers({ search: search.trim() });
    setAllUsers(users.filter(u => u.adminRole === 'none'));
  }

  async function handlePromote(userId: string) {
    setPromoting(userId);
    try {
      await adminService.promoteModerator(userId);
      await loadModerators();
      setAllUsers(prev => prev.filter(u => u.id !== userId));
    } finally {
      setPromoting(null);
    }
  }

  async function handleDemote(userId: string) {
    setDemoting(userId);
    try {
      await adminService.demoteModerator(userId);
      await loadModerators();
    } finally {
      setDemoting(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Moderators" showBack />

      <div className={styles.content}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'moderators' ? styles.tabActive : ''}`}
            onClick={() => setTab('moderators')}
          >
            Current moderators ({moderators.length})
          </button>
          <button
            className={`${styles.tab} ${tab === 'add' ? styles.tabActive : ''}`}
            onClick={() => setTab('add')}
          >
            Add moderator
          </button>
        </div>

        {tab === 'moderators' && (
          <section className={styles.section}>
            {loading && <p className={styles.loadingText}>Loading...</p>}
            {!loading && moderators.length === 0 && (
              <div className={styles.empty}>
                <ShieldCheck size={40} />
                <p>No moderators yet. Add moderators from the "Add moderator" tab.</p>
              </div>
            )}
            {moderators.map(mod => (
              <div key={mod.id} className={styles.userRow}>
                <Avatar
                  src={mod.photos[0] ?? ''}
                  alt={mod.displayName}
                  size={44}
                  adminRole={mod.adminRole}
                  verification={mod.verification}
                />
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{mod.displayName || 'No name'}</span>
                  <span className={styles.userMeta}>@{mod.telegramUsername}</span>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDemote(mod.id)}
                  disabled={demoting === mod.id}
                >
                  <UserMinus size={14} />
                  {demoting === mod.id ? '...' : 'Remove'}
                </Button>
              </div>
            ))}
          </section>
        )}

        {tab === 'add' && (
          <section className={styles.section}>
            <div className={styles.searchRow}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search by username or name..."
                className={styles.searchInput}
              />
              <Button size="sm" onClick={handleSearch}>
                <Search size={14} /> Search
              </Button>
            </div>

            {allUsers.length === 0 && (
              <p className={styles.hintText}>Search for a user to promote them to moderator.</p>
            )}

            {allUsers.map(user => (
              <div key={user.id} className={styles.userRow}>
                <Avatar
                  src={user.photos[0] ?? ''}
                  alt={user.displayName}
                  size={44}
                  verification={user.verification}
                />
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{user.displayName || 'No name'}</span>
                  <span className={styles.userMeta}>@{user.telegramUsername}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handlePromote(user.id)}
                  disabled={promoting === user.id}
                >
                  <UserPlus size={14} />
                  {promoting === user.id ? '...' : 'Make mod'}
                </Button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
