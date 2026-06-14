import { NavLink } from 'react-router-dom';
import { Compass, Map, MessageCircle, User } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import styles from './TabBar.module.css';

// ==========================================================================
// TabBar — primary navigation, fixed to viewport bottom.
// Respects safe-area-inset-bottom for devices with home indicators.
// ==========================================================================

const TABS = [
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: User },
];

export function TabBar() {
  const { haptic } = useTelegram();

  return (
    <nav className={styles.tabbar} aria-label="Primary">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
          onClick={() => haptic.selection()}
        >
          <Icon size={22} strokeWidth={2.2} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
