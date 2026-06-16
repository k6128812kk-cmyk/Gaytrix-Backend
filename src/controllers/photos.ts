import { Request, Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';
import { v4 as uuid } from 'uuid';

// ==========================================================================
// Photo controller — stores photos as base64 DATA URLs in PostgreSQL.
// Serves them back as binary image responses with explicit CORS headers so
// that Android WebView (Telegram) can load them correctly.
// iOS Safari is lenient with CORS/null-origin; Android Chrome is strict.
// ==========================================================================

/** Shared CORS + cache headers applied to every photo response. */
function setPhotoHeaders(res: Response, mimeType: string, contentLength: number) {
  res.set({
    // Explicit CORS — Android WebView may send Origin: null from the mini-app
    // context; the global cors() middleware may not match that, so we set it
    // explicitly here to guarantee the header is always present.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',

    // Content
    'Content-Type': mimeType,
    'Content-Length': String(contentLength),

    // Android Chrome requires Accept-Ranges for progressive image loading
    'Accept-Ranges': 'bytes',

    // Long-lived cache (UUID filenames are immutable)
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
}

export async function uploadPhoto(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mimeType = req.file.mimetype;
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const photoId = uuid();

    await db.query(
      `INSERT INTO photos (id, owner_id, data_url, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [photoId, req.user!.id, dataUrl]
    );

    // Always build an https:// URL. Railway sits behind a TLS-terminating proxy
    // so req.protocol is 'http' unless trust proxy is set — and even then,
    // hardcoding the env var is more reliable. Android blocks http:// images
    // loaded from an https:// Mini App (mixed content); iOS is lenient.
    const backendUrl = (process.env.BACKEND_URL || `https://${req.get('host')}`).replace(/\/+$/, '');
    res.json({ url: `${backendUrl}/v1/photos/${photoId}` });
  } catch (err) {
    console.error('uploadPhoto error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
}

export async function servePhoto(req: Request, res: Response) {
  // Handle OPTIONS preflight from Android WebView
  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.sendStatus(204);
  }

  try {
    const result = await db.query(
      'SELECT data_url FROM photos WHERE id = $1',
      [req.params.photoId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Photo not found' });

    const dataUrl: string = result.rows[0].data_url;

    // Use /s (dotAll) flag so `.` matches newlines, and trim any surrounding
    // whitespace that PostgreSQL TEXT columns can introduce.
    const match = dataUrl.trim().match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return res.status(500).json({ error: 'Invalid photo data' });

    const mimeType = match[1].trim();
    // Strip all whitespace (spaces, newlines, tabs) from base64 before decoding —
    // RFC 2045 line-wrapped base64 has \n every 76 chars; Node handles this but
    // Content-Length must match the decoded byte count exactly.
    const cleanBase64 = match[2].replace(/\s/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    setPhotoHeaders(res, mimeType, buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('servePhoto error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function deletePhoto(req: AuthenticatedRequest, res: Response) {
  try {
    await db.query(
      'DELETE FROM photos WHERE id = $1 AND owner_id = $2',
      [req.params.photoId, req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
