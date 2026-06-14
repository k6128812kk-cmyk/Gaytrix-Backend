import { useEffect, useRef, useState } from 'react';
import { Plus, ThumbsUp, Flag, X, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { mapService } from '@/api/services';
import type { MapLocation, LocationCategory } from '@/types';
import styles from './MapPage.module.css';

const CATEGORY_LABELS: Record<LocationCategory, string> = {
  social_meetup: 'Social meetup',
  community_gathering: 'Community gathering',
  cafe: 'Café',
  bar: 'Bar',
  event_venue: 'Event venue',
  outdoor_spot: 'Outdoor spot',
  cruising_area: 'Cruising area',
  other: 'Other',
};

const CATEGORY_COLORS: Record<LocationCategory, string> = {
  social_meetup: '#ff6e7f',
  community_gathering: '#5ee6d0',
  cafe: '#ffc857',
  bar: '#c084fc',
  event_venue: '#4fb8ff',
  outdoor_spot: '#5ee6a8',
  cruising_area: '#ff9f43',
  other: '#a8a3bd',
};

export function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [selected, setSelected] = useState<MapLocation | null>(null);
  const [activeCategory, setActiveCategory] = useState<LocationCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Load Leaflet and init map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const initMap = () => {
      const L = (window as any).L;
      if (!L || leafletMap.current) return;

      const map = L.map(mapRef.current, { zoomControl: true }).setView([41.05, 29.0], 13);
      leafletMap.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      map.locate({ setView: true, maxZoom: 15 });
      map.on('locationfound', (e: any) => {
        L.circleMarker(e.latlng, {
          radius: 10,
          fillColor: '#4fb8ff',
          color: '#fff',
          weight: 2,
          fillOpacity: 0.9,
        }).addTo(map).bindPopup('You are here');
      });

      setMapReady(true);
    };

    if ((window as any).L) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // Load locations
  useEffect(() => {
    mapService.getLocations().then((data) => {
      setLocations(data);
      setLoading(false);
    });
  }, []);

  // Add markers
  useEffect(() => {
    const L = (window as any).L;
    const map = leafletMap.current;
    if (!L || !map || !mapReady) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const filtered = activeCategory === 'all'
      ? locations
      : locations.filter((l) => l.category === activeCategory);

    filtered.forEach((loc) => {
      const color = CATEGORY_COLORS[loc.category] ?? '#a8a3bd';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([loc.lat, loc.lng], { icon })
        .addTo(map)
        .on('click', () => setSelected(loc));
      markersRef.current.push(marker);
    });
  }, [locations, activeCategory, mapReady]);

  async function handleUpvote(loc: MapLocation) {
    const { upvotes } = await mapService.upvote(loc.id);
    setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, upvotes } : l)));
    setSelected((s) => (s ? { ...s, upvotes } : s));
  }

  async function handleReport(loc: MapLocation) {
    await mapService.report(loc.id, 'inappropriate');
    setSelected(null);
  }

  function handleLocationAdded(newLoc: MapLocation) {
    setLocations((prev) => [...prev, newLoc]);
    setShowAddSheet(false);
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Map" showBack />

      <div className={styles.categoryBar}>
        <Chip selected={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>All</Chip>
        {(Object.keys(CATEGORY_LABELS) as LocationCategory[]).map((cat) => (
          <Chip key={cat} selected={activeCategory === cat} onClick={() => setActiveCategory(cat)}>
            {CATEGORY_LABELS[cat]}
          </Chip>
        ))}
      </div>

      {/* Map container — position relative so our button stacks above Leaflet */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {loading && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            color: 'var(--color-text-faint)', zIndex: 500, pointerEvents: 'none',
          }}>
            Loading map...
          </div>
        )}

        {/* + button inside the relative container so it floats above Leaflet tiles */}
        <button
          className={styles.addButton}
          onClick={() => setShowAddSheet(true)}
          aria-label="Add location"
          style={{ position: 'absolute', zIndex: 1000 }}
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Pin detail sheet */}
      {selected && (
        <div className={styles.sheetOverlay} onClick={() => setSelected(null)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>
              <div>
                <span className={styles.sheetCategory} style={{ color: CATEGORY_COLORS[selected.category] ?? '#a8a3bd' }}>
                  {CATEGORY_LABELS[selected.category] ?? selected.category}
                </span>
                <h3 className={styles.sheetTitle}>{selected.name}</h3>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className={styles.closeButton}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.sheetDescription}>{selected.description}</p>
            <div className={styles.sheetActions}>
              <Button variant="secondary" onClick={() => handleUpvote(selected)}>
                <ThumbsUp size={16} /> {selected.upvotes}
              </Button>
              <Button variant="ghost" onClick={() => handleReport(selected)}>
                <Flag size={16} /> Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add location sheet */}
      {showAddSheet && (
        <div className={styles.sheetOverlay} onClick={() => setShowAddSheet(false)}>
          <AddLocationSheet
            onClose={() => setShowAddSheet(false)}
            onSubmit={handleLocationAdded}
            leafletMap={leafletMap.current}
          />
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// AddLocationSheet — pick location on map, choose category, submit to API.
// --------------------------------------------------------------------------
function AddLocationSheet({
  onClose,
  onSubmit,
  leafletMap,
}: {
  onClose: () => void;
  onSubmit: (loc: MapLocation) => void;
  leafletMap: any;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LocationCategory>('social_meetup');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use user's current GPS as default
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); },
      () => {}
    );
  }, []);

  // Map click to pick location
  useEffect(() => {
    if (!leafletMap || !pickingLocation) return;
    const handler = (e: any) => {
      setLat(e.latlng.lat);
      setLng(e.latlng.lng);
      setPickingLocation(false);
    };
    leafletMap.once('click', handler);
    return () => leafletMap.off('click', handler);
  }, [leafletMap, pickingLocation]);

  async function handleSubmit() {
    if (!name.trim() || !description.trim() || lat === null || lng === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const newLoc = await mapService.createLocation({
        name: name.trim(),
        description: description.trim(),
        category,
        lat,
        lng,
        createdBy: '',
      });
      onSubmit(newLoc);
    } catch {
      setError('Could not submit location. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
      <div className={styles.sheetHeader}>
        <h3 className={styles.sheetTitle}>Add a location</h3>
        <button onClick={onClose} aria-label="Close" className={styles.closeButton}><X size={18} /></button>
      </div>

      <div className={styles.formField}>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cihangir Café Corner" className={styles.formInput} />
      </div>

      <div className={styles.formField}>
        <label>Category</label>
        <div className={styles.chipWrap}>
          {(Object.keys(CATEGORY_LABELS) as LocationCategory[]).map((cat) => (
            <Chip key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
              {CATEGORY_LABELS[cat]}
            </Chip>
          ))}
        </div>
      </div>

      <div className={styles.formField}>
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What makes this spot worth knowing about?" rows={3} className={styles.formTextarea} />
      </div>

      <div className={styles.formField}>
        <label>Location</label>
        {lat !== null && lng !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flex: 1 }}>
              <MapPin size={13} style={{ verticalAlign: 'middle' }} /> {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
            <button
              onClick={() => setPickingLocation(true)}
              style={{ fontSize: 12, color: 'var(--color-accent)', background: 'none', padding: '4px 8px', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}
            >
              {pickingLocation ? 'Tap the map...' : 'Change'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPickingLocation(true)}
            style={{ fontSize: 13, color: 'var(--color-accent)', background: 'none', padding: '8px 0', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            {pickingLocation ? '📍 Tap anywhere on the map to set location...' : '📍 Tap to pick location on map'}
          </button>
        )}
      </div>

      {error && <p style={{ fontSize: 13, color: 'var(--color-danger, #e74c3c)', margin: 0 }}>{error}</p>}

      <p className={styles.formNote}>New locations are reviewed before appearing publicly.</p>

      <Button
        fullWidth
        disabled={!name.trim() || !description.trim() || lat === null || lng === null || submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Submitting...' : 'Submit for review'}
      </Button>
    </div>
  );
}
