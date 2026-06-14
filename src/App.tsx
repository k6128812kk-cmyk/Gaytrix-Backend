import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { OnboardingPage } from '@/pages/Onboarding';
import { DiscoverPage } from '@/pages/Discover';
import { FiltersPage } from '@/pages/Filters';
import { ProfileDetailPage } from '@/pages/ProfileDetail';
import { MapPage } from '@/pages/MapPage';
import { ChatListPage } from '@/pages/ChatList';
import { ConversationPage } from '@/pages/Conversation';
import { ProfilePage } from '@/pages/Profile';
import { EditProfilePage } from '@/pages/EditProfile';
import { VerificationPage } from '@/pages/Verification';
import { PremiumPage } from '@/pages/Premium';
import { PrivacyPage } from '@/pages/Privacy';
import { NotificationsPage } from '@/pages/Notifications';
import { HelpPage } from '@/pages/Help';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminUsers } from '@/pages/admin/AdminUsers';
import { AdminVerification } from '@/pages/admin/AdminVerification';
import { AdminReports } from '@/pages/admin/AdminReports';
import { AdminAuditLog } from '@/pages/admin/AdminAuditLog';
import { AdminModerators } from '@/pages/admin/AdminModerators';
import { useTelegram } from '@/hooks/useTelegram';
import { useSessionStore } from '@/context/sessionStore';
import { profileService } from '@/api/services';
import { setInitData } from '@/api/client';
import styles from './App.module.css';

// ==========================================================================
// App — bootstraps Telegram auth, loads profile, guards routes.
//
// Auth flow:
// 1. Telegram WebApp SDK provides initData (signed by Telegram).
// 2. We attach initData to every API request header.
// 3. Backend verifies HMAC signature and returns the user's profile
//    with their server-assigned adminRole and accountStatus.
// 4. Client renders based on that — never self-assigning any privilege.
//
// Banned/suspended users see a blocked screen, not the app.
// Admin panel is only reachable if adminRole is super_admin or admin.
// ==========================================================================

function BannedScreen({ status }: { status: string }) {
  return (
    <div className={styles.blockedScreen}>
      <div className={styles.blockedCard}>
        <span className={styles.blockedIcon}>🚫</span>
        <h2>Account {status === 'banned' ? 'permanently banned' : 'suspended'}</h2>
        <p>
          {status === 'banned'
            ? 'Your account has been permanently banned for violating community guidelines.'
            : 'Your account is temporarily suspended. Please check back later.'}
        </p>
        <p className={styles.blockedContact}>
          If you believe this is an error, contact support via @GayTrixSupport on Telegram.
        </p>
      </div>
    </div>
  );
}

function AdminGuard({ children }: { children: ReactNode }) {
  const { isModerator } = useSessionStore();
  if (!isModerator()) return <Navigate to="/discover" replace />;
  return <>{children}</>;
}

export default function App() {
  const { initData, isReady } = useTelegram();
  const { profile, isLoading, hasCompletedOnboarding, setProfile, setLoading, isActive } = useSessionStore();

  useEffect(() => {
    if (!isReady) return;
    setInitData(initData);
    profileService.getMe().then(setProfile).finally(() => setLoading(false));
  }, [isReady, initData, setProfile, setLoading]);

  if (isLoading || !profile) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingLogo}>GT</div>
        <p>Loading...</p>
      </div>
    );
  }

  // Block banned/suspended users immediately
  if (!isActive()) {
    return <BannedScreen status={profile.accountStatus} />;
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingPage />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/discover" replace />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/discover/filters" element={<FiltersPage />} />
        <Route path="/u/:id" element={<ProfileDetailPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/chat" element={<ChatListPage />} />
        <Route path="/chat/:id" element={<ConversationPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<EditProfilePage />} />
        <Route path="/profile/verification" element={<VerificationPage />} />
        <Route path="/profile/premium" element={<PremiumPage />} />
        <Route path="/profile/privacy" element={<PrivacyPage />} />
        <Route path="/profile/notifications" element={<NotificationsPage />} />
        <Route path="/profile/help" element={<HelpPage />} />
        {/* Admin panel — server enforces role, AdminGuard is a client-side UX check */}
        <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
        <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
        <Route path="/admin/verification" element={<AdminGuard><AdminVerification /></AdminGuard>} />
        <Route path="/admin/reports" element={<AdminGuard><AdminReports /></AdminGuard>} />
        <Route path="/admin/audit" element={<AdminGuard><AdminAuditLog /></AdminGuard>} />
        <Route path="/admin/moderators" element={<AdminGuard><AdminModerators /></AdminGuard>} />
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Route>
    </Routes>
  );
}
