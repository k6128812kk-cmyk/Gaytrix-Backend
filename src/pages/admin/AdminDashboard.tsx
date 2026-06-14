import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, ShieldCheck, Crown, AlertTriangle,
  Clock, UserX, TrendingUp, Megaphone, ChevronRight, Star,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { adminService } from '@/api/services';
import { useSessionStore } from '@/context/sessionStore';
import type { PlatformStats } from '@/types';
import styles from './Admin.module.css';

// ==========================================================================
// AdminDashboard — overview stats + quick-action tiles.
// Only reachable if adminRole is super_admin or admin (enforced by AdminGuard
// in App.tsx and by the backend on every /admin/* API call).
// ==========================================================================

export function AdminDashboard() {
  const navigate = useNavigate();
  const { profile } = useSessionStore();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    adminService.getStats().then(setStats);
  }, []);

  async function handleAnnouncement() {
    if (!announcement.trim()) return;
    setSending(true);
    await adminService.sendAnnouncement(announcement.trim());
    setSending(false);
    setSent(true);
    setAnnouncement('');
    setTimeout(() => setSent(false), 3000);
  }

  const isAdminRole = profile?.adminRole === 'super_admin' || profile?.adminRole === 'admin';

  return (
    <div className={styles.page}>
      <PageHeader
        title="Admin Panel"
        showBack
        action={
          <div className={styles.adminBadge}>
            {isAdminRole ? '👑 Admin' : '🛡 Moderator'}
          </div>
        }
      />

      <div className={styles.content}>
        {/* Stats grid */}
        {stats && (
          <section className={styles.statsGrid}>
            <StatCard icon={Users} label="Total users" value={stats.totalUsers} color="cyan" />
            <StatCard icon={TrendingUp} label="Active today" value={stats.activeToday} color="cyan" />
            <StatCard icon={ShieldCheck} label="Verified" value={stats.verifiedUsers} color="gold" />
            <StatCard icon={Crown} label="Premium" value={stats.premiumUsers} color="coral" />
            <StatCard icon={Clock} label="Pending verifications" value={stats.pendingVerifications} color="gold" alert={stats.pendingVerifications > 0} />
            <StatCard icon={AlertTriangle} label="Pending reports" value={stats.pendingReports} color="danger" alert={stats.pendingReports > 0} />
            <StatCard icon={UserX} label="Banned users" value={stats.bannedUsers} color="danger" />
            <StatCard icon={Star} label="New this week" value={stats.newUsersThisWeek} color="cyan" />
          </section>
        )}

        {/* Quick navigation */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Manage</h2>
          <nav className={styles.menuList}>
            <NavItem icon={Users} label="All users" sublabel="Search, filter, manage accounts" to="/admin/users" />
            <NavItem icon={ShieldCheck} label="Verification queue" sublabel="Review selfie submissions" to="/admin/verification"
              badge={stats?.pendingVerifications} />
            <NavItem icon={AlertTriangle} label="Reports" sublabel="Review user reports" to="/admin/reports"
              badge={stats?.pendingReports} />
            <NavItem icon={Clock} label="Audit log" sublabel="All admin actions" to="/admin/audit" />
            {isAdminRole && (
              <NavItem icon={ShieldCheck} label="Moderators" sublabel="Manage moderator team" to="/admin/moderators" />
            )}
          </nav>
        </section>

        {/* Broadcast announcement — admin only */}
        {isAdminRole && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Send announcement</h2>
          <div className={styles.announcementBox}>
            <textarea
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="Write a platform-wide announcement... (sent to all users via the Telegram bot)"
              rows={4}
              className={styles.announcementInput}
              maxLength={1000}
            />
            <div className={styles.announcementFooter}>
              <span className={styles.charCount}>{announcement.length}/1000</span>
              <Button onClick={handleAnnouncement} disabled={!announcement.trim() || sending}>
                <Megaphone size={16} />
                {sending ? 'Sending...' : sent ? 'Sent ✓' : 'Send to all users'}
              </Button>
            </div>
          </div>
        </section>
        )}
      </div>
    </div>
  );

  function NavItem({ icon: Icon, label, sublabel, to, badge }: {
    icon: typeof Users; label: string; sublabel: string; to: string; badge?: number;
  }) {
    return (
      <button className={styles.menuItem} onClick={() => navigate(to)}>
        <span className={styles.menuIcon}><Icon size={18} /></span>
        <span className={styles.menuText}>
          <span className={styles.menuLabel}>{label}</span>
          <span className={styles.menuSublabel}>{sublabel}</span>
        </span>
        {badge != null && badge > 0 && <span className={styles.menuBadge}>{badge}</span>}
        <ChevronRight size={16} className={styles.chevron} />
      </button>
    );
  }
}

function StatCard({ icon: Icon, label, value, color, alert }: {
  icon: typeof Users; label: string; value: number;
  color: 'cyan' | 'gold' | 'coral' | 'danger'; alert?: boolean;
}) {
  return (
    <div className={`${styles.statCard} ${alert ? styles.statAlert : ''}`}>
      <span className={`${styles.statIcon} ${styles[`statIcon_${color}`]}`}>
        <Icon size={18} />
      </span>
      <span className={styles.statValue}>{value.toLocaleString()}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
