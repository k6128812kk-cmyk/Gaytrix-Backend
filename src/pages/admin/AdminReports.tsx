import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Ban } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { adminService } from '@/api/services';
import type { UserReport } from '@/types';
import { formatDistanceToNowStrict } from 'date-fns';
import styles from './Admin.module.css';

// ==========================================================================
// AdminReports — review user-submitted reports. Admins can dismiss (no
// action needed) or proceed to ban/suspend the reported user directly.
// ==========================================================================

export function AdminReports() {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    adminService.getReports().then(data => {
      setReports(data.filter(r => r.status === 'pending'));
      setLoading(false);
    });
  }, []);

  async function dismiss(reportId: string) {
    setActing(reportId);
    await adminService.dismissReport(reportId);
    setReports(prev => prev.filter(r => r.id !== reportId));
    setActing(null);
  }

  async function banReported(report: UserReport) {
    setActing(report.id);
    await adminService.banUser(report.reportedUserId, `Banned via report: ${report.reason}`);
    await adminService.dismissReport(report.id);
    setReports(prev => prev.filter(r => r.id !== report.id));
    setActing(null);
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Reports" showBack />

      <div className={styles.content}>
        {loading && <div className={styles.empty}>Loading reports...</div>}

        {!loading && reports.length === 0 && (
          <div className={styles.empty}>
            <CheckCircle2 size={32} color="var(--color-success)" style={{ margin: '0 auto 8px' }} />
            No pending reports
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {reports.map(report => (
            <div key={report.id} className={styles.reportCard}>
              <div className={styles.reportHeader}>
                <div>
                  <div className={styles.reportReason}>
                    <AlertTriangle size={13} style={{ display: 'inline', marginRight: 4 }} />
                    {report.reason}
                  </div>
                  <div className={styles.reportMeta}>
                    Reported by @{report.reporterUsername} · {formatDistanceToNowStrict(new Date(report.createdAt))} ago
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-faint)' }}>Reported user: </span>
                <span style={{ fontWeight: 700 }}>@{report.reportedUsername}</span>
              </div>

              {report.details && (
                <div className={styles.reportDetails}>{report.details}</div>
              )}

              <div className={styles.userActions}>
                <button className={styles.actionBtn} onClick={() => dismiss(report.id)}
                  disabled={acting === report.id}>
                  Dismiss
                </button>
                <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                  onClick={() => banReported(report)}
                  disabled={acting === report.id}>
                  <Ban size={12} /> Ban user
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
