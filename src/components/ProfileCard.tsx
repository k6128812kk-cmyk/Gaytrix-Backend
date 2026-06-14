import { MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { UserProfile } from '@/types';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import styles from './ProfileCard.module.css';

// ==========================================================================
// ProfileCard — large photo card used in the Discover feed.
// Tapping navigates to the full profile view.
// ==========================================================================

interface ProfileCardProps {
  profile: UserProfile;
}

export function ProfileCard({ profile }: ProfileCardProps) {
  const navigate = useNavigate();
  const photoSrc = profile.photos[0] || `https://i.pravatar.cc/400?u=${profile.id}`;

  return (
    <article className={styles.card} onClick={() => navigate(`/u/${profile.id}`)}>
      <img src={photoSrc} alt={profile.displayName} className={styles.photo} />
      <div className={styles.gradient} />

      <div className={styles.topRow}>
        {(profile.adminRole === 'admin' || profile.adminRole === 'super_admin') && <Badge variant="gold">⭐ Staff</Badge>}
        {profile.verification === 'verified' && profile.adminRole === 'none' && <Badge variant="neutral">✓ Verified</Badge>}
        {profile.membership === 'premium' && <Badge variant="premium">Premium</Badge>}
      </div>

      <div className={styles.info}>
        <div className={styles.nameRow}>
          <Avatar
            src={photoSrc}
            alt=""
            size={36}
            isOnline={profile.isOnline}
            verification={profile.verification}
            membership={profile.membership}
            adminRole={profile.adminRole}
            showBadge={false}
          />
          <h3 className={styles.name}>
            {profile.displayName}, {profile.age}
          </h3>
        </div>
        <div className={styles.meta}>
          <MapPin size={13} />
          <span>
            {profile.city}
            {profile.distanceKm !== undefined ? ` · ${profile.distanceKm.toFixed(1)} km` : ''}
          </span>
        </div>
      </div>
    </article>
  );
}
