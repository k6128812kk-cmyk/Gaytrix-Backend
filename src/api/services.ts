import { api } from './client';
import type {
  UserProfile, MapLocation, Conversation, ChatMessage,
  CommunityEvent, DiscoveryFilters, VerificationRequest,
  UserReport, AdminAction, PlatformStats,
} from '@/types';
import {
  currentUser, mockProfiles, mockLocations, mockConversations,
  mockMessages, mockEvents, mockVerificationRequests, mockReports,
  mockAdminActions, mockStats,
} from '@/mock/data';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ==========================================================================
// Profile service
// ==========================================================================
export const profileService = {
  async getMe(): Promise<UserProfile> {
    if (USE_MOCKS) { await delay(150); return currentUser; }
    const { data } = await api.get<UserProfile>('/profile/me');
    return data;
  },
  async uploadPhoto(file: File): Promise<string> {
    if (USE_MOCKS) {
      await delay(300);
      return URL.createObjectURL(file); // local blob only in mock mode
    }
    const form = new FormData();
    form.append('photo', file);
    const { data } = await api.post<{ url: string }>('/profile/photos', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    // Backend now returns an absolute URL directly
    return data.url;
  },
  async updateMe(patch: Partial<UserProfile>): Promise<UserProfile> {
    if (USE_MOCKS) { await delay(200); return { ...currentUser, ...patch }; }
    const { data } = await api.patch<UserProfile>('/profile/me', patch);
    return data;
  },
  async requestVerification(selfieFile: File): Promise<{ status: 'pending' }> {
    if (USE_MOCKS) { await delay(400); return { status: 'pending' }; }
    const form = new FormData();
    form.append('selfie', selfieFile);
    const { data } = await api.post('/verification/request', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async reportUser(userId: string, reason: string, details?: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(200); console.log('Reported user', userId, reason); return { ok: true }; }
    const { data } = await api.post(`/users/${userId}/report`, { reason, details });
    return data;
  },
  async blockUser(userId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(200); return { ok: true }; }
    const { data } = await api.post(`/users/${userId}/block`);
    return data;
  },
};

// ==========================================================================
// Discovery service
// ==========================================================================
export const discoveryService = {
  async getNearby(filters?: Partial<DiscoveryFilters>): Promise<UserProfile[]> {
    if (USE_MOCKS) {
      await delay(300);
      // Filter out suspended/banned accounts from discovery
      return mockProfiles.filter(p => p.accountStatus === 'active');
    }
    const { data } = await api.get<UserProfile[]>('/discovery/nearby', { params: filters });
    return data;
  },
  async getExplore(section: 'trending' | 'new' | 'verified' | 'recent'): Promise<UserProfile[]> {
    if (USE_MOCKS) {
      await delay(250);
      const active = mockProfiles.filter(p => p.accountStatus === 'active');
      switch (section) {
        case 'trending': return active.filter(p => p.membership === 'premium');
        case 'new': return [...active].reverse();
        case 'verified': return active.filter(p => p.verification === 'verified');
        case 'recent': return active.filter(p => p.isOnline);
      }
    }
    const { data } = await api.get<UserProfile[]>(`/discovery/explore/${section}`);
    return data;
  },
  async getProfile(id: string): Promise<UserProfile | undefined> {
    if (USE_MOCKS) {
      await delay(150);
      const p = mockProfiles.find(p => p.id === id) ?? currentUser;
      // Don't expose suspended/banned profiles to regular users
      if (p.accountStatus !== 'active' && p.id !== currentUser.id) return undefined;
      return p;
    }
    const { data } = await api.get<UserProfile>(`/profiles/${id}`);
    return data;
  },
};

// ==========================================================================
// Map service
// ==========================================================================
export const mapService = {
  async getLocations(): Promise<MapLocation[]> {
    if (USE_MOCKS) { await delay(250); return mockLocations; }
    const { data } = await api.get<MapLocation[]>('/map/locations');
    return data;
  },
  async upvote(locationId: string): Promise<{ upvotes: number }> {
    if (USE_MOCKS) {
      await delay(150);
      const loc = mockLocations.find(l => l.id === locationId);
      return { upvotes: (loc?.upvotes ?? 0) + 1 };
    }
    const { data } = await api.post(`/map/locations/${locationId}/upvote`);
    return data;
  },
  async report(locationId: string, reason: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(150); return { ok: true }; }
    const { data } = await api.post(`/map/locations/${locationId}/report`, { reason });
    return data;
  },
  async createLocation(payload: Omit<MapLocation, 'id' | 'upvotes' | 'reportsCount' | 'createdAt'>): Promise<MapLocation> {
    if (USE_MOCKS) {
      await delay(250);
      return { ...payload, id: `loc_${Date.now()}`, upvotes: 0, reportsCount: 0, createdAt: new Date().toISOString() };
    }
    const { data } = await api.post<MapLocation>('/map/locations', payload);
    return data;
  },
};

// ==========================================================================
// Chat service
// ==========================================================================
export const chatService = {
  async getConversations(): Promise<Conversation[]> {
    if (USE_MOCKS) { await delay(250); return mockConversations; }
    const { data } = await api.get<Conversation[]>('/messages/conversations');
    return data;
  },
  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    if (USE_MOCKS) { await delay(200); return mockMessages[conversationId] ?? []; }
    const { data } = await api.get<ChatMessage[]>(`/messages/conversations/${conversationId}`);
    return data;
  },
  async sendMessage(conversationId: string, text: string): Promise<ChatMessage> {
    if (USE_MOCKS) {
      await delay(150);
      return {
        id: `m_${Date.now()}`, conversationId,
        senderId: currentUser.id, type: 'text', text,
        sentAt: new Date().toISOString(), readAt: null,
      };
    }
    const { data } = await api.post<ChatMessage>(`/messages/conversations/${conversationId}`, { text });
    return data;
  },
  async startConversation(targetUserId: string): Promise<{ conversationId: string }> {
    if (USE_MOCKS) {
      await delay(200);
      return { conversationId: `conv_${Date.now()}` };
    }
    const { data } = await api.post<{ conversationId: string }>('/messages/start', { targetUserId });
    return data;
  },
  async sendPhotoMessage(conversationId: string, file: File): Promise<ChatMessage> {
    if (USE_MOCKS) {
      await delay(300);
      return {
        id: `m_${Date.now()}`, conversationId,
        senderId: currentUser.id, type: 'image',
        mediaUrl: URL.createObjectURL(file),
        sentAt: new Date().toISOString(), readAt: null,
      };
    }
    const form = new FormData();
    form.append('photo', file);
    const { data } = await api.post<ChatMessage>(
      `/messages/conversations/${conversationId}/photo`, form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },
};

// ==========================================================================
// Event service
// ==========================================================================
export const eventService = {
  async getEvents(): Promise<CommunityEvent[]> {
    if (USE_MOCKS) { await delay(250); return mockEvents; }
    const { data } = await api.get<CommunityEvent[]>('/events');
    return data;
  },
  async rsvp(eventId: string, status: 'going' | 'interested' | 'none'): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(150); return { ok: true }; }
    const { data } = await api.post(`/events/${eventId}/rsvp`, { status });
    return data;
  },
};

// ==========================================================================
// Admin service — all endpoints 403 unless adminRole is admin/super_admin
// The backend enforces this; the frontend just calls the endpoints.
// ==========================================================================
export const adminService = {
  async getStats(): Promise<PlatformStats> {
    if (USE_MOCKS) { await delay(300); return mockStats; }
    const { data } = await api.get<PlatformStats>('/admin/stats');
    return data;
  },
  async getUsers(params?: { search?: string; status?: string; verification?: string; page?: number }): Promise<UserProfile[]> {
    if (USE_MOCKS) {
      await delay(300);
      let users = [currentUser, ...mockProfiles];
      if (params?.search) {
        const q = params.search.toLowerCase();
        users = users.filter(u =>
          u.displayName.toLowerCase().includes(q) ||
          u.telegramUsername.toLowerCase().includes(q)
        );
      }
      if (params?.status) users = users.filter(u => u.accountStatus === params.status);
      if (params?.verification) users = users.filter(u => u.verification === params.verification);
      return users;
    }
    const { data } = await api.get<UserProfile[]>('/admin/users', { params });
    return data;
  },
  async getVerificationQueue(): Promise<VerificationRequest[]> {
    if (USE_MOCKS) { await delay(250); return mockVerificationRequests; }
    const { data } = await api.get<VerificationRequest[]>('/admin/verification/queue');
    return data;
  },
  async approveVerification(requestId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/verification/${requestId}/approve`);
    return data;
  },
  async rejectVerification(requestId: string, reason: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/verification/${requestId}/reject`, { reason });
    return data;
  },
  async getReports(): Promise<UserReport[]> {
    if (USE_MOCKS) { await delay(250); return mockReports; }
    const { data } = await api.get<UserReport[]>('/admin/reports');
    return data;
  },
  async dismissReport(reportId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(200); return { ok: true }; }
    const { data } = await api.post(`/admin/reports/${reportId}/dismiss`);
    return data;
  },
  async banUser(userId: string, reason: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/users/${userId}/ban`, { reason });
    return data;
  },
  async suspendUser(userId: string, reason: string, durationDays?: number): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/users/${userId}/suspend`, { reason, durationDays });
    return data;
  },
  async unsuspendUser(userId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/users/${userId}/unsuspend`);
    return data;
  },
  async removeUser(userId: string, reason: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.delete(`/admin/users/${userId}`, { data: { reason } });
    return data;
  },
  async revokePremium(userId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/users/${userId}/revoke-premium`);
    return data;
  },
  async grantPremium(userId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/users/${userId}/grant-premium`);
    return data;
  },
  async removeVerification(userId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/users/${userId}/remove-verification`);
    return data;
  },
  async grantVerification(userId: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(300); return { ok: true }; }
    const { data } = await api.post(`/admin/users/${userId}/grant-verification`);
    return data;
  },
  async sendAnnouncement(message: string): Promise<{ ok: true }> {
    if (USE_MOCKS) { await delay(400); console.log('Announcement:', message); return { ok: true }; }
    const { data } = await api.post('/admin/announcements', { message });
    return data;
  },
  async getAuditLog(): Promise<AdminAction[]> {
    if (USE_MOCKS) { await delay(250); return mockAdminActions; }
    const { data } = await api.get<AdminAction[]>('/admin/audit-log');
    return data;
  },
};
