import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SlidersHorizontal, Sparkles, Clock, ShieldCheck, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ProfileCard } from '@/components/ProfileCard';
import { discoveryService } from '@/api/services';
import type { UserProfile, DiscoveryFilters } from '@/types';
import styles from './Discover.module.css';

// ==========================================================================
// Discover — primary landing page. Loads real users, respects saved filters.
// ==========================================================================

type ExploreSection = 'trending' | 'new' | 'verified' | 'recent';

const SECTIONS: { key: ExploreSection; label: string; icon: typeof Sparkles }[] = [
  { key: 'trending', label: 'Trending', icon: TrendingUp },
  { key: 'new', label: 'New members', icon: Sparkles },
  { key: 'verified', label: 'Verified', icon: ShieldCheck },
  { key: 'recent', label: 'Recently active', icon: Clock },
];

function loadFilters(): Partial<DiscoveryFilters> {
  try {
    const saved = sessionStorage.getItem('discoveryFilters');
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

export function DiscoverPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [nearby, setNearby] = useState<UserProfile[]>([]);
  const [explore, setExplore] = useState<Record<ExploreSection, UserProfile[]>>({
    trending: [], new: [], verified: [], recent: [],
  });
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState(false);

  // Reload when returning from filters page
  useEffect(() => {
    const filters = loadFilters();
    const hasFilters = Object.values(filters).some(v =>
      Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '' && v !== false
    );
    setActiveFilters(hasFilters);
    setLoading(true);

    (async () => {
      try {
        const [nearbyData, ...exploreData] = await Promise.all([
          discoveryService.getNearby(filters),
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
      } finally {
        setLoading(false);
      }
    })();
  }, [location.key]); // re-run when navigating back from filters

  return (
    <div className={styles.page}>
      <PageHeader
        title="Discover"
        action={
          <button
            className={`${styles.filterButton} ${activeFilters ? styles.filterButtonActive : ''}`}
            onClick={() => navigate('/discover/filters')}
            aria-label="Filters"
          >
            <SlidersHorizontal size={18} />
            {activeFilters && <span className={styles.filterDot} />}
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
