import { ExternalLink, MessageSquare, FileText, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import styles from './Help.module.css';

// ==========================================================================
// Help — support links and quick access to safety reporting.
// ==========================================================================

const LINKS = [
  { icon: MessageSquare, label: 'Contact support', sublabel: 'Chat with the GayTrix support bot' },
  { icon: FileText, label: 'Community guidelines', sublabel: 'Rules for a safe and respectful community' },
  { icon: ShieldAlert, label: 'Safety center', sublabel: 'Tips for staying safe while meeting people' },
  { icon: FileText, label: 'Terms & Privacy Policy', sublabel: 'How your data is handled' },
];

export function HelpPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Help & support" showBack />
      <div className={styles.content}>
        <nav className={styles.menu}>
          {LINKS.map((link) => (
            <button key={link.label} className={styles.menuItem}>
              <span className={styles.icon}>
                <link.icon size={18} />
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{link.label}</span>
                <span className={styles.sublabel}>{link.sublabel}</span>
              </span>
              <ExternalLink size={14} className={styles.external} />
            </button>
          ))}
        </nav>
        <p className={styles.version}>GayTrix v1.0.0</p>
      </div>
    </div>
  );
}
