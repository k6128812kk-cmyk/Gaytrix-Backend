import { NavLink } from 'react-router-dom';
import { Compass, Map, MessageCircle, User } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useSessionStore } from '@/context/sessionStore';
import styles from './TabBar.module.css';

// ==========================================================================
// TabBar — primary navigation with unread message badge on Chat tab.
// ==========================================================================

export function TabBar() {
  const { haptic } = useTelegram();
  const { totalUnreadCount } = useSessionStore();

  const TABS = [
    { to: '/discover', label: 'Discover', icon: Compass, badge: 0 },
    { to: '/map', label: 'Map', icon: Map, badge: 0 },
    { to: '/chat', label: 'Chat', icon: MessageCircle, badge: totalUnreadCount },
    { to: '/profile', label: 'Profile', icon: User, badge: 0 },
  ];

  return (
    <nav className={styles.tabbar} aria-label="Primary">
      {TABS.map(({ to, label, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
          onClick={() => haptic.selection()}
        >
          <span className={styles.iconWrap}>
            <Icon size={22} strokeWidth={2.2} />
            {badge > 0 && (
              <span className={styles.badge}>{badge > 99 ? '99+' : badge}</span>
            )}
          </span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
