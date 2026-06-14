import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

// ==========================================================================
// Button — primary (coral, filled), secondary (outline), ghost (text-only).
// ==========================================================================

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', fullWidth = false, className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${fullWidth ? styles.fullWidth : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
