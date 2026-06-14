import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

// ==========================================================================
// PageHeader — sticky top bar. Optional back button and trailing action slot.
// ==========================================================================

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  action?: ReactNode;
}

export function PageHeader({ title, showBack = false, action }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {showBack && (
          <button className={styles.backButton} onClick={() => navigate(-1)} aria-label="Go back">
            <ChevronLeft size={22} />
          </button>
        )}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </header>
  );
}
