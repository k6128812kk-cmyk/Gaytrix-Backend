import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, MessageCircle, Flag, Ban, Globe2, Briefcase, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { discoveryService, profileService, chatService } from '@/api/services';
import type { UserProfile } from '@/types';
import styles from './ProfileDetail.module.css';

// ==========================================================================
// ProfileDetail — view another user's profile.
// Report and block actions are surfaced clearly.
// Suspended/banned profiles show a placeholder instead of profile data.
// ==========================================================================

const RELATIONSHIP_LABELS: Record<string, string> = {
  single: 'Single', in_relationship: 'In a relationship', married: 'Married',
  open_relationship: 'Open relationship', complicated: "It's complicated",
  prefer_not_to_say: 'Prefer not to say',
};

const LOOKING_FOR_LABELS: Record<string, string> = {
  friends: 'Friends', dating: 'Dating', relationship: 'Relationship',
  networking: 'Networking', community: 'Community', chat: 'Chat',
};

type ReportReason = 'Spam / fake profile' | 'Inappropriate content' | 'Harassment' | 'Underage' | 'Other';

const REPORT_REASONS: ReportReason[] = [
  'Spam / fake profile', 'Inappropriate content', 'Harassment', 'Underage', 'Other',
];

export function ProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    if (!id) return;
    discoveryService.getProfile(id).then(p => {
      if (!p) setNotFound(true);
      else setProfile(p);
    });
  }, [id]);

  async function handleSendMessage() {
    if (!profile) return;
    setStartingChat(true);
    try {
      // Create or open existing conversation WITHOUT sending any automatic message
      const { conversationId } = await chatService.startConversation(profile.id);
      navigate(`/chat/${conversationId}`);
    } catch {
      // Fallback: find existing conversation by participant
      try {
        const convos = await chatService.getConversations();
        const existing = convos.find(c => c.participant.id === profile.id);
        if (existing) {
          navigate(`/chat/${existing.id}`);
        } else {
          setStartingChat(false);
        }
      } catch {
        setStartingChat(false);
      }
    }
  }

  async function submitReport() {
    if (!profile || !reportReason) return;
    setReporting(true);
    await profileService.reportUser(profile.id, reportReason, reportDetails || undefined);
    setReporting(false);
    setReported(true);
    setShowReport(false);
  }

  async function handleBlock() {
    if (!profile) return;
    await profileService.blockUser(profile.id);
    setBlocked(true);
    setTimeout(() => navigate(-1), 1500);
  }

  if (notFound || blocked) {
    return (
      <div className={styles.page}>
        <PageHeader title="Profile" showBack />
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-faint)' }}>
          {blocked ? 'User blocked. Taking you back...' : 'Profile not available.'}
        </div>
      </div>
    );
  }

  if (!profile) {
    return <div className={styles.page}><PageHeader title="Profile" showBack /></div>;
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={profile.displayName}
        showBack
        action={
          <button
            className={styles.moreButton}
            onClick={() => setShowReport(s => !s)}
            aria-label="Report or block"
          >
            <Flag size={18} />
          </button>
        }
      />

      {showReport && !reported && (
        <div className={styles.actionsMenu}>
          <button className={styles.actionsMenuItem} onClick={() => { setShowReport(false); setTimeout(() => setShowReport(true), 50); }}>
            <Flag size={16} /> Report {profile.displayName}
          </button>
          <button className={`${styles.actionsMenuItem} ${styles.danger}`} onClick={handleBlock}>
            <Ban size={16} /> Block {profile.displayName}
          </button>
        </div>
      )}

      {reported && (
        <div style={{ padding: '8px 16px', background: 'var(--color-secondary-soft)', fontSize: 13, color: 'var(--color-secondary)' }}>
          ✓ Report submitted. Thank you for keeping GayTrix safe.
        </div>
      )}

      <div className={styles.gallery}>
        <img src={profile.photos[activePhoto] ?? 'https://i.pravatar.cc/600'} alt={profile.displayName} className={styles.photo} />
        {profile.photos.length > 1 && (
          <div className={styles.photoDots}>
            {profile.photos.map((_, i) => (
              <button key={i} className={`${styles.dot} ${i === activePhoto ? styles.dotActive : ''}`}
                onClick={() => setActivePhoto(i)} />
            ))}
          </div>
        )}
        <div className={styles.galleryGradient} />
      </div>

      <div className={styles.content}>
        <div className={styles.headerRow}>
          <Avatar src={profile.photos[0] ?? 'https://i.pravatar.cc/100'} alt=""
            size={48} isOnline={profile.isOnline} verification={profile.verification} membership={profile.membership} />
          <div className={styles.headerText}>
            <h2 className={styles.name}>{profile.displayName}, {profile.age}</h2>
            <div className={styles.metaRow}>
              <MapPin size={13} />
              <span>{profile.city}, {profile.country}
                {profile.distanceKm !== undefined ? ` · ${profile.distanceKm.toFixed(1)} km away` : ''}</span>
            </div>
          </div>
        </div>

        <div className={styles.badgeRow}>
          {profile.adminRole === 'super_admin' && <Badge variant="gold">👑 Super Admin</Badge>}
          {profile.adminRole === 'admin' && <Badge variant="gold">⭐ Moderator</Badge>}
          {profile.verification === 'verified' && profile.adminRole === 'none' && <Badge variant="neutral">✓ Verified</Badge>}
          {profile.membership === 'premium' && <Badge variant="premium">Premium</Badge>}
          {profile.isOnline && <Badge variant="online">Online now</Badge>}
        </div>

        {profile.bio && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>About</h3>
            <p className={styles.bio}>{profile.bio}</p>
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Looking for</h3>
          <div className={styles.chipWrap}>
            {profile.lookingFor.map(lf => <Chip key={lf}>{LOOKING_FOR_LABELS[lf]}</Chip>)}
          </div>
        </section>

        {profile.interests.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Interests</h3>
            <div className={styles.chipWrap}>
              {profile.interests.map(i => <Chip key={i}>{i}</Chip>)}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Details</h3>
          <div className={styles.detailsList}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Status</span>
              <span className={styles.detailValue}>{RELATIONSHIP_LABELS[profile.relationshipStatus]}</span>
            </div>
            {profile.heightCm && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Height</span>
                <span className={styles.detailValue}>{profile.heightCm} cm</span>
              </div>
            )}
            {profile.occupation && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}><Briefcase size={13} /> Occupation</span>
                <span className={styles.detailValue}>{profile.occupation}</span>
              </div>
            )}
            {profile.languages.length > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}><Globe2 size={13} /> Languages</span>
                <span className={styles.detailValue}>{profile.languages.join(', ')}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <Button fullWidth onClick={handleSendMessage} disabled={startingChat}>
          <MessageCircle size={18} /> {startingChat ? 'Opening chat...' : 'Send message'}
        </Button>
      </div>

      {/* Report sheet */}
      {showReport && !reported && (
        <div className={styles.reportOverlay} onClick={() => setShowReport(false)}>
          <div className={styles.reportSheet} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>Report {profile.displayName}</h3>
              <button onClick={() => setShowReport(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Select the reason that best describes the issue. Reports are reviewed by our moderation team.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {REPORT_REASONS.map(r => (
                <button
                  key={r}
                  onClick={() => setReportReason(r)}
                  style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-md)', textAlign: 'left',
                    fontSize: 14, fontWeight: reportReason === r ? 700 : 400,
                    background: reportReason === r ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                    color: reportReason === r ? 'var(--color-accent)' : 'var(--color-text)',
                    border: `1px solid ${reportReason === r ? 'var(--color-accent)' : 'transparent'}`,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            {reportReason && (
              <textarea
                value={reportDetails}
                onChange={e => setReportDetails(e.target.value)}
                placeholder="Additional details (optional)..."
                rows={3}
                style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: 13,
                  color: 'var(--color-text)', resize: 'none', width: '100%',
                }}
              />
            )}
            <Button fullWidth onClick={submitReport} disabled={!reportReason || reporting}>
              {reporting ? 'Submitting...' : 'Submit report'}
            </Button>
            <button
              style={{ color: 'var(--color-danger)', fontWeight: 600, fontSize: 14, textAlign: 'center', width: '100%', padding: 8 }}
              onClick={handleBlock}
            >
              Block this user
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
