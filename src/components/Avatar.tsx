import { CheckCircle2, ShieldCheck } from 'lucide-react';
import type { VerificationStatus, MembershipTier, AdminRole } from '@/types';
import styles from './Avatar.module.css';

interface AvatarProps {
  src: string;
  alt: string;
  size?: number;
  isOnline?: boolean;
  verification?: VerificationStatus;
  membership?: MembershipTier;
  adminRole?: AdminRole;
  showBadge?: boolean;
}

export function Avatar({
  src,
  alt,
  size = 56,
  isOnline = false,
  verification = 'none',
  membership = 'free',
  adminRole = 'none',
  showBadge = true,
}: AvatarProps) {
  let ringClass = styles.ringOffline;
  if (verification === 'verified') ringClass = styles.ringVerified;
  else if (membership === 'premium') ringClass = styles.ringPremium;
  else if (isOnline) ringClass = styles.ringOnline;

  const isStaff = adminRole === 'super_admin' || adminRole === 'admin';
  const badgeSize = Math.max(14, size * 0.26);

  return (
    <div className={styles.wrapper} style={{ width: size, height: size }}>
      <div className={`${styles.ring} ${ringClass}`}>
        <div className={styles.imageMask}>
          <img src={src} alt={alt} className={styles.image} />
        </div>
      </div>
      {isOnline && <span className={styles.onlineDot} aria-label="Online" />}
      {showBadge && verification === 'verified' && (
        <span
          className={styles.verifiedBadge}
          aria-label={isStaff ? 'Staff verified' : 'Verified profile'}
          style={{ color: isStaff ? 'var(--color-gold, #f5c518)' : 'var(--color-info, #4fb8ff)' }}
        >
          {isStaff
            ? <ShieldCheck size={badgeSize} strokeWidth={2.5} />
            : <CheckCircle2 size={badgeSize} strokeWidth={2.5} />
          }
        </span>
      )}
    </div>
  );
}
