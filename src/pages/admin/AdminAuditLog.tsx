import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { adminService } from '@/api/services';
import type { AdminAction } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import styles from './Admin.module.css';

// ==========================================================================
// AdminAuditLog — immutable record of all admin actions for accountability.
// ==========================================================================

const ACTION_LABELS: Record<AdminAction['action'], string> = {
  ban: 'BANNED',
  unban: 'UNBANNED',
  suspend: 'SUSPENDED',
  unsuspend: 'UNSUSPENDED',
  shadow_ban: 'SHADOW BANNED',
  verify: 'VERIFIED',
  reject_verification: 'REJECTED VERIFICATION',
  remove_account: 'REMOVED ACCOUNT',
  send_announcement: 'SENT ANNOUNCEMENT',
};

function actionColor(action: AdminAction['action']) {
  if (action === 'ban' || action === 'remove_account') return styles.auditAction_ban;
  if (action === 'suspend') return styles.auditAction_suspend;
  if (action === 'verify') return styles.auditAction_verify;
  return styles.auditAction_default;
}

export function AdminAuditLog() {
  const [log, setLog] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminService.getAuditLog().then(data => {
      setLog(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className={styles.page}>
      <PageHeader title="Audit log" showBack />

      <div className={styles.content}>
        {loading && <div className={styles.empty}>Loading...</div>}
        {!loading && log.length === 0 && <div className={styles.empty}>No actions recorded yet</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {log.map(entry => (
            <div key={entry.id} className={styles.auditEntry}>
              <span className={`${styles.auditAction} ${actionColor(entry.action)}`}>
                {ACTION_LABELS[entry.action]}
              </span>
              <span className={styles.auditText}>
                <strong>@{entry.adminUsername}</strong> → <strong>@{entry.targetUsername}</strong>
                {entry.reason && <> · {entry.reason}</>}
              </span>
              <span className={styles.auditTime}>
                {formatDistanceToNowStrict(new Date(entry.performedAt))} ago
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
