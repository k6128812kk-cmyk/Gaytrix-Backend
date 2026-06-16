import { Request, Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';
import { v4 as uuid } from 'uuid';

// ==========================================================================
// Photo controller — stores photos as base64 DATA URLs in PostgreSQL.
// This avoids Railway's ephemeral filesystem entirely.
// Photos are served back as data: URIs — no separate file server needed.
// Max photo size: 5MB per photo (base64 ~6.67MB stored)
// ==========================================================================

export async function uploadPhoto(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const mimeType = req.file.mimetype;
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const photoId = uuid();

    // Store in DB
    await db.query(
      `INSERT INTO photos (id, owner_id, data_url, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [photoId, req.user!.id, dataUrl]
    );

    // Return a permanent URL that the frontend can use to retrieve this photo
    const host = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${host}/v1/photos/${photoId}` });
  } catch (err) {
    console.error('uploadPhoto error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
}

export async function servePhoto(req: Request, res: Response) {
  try {
    const result = await db.query(
      'SELECT data_url FROM photos WHERE id = $1',
      [req.params.photoId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Photo not found' });

    const dataUrl: string = result.rows[0].data_url;
    // Parse "data:image/jpeg;base64,<data>"
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(500).json({ error: 'Invalid photo data' });

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    res.set({
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': buffer.length.toString(),
    });
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
