// ==========================================================================
// Core domain types — GayTrix Mini App
// ==========================================================================

export type RelationshipStatus =
  | 'single'
  | 'in_relationship'
  | 'married'
  | 'open_relationship'
  | 'complicated'
  | 'prefer_not_to_say';

export type LookingFor =
  | 'friends'
  | 'dating'
  | 'relationship'
  | 'networking'
  | 'community'
  | 'chat';

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

export type MembershipTier = 'free' | 'premium';

// Admin role — only admin, moderator set server-side, never by client
export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'none';

// Account status — set only by admins
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'shadow_banned';

export interface UserProfile {
  id: string;
  // Telegram identity — immutable, pulled from initData on every auth
  telegramId: number;
  telegramUsername: string;        // raw @username from Telegram
  // Profile fields chosen by the user
  displayName: string;
  photos: string[];
  age: number;
  heightCm?: number;
  weightKg?: number;
  country: string;
  city: string;
  nationality?: string;
  relationshipStatus: RelationshipStatus;
  lookingFor: LookingFor[];
  bio: string;
  languages: string[];
  interests: string[];
  occupation?: string;
  socialLinks?: { label: string; url: string }[];
  // Status fields — set server-side
  lastActiveAt: string;
  isOnline: boolean;
  verification: VerificationStatus;
  membership: MembershipTier;
  adminRole: AdminRole;
  accountStatus: AccountStatus;
  registeredAt: string;
  // Computed per-request
  distanceKm?: number;
  privacy: PrivacySettings;
  // Reports received (visible to admins only)
  reportsCount?: number;
}

export interface PrivacySettings {
  hideExactLocation: boolean;
  invisibleMode: boolean;
  hideOnlineStatus: boolean;
  privateProfile: boolean;
}

// Verification request — selfie visible to admins only, never publicly
export interface VerificationRequest {
  id: string;
  userId: string;
  telegramId: number;
  telegramUsername: string;
  displayName: string;
  selfieUrl: string;          // only returned to admin-role users
  submittedAt: string;
  status: VerificationStatus;
  reviewedBy?: string;        // admin userId
  reviewedAt?: string;
  rejectionReason?: string;
}

// User report
export interface UserReport {
  id: string;
  reporterId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  reason: string;
  details?: string;
  createdAt: string;
  status: 'pending' | 'reviewed' | 'dismissed';
}

// Admin action log
export interface AdminAction {
  id: string;
  adminId: string;
  adminUsername: string;
  targetUserId: string;
  targetUsername: string;
  action: 'ban' | 'unban' | 'suspend' | 'unsuspend' | 'shadow_ban' | 'verify' | 'reject_verification' | 'remove_account' | 'send_announcement';
  reason?: string;
  performedAt: string;
}

// Platform statistics for admin dashboard
export interface PlatformStats {
  totalUsers: number;
  activeToday: number;
  activeThisMonth: number;
  verifiedUsers: number;
  premiumUsers: number;
  pendingVerifications: number;
  pendingReports: number;
  bannedUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
}

export type LocationCategory =
  | 'social_meetup'
  | 'community_gathering'
  | 'cafe'
  | 'bar'
  | 'event_venue'
  | 'outdoor_spot'
  | 'cruising_area'
  | 'other';

export interface MapLocation {
  id: string;
  name: string;
  description: string;
  category: LocationCategory;
  lat: number;
  lng: number;
  upvotes: number;
  reportsCount: number;
  createdBy: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  participant: Pick<UserProfile, 'id' | 'displayName' | 'photos' | 'isOnline' | 'verification' | 'membership' | 'adminRole'>;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  isMessageRequest: boolean;
}

export type MessageContentType = 'text' | 'image' | 'voice';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageContentType;
  text?: string;
  mediaUrl?: string;
  durationSec?: number;
  sentAt: string;
  readAt?: string | null;
}

export interface DiscoveryFilters {
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number;
  country?: string;
  city?: string;
  relationshipStatus?: RelationshipStatus[];
  interests?: string[];
  languages?: string[];
  verifiedOnly?: boolean;
  onlineOnly?: boolean;
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  startsAt: string;
  location: Pick<MapLocation, 'name' | 'lat' | 'lng'>;
  hostId: string;
  attendeeCount: number;
  rsvpStatus?: 'going' | 'interested' | 'none';
}
