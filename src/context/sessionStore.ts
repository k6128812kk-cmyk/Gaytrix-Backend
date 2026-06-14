import { create } from 'zustand';
import type { UserProfile } from '@/types';

// ==========================================================================
// Session store — authenticated user profile, onboarding state, and
// global unread message count (for the TabBar badge).
// ==========================================================================

interface SessionState {
  profile: UserProfile | null;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  totalUnreadCount: number; // global unread conversations count
  setProfile: (profile: UserProfile) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  setLoading: (loading: boolean) => void;
  completeOnboarding: () => void;
  setTotalUnread: (count: number) => void;
  // Convenience selectors
  isAdmin: () => boolean;
  isModerator: () => boolean;
  isActive: () => boolean;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  profile: null,
  isLoading: true,
  hasCompletedOnboarding: false,
  totalUnreadCount: 0,

  setProfile: (profile) =>
    set({
      profile,
      hasCompletedOnboarding:
        profile.displayName.trim().length > 0 && profile.bio.trim().length > 0,
    }),

  updateProfile: (patch) =>
    set((state) => {
      const profile = state.profile ? { ...state.profile, ...patch } : state.profile;
      return {
        profile,
        hasCompletedOnboarding:
          state.hasCompletedOnboarding ||
          (profile != null &&
            profile.displayName.trim().length > 0 &&
            profile.bio.trim().length > 0),
      };
    }),

  setLoading: (isLoading) => set({ isLoading }),
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
  setTotalUnread: (count) => set({ totalUnreadCount: count }),

  isAdmin: () => {
    const role = get().profile?.adminRole;
    return role === 'super_admin' || role === 'admin';
  },
  isModerator: () => {
    const role = get().profile?.adminRole;
    return role === 'super_admin' || role === 'admin' || role === 'moderator';
  },
  isActive: () => get().profile?.accountStatus === 'active',
}));
