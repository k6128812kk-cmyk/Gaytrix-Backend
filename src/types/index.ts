// ==========================================================================
// Core domain types — GayTrix Mini App
// ==========================================================================

export type RelationshipStatus =
  | 'single' | 'in_relationship' | 'married'
  | 'open_relationship' | 'complicated' | 'prefer_not_to_say';

export type LookingFor =
  | 'friends' | 'dating' | 'relationship'
  | 'networking' | 'community' | 'chat';

export type GenderIdentity = 'male' | 'female' | 'non_binary' | 'other' | '';
export type InterestedIn = 'men' | 'women' | 'everyone' | '';
export type Orientation =
  | 'gay' | 'lesbian' | 'bisexual' | 'straight'
  | 'pansexual' | 'asexual' | 'other' | '';

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type MembershipTier = 'free' | 'premium';
export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'none';
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'shadow_banned';

export interface UserProfile {
  id: string;
  telegramId: number;
  telegramUsername: string;
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
  lastActiveAt: string;
  isOnline: boolean;
  verification: VerificationStatus;
  membership: MembershipTier;
  adminRole: AdminRole;
  accountStatus: AccountStatus;
  registeredAt: string;
  distanceKm?: number;
  privacy: PrivacySettings;
  reportsCount?: number;
  genderIdentity?: GenderIdentity;
  interestedIn?: InterestedIn;
  orientation?: Orientation;
}

export interface PrivacySettings {
  hideExactLocation: boolean;
  invisibleMode: boolean;
  hideOnlineStatus: boolean;
  privateProfile: boolean;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  telegramId: number;
  telegramUsername: string;
  displayName: string;
  selfieUrl: string;
  submittedAt: string;
  status: VerificationStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

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

export interface AdminAction {
  id: string;
  adminId: string;
  adminUsername: string;
  targetUserId: string;
  targetUsername: string;
  action: string;
  reason?: string;
  performedAt: string;
}

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
  | 'social_meetup' | 'community_gathering' | 'cafe'
  | 'bar' | 'event_venue' | 'outdoor_spot' | 'cruising_area' | 'other';

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

// Community events pinned to the map
export interface MapEvent {
  id: string;
  title: string;
  description: string;
  category: LocationCategory;
  lat: number;
  lng: number;
  startsAt: string;
  endsAt?: string;
  maxAttendees?: number;
  createdBy: string;
  creatorName: string;
  creatorPhoto?: string;
  groupConversationId?: string;
  status: 'active' | 'deleted';
  attendeeCount: number;
  isAttending: boolean;
  createdAt: string;
  reportsCount: number;
}

export interface EventAttendee {
  id: string;
  displayName: string;
  photos: string[];
  verification: VerificationStatus;
  membership: MembershipTier;
  adminRole: AdminRole;
}

export interface GroupMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  type: 'text' | 'image';
  text?: string;
  mediaUrl?: string;
  sentAt: string;
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
  genderIdentity?: GenderIdentity;
  interestedIn?: InterestedIn;
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
