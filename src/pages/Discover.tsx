import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Sparkles, Clock, ShieldCheck, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ProfileCard } from '@/components/ProfileCard';
import { discoveryService } from '@/api/services';
import type { UserProfile } from '@/types';
import styles from './Discover.module.css';

// ==========================================================================
// Discover — primary landing page. Shows nearby people in a grid plus
// horizontally-scrollable "Explore" rails (Trending, New, Verified, Recent).
// ==========================================================================

type ExploreSection = 'trending' | 'new' | 'verified' | 'recent';

const SECTIONS: { key: ExploreSection; label: string; icon: typeof Sparkles }[] = [
  { key: 'trending', label: 'Trending', icon: TrendingUp },
  { key: 'new', label: 'New members', icon: Sparkles },
  { key: 'verified', label: 'Verified', icon: ShieldCheck },
  { key: 'recent', label: 'Recently active', icon: Clock },
];

export function DiscoverPage() {
  const navigate = useNavigate();
  const [nearby, setNearby] = useState<UserProfile[]>([]);
  const [explore, setExplore] = useState<Record<ExploreSection, UserProfile[]>>({
    trending: [],
    new: [],
    verified: [],
    recent: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [nearbyData, ...exploreData] = await Promise.all([
        discoveryService.getNearby(),
        discoveryService.getExplore('trending'),
        discoveryService.getExplore('new'),
        discoveryService.getExplore('verified'),
        discoveryService.getExplore('recent'),
      ]);
      setNearby(nearbyData);
      setExplore({
        trending: exploreData[0],
        new: exploreData[1],
        verified: exploreData[2],
        recent: exploreData[3],
      });
      setLoading(false);
    })();
  }, []);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Discover"
        action={
          <button className={styles.filterButton} onClick={() => navigate('/discover/filters')} aria-label="Filters">
            <SlidersHorizontal size={18} />
          </button>
        }
      />

      <div className={styles.content}>
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <section key={key} className={styles.section}>
            <div className={styles.sectionHeader}>
              <Icon size={16} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>{label}</h2>
            </div>
            <div className={styles.rail}>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.railSkeleton} />)
                : explore[key].map((profile) => (
                    <div key={profile.id} className={styles.railItem}>
                      <ProfileCard profile={profile} />
                    </div>
                  ))}
            </div>
          </section>
        ))}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Nearby</h2>
          </div>
          <div className={styles.grid}>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.gridSkeleton} />)
              : nearby.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
