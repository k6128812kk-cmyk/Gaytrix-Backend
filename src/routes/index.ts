import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import { authMiddleware, adminMiddleware, adminOnlyMiddleware } from '../middleware/auth';
import { getMe, updateMe, getProfile, reportUser, blockUser, getBlockedUsers, unblockUser } from '../controllers/profile';
import { uploadPhoto, servePhoto, deletePhoto } from '../controllers/photos';
import { createInvoice } from '../controllers/premium';
import { getNearby, getExplore } from '../controllers/discovery';
import { getConversations, getMessages, sendMessage, startConversation, sendPhotoMessage } from '../controllers/messages';
import { getLocations, createLocation, upvoteLocation, reportLocation } from '../controllers/map';
import {
  getEvents, createEvent, joinEvent, leaveEvent, deleteEvent, updateEvent,
  getEventAttendees, getGroupMessages as getEventGroupMessages,
  sendGroupMessage as sendEventGroupMessage, reportEvent,
} from '../controllers/events';
import { requestVerification, getVerificationQueue, approveVerification, rejectVerification } from '../controllers/verification';
import {
  getStats, getUsers, banUser, suspendUser, unsuspendUser,
  removeUser, getReports, dismissReport, getAuditLog, sendAnnouncement,
  revokePremium, grantPremium, removeVerification, grantVerification,
  getModerators, promoteModerator, demoteModerator,
} from '../controllers/admin';
import {
  getGroups, getGroup, createGroup, joinGroup, leaveGroup, deleteGroup,
  getGroupMessages, sendGroupMessage, getGroupMembers,
} from '../controllers/groups';
import { getStories, createStory, markStoryViewed, deleteStory, getStoryViewers, replyToStory } from '../controllers/stories';

// ── Upload directories ────────────────────────────────────────────
function makeUpload(subdir: string) {
  const dir = path.join(process.cwd(), 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Images only'));
    },
  });
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});
const selfieUpload = makeUpload('selfies');
const groupPhotoUpload = makeUpload('groups');
const storyUpload = makeUpload('stories');

const router = Router();

// Photo serving — public (UUID filenames are unguessable)
router.get('/photos/:photoId', servePhoto);

// All remaining routes require auth
router.use(authMiddleware);

// ── Profile ───────────────────────────────────────────────────────
router.get('/profile/me', getMe);
router.patch('/profile/me', updateMe);
router.get('/profiles/:id', getProfile);
router.get('/users/blocked', getBlockedUsers);
router.post('/users/:id/report', reportUser);
router.post('/users/:id/block', blockUser);
router.delete('/users/:id/block', unblockUser);
router.post('/profile/photos', memoryUpload.single('photo'), uploadPhoto as any);
router.delete('/profile/photos/:photoId', deletePhoto as any);

// ── Premium ───────────────────────────────────────────────────────
router.post('/premium/create-invoice', createInvoice);

// ── Discovery ─────────────────────────────────────────────────────
router.get('/discovery/nearby', getNearby);
router.get('/discovery/explore/:section', getExplore);

// ── Messages ──────────────────────────────────────────────────────
router.get('/messages/conversations', getConversations);
router.get('/messages/conversations/:conversationId', getMessages);
router.post('/messages/conversations/:conversationId', sendMessage);
router.post('/messages/conversations/:conversationId/photo', memoryUpload.single('photo'), sendPhotoMessage as any);
router.post('/messages/start', startConversation);

// ── Map locations ─────────────────────────────────────────────────
router.get('/map/locations', getLocations);
router.post('/map/locations', createLocation);
router.post('/map/locations/:locationId/upvote', upvoteLocation);
router.post('/map/locations/:locationId/report', reportLocation);

// ── Map events ────────────────────────────────────────────────────
router.get('/events', getEvents);
router.post('/events', createEvent);
router.post('/events/:eventId/join', joinEvent);
router.post('/events/:eventId/leave', leaveEvent);
router.delete('/events/:eventId', deleteEvent);
router.patch('/events/:eventId', updateEvent);
router.get('/events/:eventId/attendees', getEventAttendees);
router.post('/events/:eventId/report', reportEvent);
router.get('/group-chat/:conversationId/messages', getEventGroupMessages);
router.post('/group-chat/:conversationId/messages', sendEventGroupMessage);

// ── Community Groups ──────────────────────────────────────────────
router.get('/groups', getGroups);
router.get('/groups/:groupId', getGroup);
router.post('/groups', groupPhotoUpload.single('photo'), createGroup);
router.post('/groups/:groupId/join', joinGroup);
router.post('/groups/:groupId/leave', leaveGroup);
router.delete('/groups/:groupId', deleteGroup);
router.get('/groups/:groupId/messages', getGroupMessages);
router.post('/groups/:groupId/messages', sendGroupMessage);
router.get('/groups/:groupId/members', getGroupMembers);

// ── Stories ───────────────────────────────────────────────────────
router.get('/stories', getStories);
router.post('/stories', storyUpload.single('photo'), createStory);
router.post('/stories/:storyId/view', markStoryViewed);
router.delete('/stories/:storyId', deleteStory);
router.get('/stories/:storyId/viewers', getStoryViewers);
router.post('/stories/:storyId/reply', replyToStory);

// ── Verification ──────────────────────────────────────────────────
router.post('/verification/request', selfieUpload.single('selfie'), requestVerification);

// ── Admin routes ──────────────────────────────────────────────────
router.get('/admin/stats', adminMiddleware, getStats);
router.get('/admin/users', adminOnlyMiddleware, getUsers);
router.post('/admin/users/:userId/ban', adminMiddleware, banUser);
router.post('/admin/users/:userId/suspend', adminMiddleware, suspendUser);
router.post('/admin/users/:userId/unsuspend', adminMiddleware, unsuspendUser);
router.post('/admin/users/:userId/revoke-premium', adminOnlyMiddleware, revokePremium);
router.post('/admin/users/:userId/grant-premium', adminOnlyMiddleware, grantPremium);
router.post('/admin/users/:userId/remove-verification', adminMiddleware, removeVerification);
router.post('/admin/users/:userId/grant-verification', adminMiddleware, grantVerification);
router.delete('/admin/users/:userId', adminOnlyMiddleware, removeUser);
router.get('/admin/verification/queue', adminMiddleware, getVerificationQueue);
router.post('/admin/verification/:requestId/approve', adminMiddleware, approveVerification);
router.post('/admin/verification/:requestId/reject', adminMiddleware, rejectVerification);
router.get('/admin/reports', adminMiddleware, getReports);
router.post('/admin/reports/:reportId/dismiss', adminMiddleware, dismissReport);
router.get('/admin/audit-log', adminMiddleware, getAuditLog);
router.post('/admin/announcements', adminOnlyMiddleware, sendAnnouncement);
router.get('/admin/moderators', adminOnlyMiddleware, getModerators);
router.post('/admin/users/:userId/promote-moderator', adminOnlyMiddleware, promoteModerator);
router.post('/admin/users/:userId/demote-moderator', adminOnlyMiddleware, demoteModerator);

export default router;
