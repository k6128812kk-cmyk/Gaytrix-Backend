import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ChevronRight } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { useSessionStore } from '@/context/sessionStore';
import { profileService } from '@/api/services';
import type { LookingFor, RelationshipStatus } from '@/types';
import styles from './Onboarding.module.css';

// ==========================================================================
// Onboarding — guided multi-step profile setup shown to first-time users.
// Steps: photo, basics, looking-for, bio. Each step validates before
// advancing. On completion, patches the profile and routes to Discover.
// ==========================================================================

const LOOKING_FOR_OPTIONS: { value: LookingFor; label: string }[] = [
  { value: 'friends', label: 'Friends' },
  { value: 'dating', label: 'Dating' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'networking', label: 'Networking' },
  { value: 'community', label: 'Community' },
  { value: 'chat', label: 'Just chat' },
];

const RELATIONSHIP_OPTIONS: { value: RelationshipStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'in_relationship', label: 'In a relationship' },
  { value: 'married', label: 'Married' },
  { value: 'open_relationship', label: 'Open relationship' },
  { value: 'complicated', label: "It's complicated" },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const TOTAL_STEPS = 4;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { profile, updateProfile, completeOnboarding } = useSessionStore();

  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<string[]>(profile?.photos ?? []);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>(
    profile?.relationshipStatus ?? 'single'
  );
  const [lookingFor, setLookingFor] = useState<LookingFor[]>(profile?.lookingFor ?? []);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function toggleLookingFor(value: LookingFor) {
    setLookingFor((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function handlePhotoPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show a local preview immediately, then upload and swap in the real URL
    const localUrl = URL.createObjectURL(file);
    setPhotos((prev) => [...prev, localUrl]);
    profileService.uploadPhoto(file).then((remoteUrl) => {
      setPhotos((prev) => prev.map((u) => (u === localUrl ? remoteUrl : u)));
    }).catch(() => {
      // If upload fails, remove the preview
      setPhotos((prev) => prev.filter((u) => u !== localUrl));
    });
  }

  const canAdvance = (() => {
    switch (step) {
      case 0:
        return photos.length > 0;
      case 1:
        return displayName.trim().length > 0 && Number(age) >= 18 && city.trim().length > 0;
      case 2:
        return lookingFor.length > 0;
      case 3:
        return bio.trim().length >= 10;
      default:
        return true;
    }
  })();

  async function handleNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await profileService.updateMe({
        photos,
        displayName: displayName.trim(),
        age: Number(age),
        city: city.trim(),
        relationshipStatus,
        lookingFor,
        bio: bio.trim(),
      });
      updateProfile(updated);
      completeOnboarding();
      navigate('/discover', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg || 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={`${styles.progressSegment} ${i <= step ? styles.progressActive : ''}`} />
        ))}
      </div>

      <div className={styles.content}>
        {step === 0 && (
          <section>
            <h1 className={styles.title}>Add your photos</h1>
            <p className={styles.subtitle}>Add at least one photo. You can manage who sees your profile in privacy settings.</p>
            <div className={styles.photoGrid}>
              {photos.map((src, i) => (
                <div key={i} className={styles.photoSlot}>
                  <img src={src} alt={`Photo ${i + 1}`} />
                </div>
              ))}
              {photos.length < 6 && (
                <label className={styles.photoSlotEmpty}>
                  <Camera size={24} />
                  <span>Add photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoPick} className="visually-hidden" />
                </label>
              )}
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className={styles.title}>The basics</h1>
            <p className={styles.subtitle}>Your Telegram account is linked automatically. Choose how you appear to others.</p>
            <div className={styles.field}>
              <label>Telegram username (auto-linked)</label>
              <div className={styles.input} style={{ color: 'var(--color-text-faint)', opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>@{profile?.telegramUsername ?? '...'}</span>
                <span style={{ fontSize: 11, color: 'var(--color-secondary)' }}>✓ Verified by Telegram</span>
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="displayName">Display name <span style={{color:'var(--color-accent)'}}>*</span></label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Choose how your name appears (e.g. Alex, Max, J)"
                className={styles.input}
              />
              <p style={{fontSize:12, color:'var(--color-text-faint)', marginTop:4}}>This is separate from your Telegram name — you choose it freely.</p>
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="age">Age</label>
                <input
                  id="age"
                  type="number"
                  min={18}
                  max={99}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="18+"
                  className={styles.input}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Your city"
                  className={styles.input}
                />
              </div>
            </div>
            <div className={styles.field}>
              <label>Relationship status</label>
              <div className={styles.chipWrap}>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <Chip key={opt.value} selected={relationshipStatus === opt.value} onClick={() => setRelationshipStatus(opt.value)}>
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className={styles.title}>What are you looking for?</h1>
            <p className={styles.subtitle}>Select all that apply. You can change this anytime.</p>
            <div className={styles.chipWrap}>
              {LOOKING_FOR_OPTIONS.map((opt) => (
                <Chip key={opt.value} selected={lookingFor.includes(opt.value)} onClick={() => toggleLookingFor(opt.value)}>
                  {opt.label}
                </Chip>
              ))}
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className={styles.title}>Write your bio</h1>
            <p className={styles.subtitle}>A few sentences about you go a long way. Be yourself.</p>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people a bit about yourself..."
              className={styles.textarea}
              rows={5}
              maxLength={400}
            />
            <div className={styles.charCount}>{bio.length}/400</div>
          </section>
        )}
      </div>

      <div className={styles.footer}>
        {saveError && (
          <p style={{ color: 'var(--color-error, #e74c3c)', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
            {saveError}
          </p>
        )}
        <Button fullWidth onClick={handleNext} disabled={!canAdvance || saving}>
          {step < TOTAL_STEPS - 1 ? 'Continue' : saving ? 'Saving...' : 'Finish'}
          <ChevronRight size={18} />
        </Button>
      </div>
    </div>
  );
}
