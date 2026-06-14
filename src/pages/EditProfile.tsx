import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { useSessionStore } from '@/context/sessionStore';
import { profileService } from '@/api/services';
import type { LookingFor } from '@/types';
import styles from './EditProfile.module.css';

// ==========================================================================
// EditProfile — edit display info, photos, bio, interests, looking-for,
// and social links. Saves via profileService.updateMe.
// ==========================================================================

const LOOKING_FOR_OPTIONS: { value: LookingFor; label: string }[] = [
  { value: 'friends', label: 'Friends' },
  { value: 'dating', label: 'Dating' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'networking', label: 'Networking' },
  { value: 'community', label: 'Community' },
  { value: 'chat', label: 'Just chat' },
];

const INTEREST_SUGGESTIONS = ['Music', 'Coffee', 'Hiking', 'Travel', 'Tech', 'Books', 'Nightlife', 'Food', 'Photography', 'Cinema', 'Fitness'];

export function EditProfilePage() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useSessionStore();

  const [photos, setPhotos] = useState<string[]>(profile?.photos ?? []);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [occupation, setOccupation] = useState(profile?.occupation ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [lookingFor, setLookingFor] = useState<LookingFor[]>(profile?.lookingFor ?? []);
  const [saving, setSaving] = useState(false);

  function toggleInterest(value: string) {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleLookingFor(value: LookingFor) {
    setLookingFor((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function handlePhotoPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPhotos((prev) => (prev.length < 6 ? [...prev, localUrl] : prev));
    setPendingUploads((n) => n + 1);
    profileService.uploadPhoto(file).then((remoteUrl) => {
      setPhotos((prev) => prev.map((u) => (u === localUrl ? remoteUrl : u)));
    }).catch(() => {
      setPhotos((prev) => prev.filter((u) => u !== localUrl));
    }).finally(() => {
      setPendingUploads((n) => n - 1);
    });
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    // Filter out any blob:// URLs — only save permanent backend URLs
    const persistedPhotos = photos.filter((u) => !u.startsWith('blob:'));
    setSaving(true);
    try {
      const updated = await profileService.updateMe({
        photos: persistedPhotos,
        displayName: displayName.trim(),
        bio: bio.trim(),
        occupation: occupation.trim() || undefined,
        interests,
        lookingFor,
      });
      updateProfile(updated);
      navigate(-1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Edit profile" showBack />

      <div className={styles.content}>
        <section className={styles.section}>
          <label className={styles.label}>Photos</label>
          <div className={styles.photoGrid}>
            {photos.map((src, i) => (
              <div key={i} className={styles.photoSlot}>
                <img src={src} alt={`Photo ${i + 1}`} />
                <button className={styles.removePhoto} onClick={() => removePhoto(i)} aria-label="Remove photo">
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < 6 && (
              <label className={styles.photoSlotEmpty}>
                <Camera size={20} />
                <input type="file" accept="image/*" onChange={handlePhotoPick} className="visually-hidden" />
              </label>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="displayName">
            Display name
          </label>
          <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={styles.input} />
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="occupation">
            Occupation
          </label>
          <input
            id="occupation"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            placeholder="Optional"
            className={styles.input}
          />
        </section>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="bio">
            Bio
          </label>
          <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={400} className={styles.textarea} />
          <div className={styles.charCount}>{bio.length}/400</div>
        </section>

        <section className={styles.section}>
          <label className={styles.label}>Looking for</label>
          <div className={styles.chipWrap}>
            {LOOKING_FOR_OPTIONS.map((opt) => (
              <Chip key={opt.value} selected={lookingFor.includes(opt.value)} onClick={() => toggleLookingFor(opt.value)}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.label}>Interests</label>
          <div className={styles.chipWrap}>
            {INTEREST_SUGGESTIONS.map((interest) => (
              <Chip key={interest} selected={interests.includes(interest)} onClick={() => toggleInterest(interest)}>
                {interests.includes(interest) ? null : <Plus size={12} />}
                {interest}
              </Chip>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <Button fullWidth onClick={handleSave} disabled={saving || pendingUploads > 0}>
          {pendingUploads > 0 ? `Uploading ${pendingUploads} photo${pendingUploads > 1 ? 's' : ''}...` : saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
