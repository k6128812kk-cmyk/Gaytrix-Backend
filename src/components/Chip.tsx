import type { ReactNode } from 'react';
import styles from './Chip.module.css';

// ==========================================================================
// Chip — tag/interest pill, optionally selectable for filter UIs.
// ==========================================================================

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}

export function Chip({ children, selected = false, onClick }: ChipProps) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      className={`${styles.chip} ${selected ? styles.selected : ''}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Tag>
  );
}
