import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { useSessionStore } from '@/context/sessionStore';
import type { DiscoveryFilters, RelationshipStatus, GenderIdentity, InterestedIn } from '@/types';
import styles from './Filters.module.css';

// Persist filters in sessionStorage so they survive navigation
function loadFilters(): DiscoveryFilters {
  try {
    const saved = sessionStorage.getItem('discoveryFilters');
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_FILTERS;
}

const RELATIONSHIP_OPTIONS: { value: RelationshipStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'in_relationship', label: 'In a relationship' },
  { value: 'married', label: 'Married' },
  { value: 'open_relationship', label: 'Open relationship' },
];

const GENDER_OPTIONS: { value: GenderIdentity; label: string }[] = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
];

const INTERESTED_IN_OPTIONS: { value: InterestedIn; label: string }[] = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'everyone', label: 'Everyone' },
];

const LANGUAGE_OPTIONS = ['English', 'Turkish', 'German', 'French', 'Spanish', 'Arabic'];
const INTEREST_OPTIONS = ['Music', 'Coffee', 'Hiking', 'Travel', 'Tech', 'Books', 'Nightlife', 'Food', 'Photography'];

const DEFAULT_FILTERS: DiscoveryFilters = {
  ageMin: 18,
  ageMax: 45,
  maxDistanceKm: 50,
  relationshipStatus: [],
  interests: [],
  languages: [],
  verifiedOnly: false,
  onlineOnly: false,
  genderIdentity: '',
  interestedIn: 'everyone',
};

export function FiltersPage() {
  const navigate = useNavigate();
  const { profile } = useSessionStore();
  const [filters, setFilters] = useState<DiscoveryFilters>(() => {
    const f = loadFilters();
    // Pre-fill interestedIn from profile if not already set
    if (!f.interestedIn && profile?.interestedIn) {
      f.interestedIn = profile.interestedIn;
    }
    return f;
  });

  function toggleArrayValue<T>(key: keyof DiscoveryFilters, value: T) {
    setFilters(prev => {
      const arr = (prev[key] as T[]) ?? [];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  }

  function applyFilters() {
    sessionStorage.setItem('discoveryFilters', JSON.stringify(filters));
    navigate(-1);
  }

  function resetFilters() {
    sessionStorage.removeItem('discoveryFilters');
    setFilters(DEFAULT_FILTERS);
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Filters" showBack />

      <div className={styles.content}>
        {/* Discovery preferences */}
        <section className={styles.section}>
          <label className={styles.label}>Show me</label>
          <div className={styles.chipWrap}>
            {INTERESTED_IN_OPTIONS.map(opt => (
              <Chip key={opt.value} selected={filters.interestedIn === opt.value}
                onClick={() => setFilters(f => ({ ...f, interestedIn: opt.value }))}>
                {opt.label}
              </Chip>
            ))}
          </div>
          <p className={styles.hint}>Filters by what people identify as</p>
        </section>

        <section className={styles.section}>
          <label className={styles.label}>Gender identity</label>
          <div className={styles.chipWrap}>
            {GENDER_OPTIONS.map(opt => (
              <Chip key={opt.value}
                selected={filters.genderIdentity === opt.value}
                onClick={() => setFilters(f => ({
                  ...f, genderIdentity: f.genderIdentity === opt.value ? '' : opt.value,
                }))}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>

        {/* Age range */}
        <section className={styles.section}>
          <label className={styles.label}>Age range</label>
          <div className={styles.rangeRow}>
            <input type="number" min={18} max={99} value={filters.ageMin}
              onChange={e => setFilters(f => ({ ...f, ageMin: Number(e.target.value) }))}
              className={styles.rangeInput} />
            <span className={styles.rangeDash}>to</span>
            <input type="number" min={18} max={99} value={filters.ageMax}
              onChange={e => setFilters(f => ({ ...f, ageMax: Number(e.target.value) }))}
              className={styles.rangeInput} />
          </div>
        </section>

        {/* Distance */}
        <section className={styles.section}>
          <label className={styles.label}>Maximum distance</label>
          <input type="range" min={1} max={500} value={filters.maxDistanceKm}
            onChange={e => setFilters(f => ({ ...f, maxDistanceKm: Number(e.target.value) }))}
            className={styles.slider} />
          <div className={styles.sliderValue}>{filters.maxDistanceKm} km</div>
        </section>

        {/* Relationship status */}
        <section className={styles.section}>
          <label className={styles.label}>Relationship status</label>
          <div className={styles.chipWrap}>
            {RELATIONSHIP_OPTIONS.map(opt => (
              <Chip key={opt.value} selected={filters.relationshipStatus?.includes(opt.value)}
                onClick={() => toggleArrayValue('relationshipStatus', opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>

        {/* Interests */}
        <section className={styles.section}>
          <label className={styles.label}>Interests</label>
          <div className={styles.chipWrap}>
            {INTEREST_OPTIONS.map(opt => (
              <Chip key={opt} selected={filters.interests?.includes(opt)}
                onClick={() => toggleArrayValue('interests', opt)}>
                {opt}
              </Chip>
            ))}
          </div>
        </section>

        {/* Languages */}
        <section className={styles.section}>
          <label className={styles.label}>Languages</label>
          <div className={styles.chipWrap}>
            {LANGUAGE_OPTIONS.map(opt => (
              <Chip key={opt} selected={filters.languages?.includes(opt)}
                onClick={() => toggleArrayValue('languages', opt)}>
                {opt}
              </Chip>
            ))}
          </div>
        </section>

        {/* Toggles */}
        <section className={styles.section}>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleLabel}>Verified only</p>
              <p className={styles.toggleHint}>Show only verified profiles</p>
            </div>
            <button className={`${styles.toggle} ${filters.verifiedOnly ? styles.toggleOn : ''}`}
              onClick={() => setFilters(f => ({ ...f, verifiedOnly: !f.verifiedOnly }))}
              aria-pressed={filters.verifiedOnly}>
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleLabel}>Online now</p>
              <p className={styles.toggleHint}>Show only people currently online</p>
            </div>
            <button className={`${styles.toggle} ${filters.onlineOnly ? styles.toggleOn : ''}`}
              onClick={() => setFilters(f => ({ ...f, onlineOnly: !f.onlineOnly }))}
              aria-pressed={filters.onlineOnly}>
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <Button variant="secondary" onClick={resetFilters}>Reset</Button>
        <Button fullWidth onClick={applyFilters}>Apply filters</Button>
      </div>
    </div>
  );
}
