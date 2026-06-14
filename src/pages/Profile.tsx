import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ShieldCheck, Crown, Settings,
  Eye, Bell, HelpCircle, LogOut, ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { useSessionStore } from '@/context/sessionStore';
import styles from './Profile.module.css';

// ==========================================================================
// Profile — own profile page.
// Admin panel link is ONLY shown when adminRole is super_admin or admin,
// as returned by the server. The client never self-assigns this.
// ==========================================================================

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, isAdmin, isModerator } = useSessionStore();

  if (!profile) return null;

  const verificationLabel =
    profile.verification === 'verified' ? 'Verified ✓' :
    profile.verification === 'pending' ? 'Verification pending...' :
    profile.verification === 'rejected' ? 'Verification rejected — retry' :
    'Get verified';

  return (
    <div className={styles.page}>
      <PageHeader title="Profile" />

      <div className={styles.content}>
        <button className={styles.profileSummary} onClick={() => navigate('/profile/edit')}>
          <Avatar
            src={profile.photos[0] ?? 'https://i.pravatar.cc/100'}
            alt={profile.displayName}
            size={64}
            isOnline={profile.isOnline}
            verification={profile.verification}
            membership={profile.membership}
          />
          <div className={styles.summaryText}>
            <h2 className={styles.name}>{profile.displayName}</h2>
            <p className={styles.username}>@{profile.telegramUsername}</p>
            <p className={styles.telegramId}>Telegram ID: {profile.telegramId}</p>
            <div className={styles.badgeRow}>
              {isAdmin() && <Badge variant="gold">👑 Admin</Badge>}
              {!isAdmin() && isModerator() && <Badge variant="gold">🛡 Moderator</Badge>}
              {profile.verification === 'verified' && !isAdmin() && <Badge variant="gold">Verified</Badge>}
              {profile.membership === 'premium' && <Badge variant="premium">Premium</Badge>}
            </div>
          </div>
          <ChevronRight size={18} className={styles.chevron} />
        </button>

        <nav className={styles.menu}>
          <MenuItem
            icon={ShieldCheck}
            label={verificationLabel}
            sublabel="Optional badge for trusted profiles"
            onClick={() => navigate('/profile/verification')}
            highlight={profile.verification !== 'verified'}
          />
          <MenuItem
            icon={Crown}
            label={profile.membership === 'premium' ? 'Manage Premium' : 'Upgrade to Premium'}
            sublabel="Boosts, advanced filters, profile views"
            onClick={() => navigate('/profile/premium')}
            highlight={profile.membership !== 'premium'}
          />
          <MenuItem icon={Settings} label="Edit profile" onClick={() => navigate('/profile/edit')} />
          <MenuItem icon={Eye} label="Privacy settings" onClick={() => navigate('/profile/privacy')} />
          <MenuItem icon={Bell} label="Notifications" onClick={() => navigate('/profile/notifications')} />
          {/* Admin panel — only shown when server assigns admin/super_admin role */}
          {isAdmin() && (
            <MenuItem
              icon={ShieldAlert}
              label={isAdmin() ? '👑 Admin Panel' : '🛡 Moderator Panel'}
              sublabel="Manage users, reports, verification"
              onClick={() => navigate('/admin')}
              accent
            />
          )}
          <MenuItem icon={HelpCircle} label="Help & support" onClick={() => navigate('/profile/help')} />
          <MenuItem icon={LogOut} label="Sign out" onClick={() => {}} danger />
        </nav>
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon, label, sublabel, onClick, highlight, danger, accent,
}: {
  icon: typeof Settings; label: string; sublabel?: string;
  onClick: () => void; highlight?: boolean; danger?: boolean; accent?: boolean;
}) {
  return (
    <button className={styles.menuItem} onClick={onClick}>
      <span className={`${styles.menuIcon} ${highlight ? styles.menuIconHighlight : ''} ${accent ? styles.menuIconAccent : ''}`}>
        <Icon size={18} />
      </span>
      <span className={styles.menuText}>
        <span className={`${styles.menuLabel} ${danger ? styles.menuLabelDanger : ''}`}>{label}</span>
        {sublabel && <span className={styles.menuSublabel}>{sublabel}</span>}
      </span>
      <ChevronRight size={16} className={styles.chevron} />
    </button>
  );
}
