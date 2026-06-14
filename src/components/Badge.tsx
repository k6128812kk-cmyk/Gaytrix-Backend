import type { ReactNode } from 'react';
import styles from './Badge.module.css';

// ==========================================================================
// Badge — small status pill. Variants map to brand-meaningful colors:
// gold = verification, coral = premium, cyan = online/active, neutral = default.
// ==========================================================================

type BadgeVariant = 'gold' | 'premium' | 'online' | 'neutral' | 'danger';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>;
}
