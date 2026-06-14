import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, adminMiddleware, adminOnlyMiddleware } from '../middleware/auth';
import { getMe, updateMe, getProfile, reportUser, blockUser, getBlockedUsers, unblockUser } from '../controllers/profile';
import { uploadPhoto, servePhoto, deletePhoto } from '../controllers/photos';
import { createInvoice } from '../controllers/premium';
import { getNearby, getExplore } from '../controllers/discovery';
import { getConversations, getMessages, sendMessage, startConversation, sendPhotoMessage } from '../controllers/messages';
import { getLocations, createLocation, upvoteLocation, reportLocation } from '../controllers/map';
import {
  requestVerification, getVerificationQueue,
  approveVerification, rejectVerification,
} from '../controllers/verification';
import {
  getStats, getUsers, banUser, suspendUser, unsuspendUser,
  removeUser, getReports, dismissReport, getAuditLog, sendAnnouncement,
  revokePremium, grantPremium, removeVerification, grantVerification,
  getModerators, promoteModerator, demoteModerator,
} from '../controllers/admin';

// Memory storage — photos stored in DB as base64, no disk needed
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

// Selfie storage still uses disk (admin-only view, not public)
import path from 'path';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
const selfieDir = path.join(process.cwd(), 'uploads/selfies');
fs.mkdirSync(selfieDir, { recursive: true });
const selfieUpload = multer({
  storage: multer.diskStorage({
    destination: selfieDir,
    filename: (_, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

const router = Router();

// ------------------------------------------------------------------
// Photo serving — public, no auth needed (photos are UUID-based so
// they are unguessable without knowing the URL)
// ------------------------------------------------------------------
router.get('/photos/:photoId', servePhoto);

// All remaining routes require Telegram authentication
router.use(authMiddleware);

// ------------------------------------------------------------------
// Profile
// ------------------------------------------------------------------
router.get('/profile/me', getMe);
router.patch('/profile/me', updateMe);
router.get('/profiles/:id', getProfile);
router.get('/users/blocked', getBlockedUsers);
router.post('/users/:id/report', reportUser);
router.post('/users/:id/block', blockUser);
router.delete('/users/:id/block', unblockUser);

// ------------------------------------------------------------------
// Photo upload — stores in DB, returns permanent URL
// ------------------------------------------------------------------
router.post('/profile/photos', memoryUpload.single('photo'), uploadPhoto as any);
router.delete('/profile/photos/:photoId', deletePhoto as any);

// ------------------------------------------------------------------
// Premium
// ------------------------------------------------------------------
router.post('/premium/create-invoice', createInvoice);

// ------------------------------------------------------------------
// Discovery
// ------------------------------------------------------------------
router.get('/discovery/nearby', getNearby);
router.get('/discovery/explore/:section', getExplore);

// ------------------------------------------------------------------
// Messages
// ------------------------------------------------------------------
router.get('/messages/conversations', getConversations);
router.get('/messages/conversations/:conversationId', getMessages);
router.post('/messages/conversations/:conversationId', sendMessage);
router.post('/messages/conversations/:conversationId/photo', memoryUpload.single('photo'), sendPhotoMessage as any);
router.post('/messages/start', startConversation);

// ------------------------------------------------------------------
// Map
// ------------------------------------------------------------------
router.get('/map/locations', getLocations);
router.post('/map/locations', createLocation);
router.post('/map/locations/:locationId/upvote', upvoteLocation);
router.post('/map/locations/:locationId/report', reportLocation);

// ------------------------------------------------------------------
// Verification
// ------------------------------------------------------------------
router.post('/verification/request', selfieUpload.single('selfie'), requestVerification);

// ------------------------------------------------------------------
// Admin routes — adminMiddleware allows admin + moderator
// adminOnlyMiddleware allows only admin
// ------------------------------------------------------------------
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
// Moderator management — admin-only (not moderators themselves)
router.get('/admin/moderators', adminOnlyMiddleware, getModerators);
router.post('/admin/users/:userId/promote-moderator', adminOnlyMiddleware, promoteModerator);
router.post('/admin/users/:userId/demote-moderator', adminOnlyMiddleware, demoteModerator);

export default router;
