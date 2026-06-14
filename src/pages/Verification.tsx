import { useState } from 'react';
import { Camera, ShieldCheck, Clock, XCircle, Lock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { useSessionStore } from '@/context/sessionStore';
import { profileService } from '@/api/services';
import styles from './Verification.module.css';

// ==========================================================================
// Verification — optional identity verification via selfie upload.
// Selfies are sent directly to the admin review queue and are never
// displayed publicly or stored alongside the public profile.
// ==========================================================================

export function VerificationPage() {
  const { profile, updateProfile } = useSessionStore();
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!profile) return null;

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!selfieFile) return;
    setSubmitting(true);
    try {
      await profileService.requestVerification(selfieFile);
      updateProfile({ verification: 'pending' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Verification" showBack />

      <div className={styles.content}>
        {profile.verification === 'verified' && (
          <StatusBanner icon={ShieldCheck} tone="gold" title="You're verified" description="Your profile shows a verification badge and gets priority placement in discovery." />
        )}

        {profile.verification === 'pending' && (
          <StatusBanner icon={Clock} tone="neutral" title="Verification pending" description="Our team is reviewing your selfie. This usually takes 24-48 hours." />
        )}

        {profile.verification === 'rejected' && (
          <StatusBanner icon={XCircle} tone="danger" title="Verification rejected" description="Your last submission didn't meet our requirements. You can try again below." />
        )}

        {(profile.verification === 'none' || profile.verification === 'rejected') && (
          <>
            <section className={styles.infoSection}>
              <h2 className={styles.heading}>Get a verification badge</h2>
              <p className={styles.body}>
                Verification is completely optional. Verified profiles get a blue badge and priority placement in discovery feeds, helping
                others trust that you're a real person.
              </p>
            </section>

            <section className={styles.infoSection}>
              <div className={styles.privacyNote}>
                <Lock size={16} />
                <p>
                  Your selfie is only ever seen by admins reviewing your request. It is never shown on your public profile or to other
                  users.
                </p>
              </div>
            </section>

            <section className={styles.uploadSection}>
              <label className={styles.uploadBox}>
                {selfiePreview ? (
                  <img src={selfiePreview} alt="Selfie preview" className={styles.preview} />
                ) : (
                  <>
                    <Camera size={28} />
                    <span>Take or upload a selfie</span>
                  </>
                )}
                <input type="file" accept="image/*" capture="user" onChange={handleFilePick} className="visually-hidden" />
              </label>
              <ul className={styles.requirements}>
                <li>Clear photo of your face, good lighting</li>
                <li>No filters, sunglasses, or face coverings</li>
                <li>Must match your profile photos</li>
              </ul>
            </section>
          </>
        )}
      </div>

      {(profile.verification === 'none' || profile.verification === 'rejected') && (
        <div className={styles.footer}>
          <Button fullWidth onClick={handleSubmit} disabled={!selfieFile || submitting}>
            {submitting ? 'Submitting...' : 'Submit for review'}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBanner({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: typeof ShieldCheck;
  tone: 'gold' | 'neutral' | 'danger';
  title: string;
  description: string;
}) {
  return (
    <div className={`${styles.banner} ${styles[`banner_${tone}`]}`}>
      <Icon size={24} />
      <div>
        <h3 className={styles.bannerTitle}>{title}</h3>
        <p className={styles.bannerBody}>{description}</p>
      </div>
    </div>
  );
}
