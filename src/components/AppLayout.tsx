import { Outlet, useLocation } from 'react-router-dom';
import { TabBar } from './TabBar';
import styles from './AppLayout.module.css';

// ==========================================================================
// AppLayout — wraps routed pages. Hides the TabBar on detail/sub-pages
// (anything beyond the four top-level tab roots) for a focused view.
// ==========================================================================

const TAB_ROOTS = ['/discover', '/map', '/chat', '/profile'];

export function AppLayout() {
  const location = useLocation();
  const showTabBar = TAB_ROOTS.includes(location.pathname);

  return (
    <div className={styles.layout}>
      <Outlet />
      {showTabBar && <TabBar />}
    </div>
  );
}
