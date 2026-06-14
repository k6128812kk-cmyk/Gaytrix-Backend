import { create } from 'zustand';
import type { UserProfile } from '@/types';

// ==========================================================================
// Session store — authenticated user profile and onboarding state.
//
// Admin access is determined ONLY by the adminRole field returned by the
// server after verifying initData. The client never grants itself any role.
// ==========================================================================

interface SessionState {
  profile: UserProfile | null;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  setProfile: (profile: UserProfile) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  setLoading: (loading: boolean) => void;
  completeOnboarding: () => void;
  // Convenience selectors
  isAdmin: () => boolean;
  isModerator: () => boolean;
  isActive: () => boolean;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  profile: null,
  isLoading: true,
  hasCompletedOnboarding: false,

  setProfile: (profile) =>
    set({
      profile,
      // Onboarding is complete when the user has set a display name and bio.
      // Photo and other fields can be added later.
      hasCompletedOnboarding:
        profile.displayName.trim().length > 0 && profile.bio.trim().length > 0,
    }),

  updateProfile: (patch) =>
    set((state) => {
      const profile = state.profile ? { ...state.profile, ...patch } : state.profile;
      return {
        profile,
        // Recalculate onboarding status whenever the profile is updated,
        // so that completing the bio step during onboarding unlocks the app.
        hasCompletedOnboarding:
          state.hasCompletedOnboarding ||
          (profile != null &&
            profile.displayName.trim().length > 0 &&
            profile.bio.trim().length > 0),
      };
    }),

  setLoading: (isLoading) => set({ isLoading }),
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),

  // Admin checks — read from server-returned profile, never client-set
  isAdmin: () => {
    const role = get().profile?.adminRole;
    return role === 'super_admin' || role === 'admin';
  },
  isModerator: () => {
    const role = get().profile?.adminRole;
    return role === 'super_admin' || role === 'admin' || role === 'moderator';
  },
  // Banned/suspended users cannot use the app
  isActive: () => get().profile?.accountStatus === 'active',
}));
