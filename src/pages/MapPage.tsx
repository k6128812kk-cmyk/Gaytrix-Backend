import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ThumbsUp, Flag, X, MapPin, Calendar, Users, MessageSquare, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { mapService, eventService } from '@/api/services';
import { useSessionStore } from '@/context/sessionStore';
import type { MapLocation, MapEvent, LocationCategory } from '@/types';
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

type ViewMode = 'locations' | 'events';

export function MapPage() {
  const navigate = useNavigate();
  const { profile, isModerator } = useSessionStore();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MapEvent | null>(null);
  const [activeCategory, setActiveCategory] = useState<LocationCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('events');
  const [loading, setLoading] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [addMode, setAddMode] = useState<'location' | 'event'>('event');
  const [mapReady, setMapReady] = useState(false);

  // Init Leaflet map
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
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(map);
      map.locate({ setView: true, maxZoom: 15 });
      map.on('locationfound', (e: any) => {
        L.circleMarker(e.latlng, {
          radius: 10, fillColor: '#4fb8ff', color: '#fff', weight: 2, fillOpacity: 0.9,
        }).addTo(map).bindPopup('You are here');
      });
      setMapReady(true);
    };

    if ((window as any).L) { initMap(); }
    else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; } };
  }, []);

  // Load data
  useEffect(() => {
    Promise.all([
      mapService.getLocations(),
      eventService.getEvents(),
    ]).then(([locs, evs]) => {
      setLocations(locs);
      setEvents(evs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Update map markers when data or view mode changes
  useEffect(() => {
    if (!mapReady || !leafletMap.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (viewMode === 'locations') {
      const filtered = activeCategory === 'all'
        ? locations
        : locations.filter(l => l.category === activeCategory);

      filtered.forEach(loc => {
        const color = CATEGORY_COLORS[loc.category] ?? '#a8a3bd';
        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius: 10, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.85,
        }).addTo(leafletMap.current);
        marker.on('click', () => setSelectedLocation(loc));
        markersRef.current.push(marker);
      });
    } else {
      events.forEach(ev => {
        const isActive = new Date(ev.startsAt) > new Date(Date.now() - 24 * 3600 * 1000);
        const color = ev.isAttending ? '#5ee6d0' : '#ff6e7f';
        const marker = L.marker([ev.lat, ev.lng], {
          icon: L.divIcon({
            html: `<div style="
              background:${color};color:#fff;border-radius:20px;padding:4px 8px;
              font-size:11px;font-weight:700;white-space:nowrap;
              box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff;
              opacity:${isActive ? 1 : 0.6};
            ">${ev.title.slice(0, 18)}${ev.title.length > 18 ? '…' : ''}</div>`,
            iconAnchor: [0, 0], className: '',
          }),
        }).addTo(leafletMap.current);
        marker.on('click', () => setSelectedEvent(ev));
        markersRef.current.push(marker);
      });
    }
  }, [mapReady, locations, events, activeCategory, viewMode]);

  async function handleUpvote(loc: MapLocation) {
    const { upvotes } = await mapService.upvote(loc.id);
    setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, upvotes } : l));
  }

  async function handleJoinEvent(ev: MapEvent) {
    const result = await eventService.joinEvent(ev.id);
    setEvents(prev => prev.map(e => e.id === ev.id
      ? { ...e, isAttending: true, attendeeCount: result.attendeeCount } : e));
    setSelectedEvent(prev => prev?.id === ev.id
      ? { ...prev, isAttending: true, attendeeCount: result.attendeeCount } : prev);
    if (result.groupConversationId) {
      navigate(`/event-chat/${result.groupConversationId}`);
    }
  }

  async function handleLeaveEvent(ev: MapEvent) {
    const result = await eventService.leaveEvent(ev.id);
    setEvents(prev => prev.map(e => e.id === ev.id
      ? { ...e, isAttending: false, attendeeCount: result.attendeeCount } : e));
    setSelectedEvent(prev => prev?.id === ev.id
      ? { ...prev, isAttending: false, attendeeCount: result.attendeeCount } : prev);
  }

  async function handleDeleteEvent(ev: MapEvent) {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    await eventService.deleteEvent(ev.id);
    setEvents(prev => prev.filter(e => e.id !== ev.id));
    setSelectedEvent(null);
  }

  function handleEventAdded(ev: MapEvent) {
    setEvents(prev => [...prev, ev]);
    setShowAddSheet(false);
    setSelectedEvent(ev);
  }

  function handleLocationAdded(loc: MapLocation) {
    setLocations(prev => [...prev, loc]);
    setShowAddSheet(false);
  }

  const canDeleteEvent = (ev: MapEvent) =>
    ev.createdBy === profile?.id || isModerator();

  return (
    <div className={styles.page}>
      <PageHeader title="Map" />

      {/* View mode toggle */}
      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeBtn} ${viewMode === 'events' ? styles.modeBtnActive : ''}`}
          onClick={() => setViewMode('events')}
        >
          <Calendar size={14} /> Events
        </button>
        <button
          className={`${styles.modeBtn} ${viewMode === 'locations' ? styles.modeBtnActive : ''}`}
          onClick={() => setViewMode('locations')}
        >
          <MapPin size={14} /> Locations
        </button>
      </div>

      {/* Category filter (locations mode only) */}
      {viewMode === 'locations' && (
        <div className={styles.chips}>
          <Chip selected={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>All</Chip>
          {(Object.keys(CATEGORY_LABELS) as LocationCategory[]).map(cat => (
            <Chip key={cat} selected={activeCategory === cat} onClick={() => setActiveCategory(cat)}>
              {CATEGORY_LABELS[cat]}
            </Chip>
          ))}
        </div>
      )}

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {loading && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            color: 'var(--color-text-faint)', zIndex: 500, pointerEvents: 'none',
          }}>Loading map...</div>
        )}

        <button
          className={styles.addButton}
          onClick={() => { setAddMode(viewMode === 'events' ? 'event' : 'location'); setShowAddSheet(true); }}
          aria-label={viewMode === 'events' ? 'Create event' : 'Add location'}
          style={{ position: 'absolute', zIndex: 1000 }}
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Location detail sheet */}
      {selectedLocation && (
        <div className={styles.sheetOverlay} onClick={() => setSelectedLocation(null)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetHeader}>
              <div>
                <span className={styles.sheetCategory} style={{ color: CATEGORY_COLORS[selectedLocation.category] ?? '#a8a3bd' }}>
                  {CATEGORY_LABELS[selectedLocation.category] ?? selectedLocation.category}
                </span>
                <h3 className={styles.sheetTitle}>{selectedLocation.name}</h3>
              </div>
              <button onClick={() => setSelectedLocation(null)} className={styles.closeButton}><X size={18} /></button>
            </div>
            <p className={styles.sheetDescription}>{selectedLocation.description}</p>
            <div className={styles.sheetActions}>
              <Button variant="secondary" onClick={() => handleUpvote(selectedLocation)}>
                <ThumbsUp size={16} /> {selectedLocation.upvotes}
              </Button>
              <Button variant="ghost" onClick={async () => { await mapService.report(selectedLocation.id, 'inappropriate'); setSelectedLocation(null); }}>
                <Flag size={16} /> Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Event detail sheet */}
      {selectedEvent && (
        <div className={styles.sheetOverlay} onClick={() => setSelectedEvent(null)}>
          <EventDetailSheet
            event={selectedEvent}
            canDelete={canDeleteEvent(selectedEvent)}
            onClose={() => setSelectedEvent(null)}
            onJoin={() => handleJoinEvent(selectedEvent)}
            onLeave={() => handleLeaveEvent(selectedEvent)}
            onDelete={() => handleDeleteEvent(selectedEvent)}
            onOpenChat={() => {
              if (selectedEvent.groupConversationId) {
                navigate(`/event-chat/${selectedEvent.groupConversationId}`);
              }
            }}
          />
        </div>
      )}

      {/* Add sheet */}
      {showAddSheet && (
        <div className={styles.sheetOverlay} onClick={() => setShowAddSheet(false)}>
          {addMode === 'event' ? (
            <AddEventSheet
              onClose={() => setShowAddSheet(false)}
              onSubmit={handleEventAdded}
              leafletMap={leafletMap.current}
            />
          ) : (
            <AddLocationSheet
              onClose={() => setShowAddSheet(false)}
              onSubmit={handleLocationAdded}
              leafletMap={leafletMap.current}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Event detail sheet
// --------------------------------------------------------------------------
function EventDetailSheet({
  event, canDelete, onClose, onJoin, onLeave, onDelete, onOpenChat,
}: {
  event: MapEvent; canDelete: boolean;
  onClose: () => void; onJoin: () => void; onLeave: () => void;
  onDelete: () => void; onOpenChat: () => void;
}) {
  const isPast = event.endsAt ? new Date(event.endsAt) < new Date() : false;

  return (
    <div className={styles.sheet} onClick={e => e.stopPropagation()}>
      <div className={styles.sheetHeader}>
        <div>
          <span className={styles.sheetCategory} style={{ color: CATEGORY_COLORS[event.category as LocationCategory] ?? '#a8a3bd' }}>
            {CATEGORY_LABELS[event.category as LocationCategory] ?? event.category}
          </span>
          <h3 className={styles.sheetTitle}>{event.title}</h3>
        </div>
        <button onClick={onClose} className={styles.closeButton}><X size={18} /></button>
      </div>

      <p className={styles.sheetDescription}>{event.description}</p>

      <div className={styles.eventMeta}>
        <span className={styles.eventMetaItem}>
          <Calendar size={13} />
          {format(new Date(event.startsAt), 'MMM d, HH:mm')}
          {event.endsAt && ` – ${format(new Date(event.endsAt), 'HH:mm')}`}
        </span>
        <span className={styles.eventMetaItem}>
          <Users size={13} />
          {event.attendeeCount} going
          {event.maxAttendees && ` / ${event.maxAttendees} max`}
        </span>
        {event.creatorName && (
          <span className={styles.eventMetaItem}>
            Host: {event.creatorName}
          </span>
        )}
      </div>

      {isPast && <p className={styles.pastLabel}>This event has ended</p>}

      <div className={styles.sheetActions}>
        {!isPast && (
          event.isAttending ? (
            <Button variant="secondary" onClick={onLeave}>Leave event</Button>
          ) : (
            <Button onClick={onJoin}>
              {event.maxAttendees && event.attendeeCount >= event.maxAttendees ? 'Event full' : 'Join event'}
            </Button>
          )
        )}
        {event.isAttending && event.groupConversationId && (
          <Button variant="secondary" onClick={onOpenChat}>
            <MessageSquare size={16} /> Event chat
          </Button>
        )}
        {canDelete && (
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={16} /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Add event sheet
// --------------------------------------------------------------------------
function AddEventSheet({
  onClose, onSubmit, leafletMap,
}: { onClose: () => void; onSubmit: (ev: MapEvent) => void; leafletMap: any }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<LocationCategory>('social_meetup');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); },
      () => {}
    );
  }, []);

  useEffect(() => {
    if (!leafletMap || !pickingLocation) return;
    const handler = (e: any) => { setLat(e.latlng.lat); setLng(e.latlng.lng); setPickingLocation(false); };
    leafletMap.once('click', handler);
    return () => leafletMap.off('click', handler);
  }, [leafletMap, pickingLocation]);

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !startsAt || lat === null || lng === null) return;
    setSubmitting(true); setError(null);
    try {
      const ev = await eventService.createEvent({
        title: title.trim(), description: description.trim(), category,
        lat, lng, startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : undefined,
      });
      onSubmit(ev);
    } catch (e: any) {
      setError('Could not create event. Please try again.');
      setSubmitting(false);
    }
  }

  const canSubmit = title.trim() && description.trim() && startsAt && lat !== null && lng !== null;

  return (
    <div className={styles.sheet} onClick={e => e.stopPropagation()}>
      <div className={styles.sheetHeader}>
        <h3 className={styles.sheetTitle}>Create event</h3>
        <button onClick={onClose} className={styles.closeButton}><X size={18} /></button>
      </div>

      <div className={styles.formField}>
        <label>Event title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Coffee meetup at Cihangir" className={styles.formInput} />
      </div>

      <div className={styles.formField}>
        <label>Category</label>
        <div className={styles.chipWrap}>
          {(Object.keys(CATEGORY_LABELS) as LocationCategory[]).map(cat => (
            <Chip key={cat} selected={category === cat} onClick={() => setCategory(cat)}>
              {CATEGORY_LABELS[cat]}
            </Chip>
          ))}
        </div>
      </div>

      <div className={styles.formField}>
        <label>Description *</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="What's this event about?" rows={3} className={styles.formTextarea} />
      </div>

      <div className={styles.formRow}>
        <div className={styles.formField} style={{ flex: 1 }}>
          <label>Starts at *</label>
          <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)}
            className={styles.formInput} min={new Date().toISOString().slice(0, 16)} />
        </div>
        <div className={styles.formField} style={{ flex: 1 }}>
          <label>Ends at</label>
          <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
            className={styles.formInput} min={startsAt || new Date().toISOString().slice(0, 16)} />
        </div>
      </div>

      <div className={styles.formField}>
        <label>Max attendees (optional)</label>
        <input type="number" value={maxAttendees} onChange={e => setMaxAttendees(e.target.value)}
          placeholder="Leave empty for unlimited" className={styles.formInput} min="2" />
      </div>

      <div className={styles.formField}>
        <label>Location *</label>
        {lat !== null && lng !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flex: 1 }}>
              <MapPin size={13} style={{ verticalAlign: 'middle' }} /> {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
            <button onClick={() => setPickingLocation(true)}
              style={{ fontSize: 12, color: 'var(--color-accent)', background: 'none', padding: '4px 8px',
                border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}>
              {pickingLocation ? 'Tap the map...' : 'Change'}
            </button>
          </div>
        ) : (
          <button onClick={() => setPickingLocation(true)}
            style={{ fontSize: 13, color: 'var(--color-accent)', background: 'none', padding: '8px 0',
              border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            {pickingLocation ? '📍 Tap anywhere on the map...' : '📍 Tap to pick location on map'}
          </button>
        )}
      </div>

      {error && <p style={{ fontSize: 13, color: '#e74c3c', margin: 0 }}>{error}</p>}

      <p className={styles.formNote}>
        An event group chat will be created automatically. You'll be added as the host.
      </p>

      <Button fullWidth disabled={!canSubmit || submitting} onClick={handleSubmit}>
        {submitting ? 'Creating...' : 'Create event'}
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Add location sheet (unchanged)
// --------------------------------------------------------------------------
function AddLocationSheet({
  onClose, onSubmit, leafletMap,
}: { onClose: () => void; onSubmit: (loc: MapLocation) => void; leafletMap: any }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LocationCategory>('social_meetup');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); }, () => {}
    );
  }, []);

  useEffect(() => {
    if (!leafletMap || !pickingLocation) return;
    const handler = (e: any) => { setLat(e.latlng.lat); setLng(e.latlng.lng); setPickingLocation(false); };
    leafletMap.once('click', handler);
    return () => leafletMap.off('click', handler);
  }, [leafletMap, pickingLocation]);

  async function handleSubmit() {
    if (!name.trim() || !description.trim() || lat === null || lng === null) return;
    setSubmitting(true); setError(null);
    try {
      const loc = await mapService.createLocation({ name: name.trim(), description: description.trim(), category, lat, lng, createdBy: '' });
      onSubmit(loc);
    } catch { setError('Could not submit. Please try again.'); setSubmitting(false); }
  }

  return (
    <div className={styles.sheet} onClick={e => e.stopPropagation()}>
      <div className={styles.sheetHeader}>
        <h3 className={styles.sheetTitle}>Add a location</h3>
        <button onClick={onClose} className={styles.closeButton}><X size={18} /></button>
      </div>
      <div className={styles.formField}>
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cihangir Café" className={styles.formInput} />
      </div>
      <div className={styles.formField}>
        <label>Category</label>
        <div className={styles.chipWrap}>
          {(Object.keys(CATEGORY_LABELS) as LocationCategory[]).map(cat => (
            <Chip key={cat} selected={category === cat} onClick={() => setCategory(cat)}>{CATEGORY_LABELS[cat]}</Chip>
          ))}
        </div>
      </div>
      <div className={styles.formField}>
        <label>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What makes this spot worth knowing?" rows={3} className={styles.formTextarea} />
      </div>
      <div className={styles.formField}>
        <label>Location</label>
        {lat !== null && lng !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flex: 1 }}>
              <MapPin size={13} style={{ verticalAlign: 'middle' }} /> {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
            <button onClick={() => setPickingLocation(true)}
              style={{ fontSize: 12, color: 'var(--color-accent)', background: 'none', padding: '4px 8px', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}>
              {pickingLocation ? 'Tap the map...' : 'Change'}
            </button>
          </div>
        ) : (
          <button onClick={() => setPickingLocation(true)}
            style={{ fontSize: 13, color: 'var(--color-accent)', background: 'none', padding: '8px 0', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            {pickingLocation ? '📍 Tap anywhere on the map...' : '📍 Tap to pick location on map'}
          </button>
        )}
      </div>
      {error && <p style={{ fontSize: 13, color: '#e74c3c', margin: 0 }}>{error}</p>}
      <p className={styles.formNote}>New locations are reviewed before appearing publicly.</p>
      <Button fullWidth disabled={!name.trim() || !description.trim() || lat === null || lng === null || submitting} onClick={handleSubmit}>
        {submitting ? 'Submitting...' : 'Submit for review'}
      </Button>
    </div>
  );
}
