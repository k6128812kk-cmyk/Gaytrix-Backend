import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Map controller — community location pins.
// New submissions have status='pending' until approved by an admin.
// Approved (status='approved') locations are visible to all users.
// ==========================================================================

function formatLocation(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lng),
    upvotes: parseInt(row.upvotes ?? 0),
    reportsCount: parseInt(row.reports_count ?? 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    status: row.status,
  };
}

export async function getLocations(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT * FROM map_locations
       WHERE status = 'approved'
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(result.rows.map(formatLocation));
  } catch (err) {
    console.error('getLocations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createLocation(req: AuthenticatedRequest, res: Response) {
  const { name, description, category, lat, lng } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (!description?.trim()) return res.status(400).json({ error: 'Description required' });
  if (!category) return res.status(400).json({ error: 'Category required' });
  if (lat == null || lng == null) return res.status(400).json({ error: 'Location coordinates required' });
  if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    // Check if user is admin — admins get auto-approved
    const userResult = await db.query(
      'SELECT admin_role FROM users WHERE id = $1', [req.user!.id]
    );
    const isAdmin = ['admin', 'super_admin'].includes(userResult.rows[0]?.admin_role);

    const result = await db.query(
      `INSERT INTO map_locations (name, description, category, lat, lng, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        description.trim(),
        category,
        parseFloat(lat),
        parseFloat(lng),
        req.user!.id,
        isAdmin ? 'approved' : 'pending',
      ]
    );

    res.status(201).json(formatLocation(result.rows[0]));
  } catch (err) {
    console.error('createLocation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function upvoteLocation(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `UPDATE map_locations SET upvotes = upvotes + 1
       WHERE id = $1 RETURNING upvotes`,
      [req.params.locationId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Location not found' });
    res.json({ upvotes: parseInt(result.rows[0].upvotes) });
  } catch (err) {
    console.error('upvoteLocation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function reportLocation(req: AuthenticatedRequest, res: Response) {
  try {
    await db.query(
      `UPDATE map_locations SET reports_count = reports_count + 1
       WHERE id = $1`,
      [req.params.locationId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('reportLocation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
