import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Lock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { adminService } from '@/api/services';
import type { VerificationRequest } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import styles from './Admin.module.css';

// ==========================================================================
// AdminVerification — review selfie submissions.
//
// PRIVACY NOTE: selfieUrl is only included in responses to authenticated
// admin sessions. Regular users never receive this field from the API.
// Selfies are stored in a private bucket, never publicly accessible.
// ==========================================================================

export function AdminVerification() {
  const [queue, setQueue] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  useEffect(() => {
    adminService.getVerificationQueue().then(data => {
      setQueue(data);
      setLoading(false);
    });
  }, []);

  async function approve(id: string) {
    setActing(id);
    await adminService.approveVerification(id);
    setQueue(prev => prev.filter(r => r.id !== id));
    setActing(null);
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return;
    setActing(id);
    await adminService.rejectVerification(id, rejectReason);
    setQueue(prev => prev.filter(r => r.id !== id));
    setActing(null);
    setRejectTarget(null);
    setRejectReason('');
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Verification queue" showBack />

      <div className={styles.content}>
        <div className={styles.section}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-secondary-soft)', borderRadius: 'var(--radius-md)' }}>
            <Lock size={14} color="var(--color-secondary)" />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              Selfies are only visible to admins here. They are never shown on public profiles or to other users.
            </span>
          </div>
        </div>

        {loading && <div className={styles.empty}>Loading queue...</div>}

        {!loading && queue.length === 0 && (
          <div className={styles.empty}>
            <CheckCircle2 size={32} color="var(--color-success)" style={{ margin: '0 auto 8px' }} />
            No pending verification requests
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {queue.map(req => (
            <div key={req.id} className={styles.verificationCard}>
              {/* Selfie — admin-only view */}
              <div style={{ position: 'relative' }}>
                <img
                  src={req.selfieUrl}
                  alt="Verification selfie"
                  className={styles.selfieImage}
                />
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(0,0,0,0.7)', borderRadius: 'var(--radius-pill)',
                  padding: '3px 10px', fontSize: 11, color: 'white', fontFamily: 'var(--font-mono)',
                }}>
                  🔒 Admin only
                </div>
              </div>

              <div className={styles.verificationInfo}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{req.displayName}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>
                    @{req.telegramUsername} · ID: {req.telegramId}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4 }}>
                    Submitted {formatDistanceToNowStrict(new Date(req.submittedAt))} ago
                  </div>
                </div>

                {rejectTarget === req.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection..."
                      className={styles.confirmInput}
                    />
                    <div className={styles.verificationActions}>
                      <Button variant="secondary" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>
                        Cancel
                      </Button>
                      <Button variant="danger" fullWidth onClick={() => reject(req.id)}
                        disabled={!rejectReason.trim() || acting === req.id}>
                        {acting === req.id ? 'Rejecting...' : 'Confirm reject'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.verificationActions}>
                    <Button variant="secondary" onClick={() => setRejectTarget(req.id)}>
                      <XCircle size={16} /> Reject
                    </Button>
                    <Button fullWidth onClick={() => approve(req.id)} disabled={acting === req.id}>
                      <CheckCircle2 size={16} />
                      {acting === req.id ? 'Approving...' : 'Approve & verify'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
