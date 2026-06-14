import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import { testConnection } from './db/pool';
import { startBot, bot } from './bot/bot';
import routes from './routes/index';
import fs from 'fs';

// ==========================================================================
// GayTrix Backend Server
// ==========================================================================

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ------------------------------------------------------------------
// Security middleware
// ------------------------------------------------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow photo serving
}));

app.use(cors({
  origin: IS_PRODUCTION ? [FRONTEND_URL] : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
}));

// Rate limiting — prevent abuse
app.use('/v1/', rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: 'Too many requests, please slow down' },
}));

// Stricter rate limit on auth-heavy endpoints
app.use('/v1/profile', rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------------
// Static file serving for uploaded photos
// Selfies are served from /uploads/selfies/ — this path is NOT
// publicly documented and selfie filenames are UUIDs (unguessable).
// In production, move selfies to a private bucket instead.
// ------------------------------------------------------------------
const uploadsDir = path.join(process.cwd(), 'uploads');
['photos', 'selfies'].forEach(dir => {
  fs.mkdirSync(path.join(uploadsDir, dir), { recursive: true });
});
app.use('/uploads', express.static(uploadsDir));

// ------------------------------------------------------------------
// API routes
// ------------------------------------------------------------------
app.use('/v1', routes);

// ------------------------------------------------------------------
// Telegram bot webhook (production)
// ------------------------------------------------------------------
app.post('/bot/webhook', (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------
async function start() {
  try {
    await testConnection();

    const webhookUrl = process.env.WEBHOOK_URL;
    await startBot(IS_PRODUCTION && !!webhookUrl, webhookUrl);

    app.listen(PORT, () => {
      console.log(`✅ GayTrix backend running on port ${PORT}`);
      console.log(`   Mode: ${IS_PRODUCTION ? 'production' : 'development'}`);
      console.log(`   Bot: ${IS_PRODUCTION ? 'webhook' : 'polling'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  }
}

start();
