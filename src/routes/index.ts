import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { getMe, updateMe, getProfile, reportUser, blockUser } from '../controllers/profile';
import { getNearby, getExplore } from '../controllers/discovery';
import { getConversations, getMessages, sendMessage, startConversation } from '../controllers/messages';
import {
  requestVerification, getVerificationQueue,
  approveVerification, rejectVerification,
} from '../controllers/verification';
import {
  getStats, getUsers, banUser, suspendUser, unsuspendUser,
  removeUser, getReports, dismissReport, getAuditLog, sendAnnouncement,
} from '../controllers/admin';

// ==========================================================================
// File upload configuration — selfies stored in /uploads/selfies/
// In production, swap to S3/Cloudflare R2 for persistent storage.
// ==========================================================================

const selfieStorage = multer.diskStorage({
  destination: './uploads/selfies',
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const photoStorage = multer.diskStorage({
  destination: './uploads/photos',
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const uploadSelfie = multer({
  storage: selfieStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

const router = Router();

// All routes require Telegram authentication
router.use(authMiddleware);

// ------------------------------------------------------------------
// Profile
// ------------------------------------------------------------------
router.get('/profile/me', getMe);
router.patch('/profile/me', updateMe);
router.get('/profiles/:id', getProfile);
router.post('/users/:id/report', reportUser);
router.post('/users/:id/block', blockUser);

// Photo upload — returns URL to store in profile.photos array
router.post('/profile/photos', uploadPhoto.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/photos/${req.file.filename}` });
});

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
router.post('/messages/start', startConversation);

// ------------------------------------------------------------------
// Verification
// ------------------------------------------------------------------
router.post('/verification/request', uploadSelfie.single('selfie'), requestVerification);

// ------------------------------------------------------------------
// Admin routes — require adminMiddleware on top of authMiddleware
// ------------------------------------------------------------------
router.get('/admin/stats', adminMiddleware, getStats);
router.get('/admin/users', adminMiddleware, getUsers);
router.post('/admin/users/:userId/ban', adminMiddleware, banUser);
router.post('/admin/users/:userId/suspend', adminMiddleware, suspendUser);
router.post('/admin/users/:userId/unsuspend', adminMiddleware, unsuspendUser);
router.delete('/admin/users/:userId', adminMiddleware, removeUser);
router.get('/admin/verification/queue', adminMiddleware, getVerificationQueue);
router.post('/admin/verification/:requestId/approve', adminMiddleware, approveVerification);
router.post('/admin/verification/:requestId/reject', adminMiddleware, rejectVerification);
router.get('/admin/reports', adminMiddleware, getReports);
router.post('/admin/reports/:reportId/dismiss', adminMiddleware, dismissReport);
router.get('/admin/audit-log', adminMiddleware, getAuditLog);
router.post('/admin/announcements', adminMiddleware, sendAnnouncement);

export default router;
