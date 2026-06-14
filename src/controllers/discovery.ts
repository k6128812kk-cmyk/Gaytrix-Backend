import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Discovery controller — returns REAL users from the database.
// Supports gender/orientation matching preferences.
// ==========================================================================

function formatDiscoveryUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    displayName: row.display_name,
    photos: row.photos,
    age: row.age,
    country: row.country,
    city: row.city,
    relationshipStatus: row.relationship_status,
    lookingFor: row.looking_for,
    bio: row.bio,
    languages: row.languages,
    interests: row.interests,
    occupation: row.occupation,
    lastActiveAt: row.last_active_at,
    // Respect hide_online_status
    isOnline: row.hide_online_status ? false : row.is_online,
    verification: row.verification_status,
    membership: row.membership_tier,
    adminRole: row.admin_role,
    accountStatus: row.account_status,
    genderIdentity: row.gender_identity,
    interestedIn: row.interested_in,
    orientation: row.orientation,
    privacy: {
      hideExactLocation: row.hide_exact_location,
      invisibleMode: row.invisible_mode,
      hideOnlineStatus: row.hide_online_status,
    },
  };
}

export async function getNearby(req: AuthenticatedRequest, res: Response) {
  const {
    ageMin = 18, ageMax = 99,
    verifiedOnly = false, onlineOnly = false,
    country, city, page = 1,
    genderIdentity, interestedIn,
  } = req.query;

  const limit = 20;
  const offset = (Number(page) - 1) * limit;

  try {
    // Get the requesting user's preferences for mutual matching
    const meRes = await db.query(
      'SELECT interested_in, gender_identity FROM users WHERE id = $1', [req.user!.id]
    );
    const myInterestedIn = (interestedIn as string) || meRes.rows[0]?.interested_in || 'everyone';
    const myGender = meRes.rows[0]?.gender_identity || '';

    const result = await db.query(
      `SELECT u.*
       FROM users u
       WHERE u.id != $1
         AND u.account_status = 'active'
         AND u.invisible_mode = FALSE
         AND (u.age IS NULL OR (u.age >= $2 AND u.age <= $3))
         AND ($4::boolean = FALSE OR u.verification_status = 'verified')
         AND ($5::boolean = FALSE OR (u.is_online = TRUE AND u.hide_online_status = FALSE))
         AND ($6::text IS NULL OR u.country = $6)
         AND ($7::text IS NULL OR u.city = $7)
         -- Filter by gender if requested/preference set
         AND ($8::text = 'everyone' OR $8::text = '' OR u.gender_identity = $8 OR u.gender_identity = '')
         -- Exclude blocked users (both directions)
         AND u.id NOT IN (
           SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           UNION
           SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
         )
       ORDER BY
         -- Mutual interest match first
         CASE WHEN ($9::text != 'everyone' AND $9::text != '' AND u.interested_in != 'everyone' AND u.interested_in = $9) THEN 0 ELSE 1 END,
         -- Verified users next
         CASE WHEN u.verification_status = 'verified' THEN 0 ELSE 1 END,
         CASE WHEN u.membership_tier = 'premium' THEN 0 ELSE 1 END,
         u.last_active_at DESC
       LIMIT $10 OFFSET $11`,
      [
        req.user!.id,
        Number(ageMin), Number(ageMax),
        verifiedOnly === 'true',
        onlineOnly === 'true',
        country || null,
        city || null,
        (genderIdentity as string) || myInterestedIn,
        myGender,
        limit, offset,
      ]
    );

    res.json(result.rows.map(formatDiscoveryUser));
  } catch (err) {
    console.error('getNearby error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getExplore(req: AuthenticatedRequest, res: Response) {
  const { section } = req.params;

  let orderBy = 'u.last_active_at DESC';
  let extraWhere = '';

  switch (section) {
    case 'trending':
      orderBy = 'u.reports_count ASC, u.last_active_at DESC';
      extraWhere = `AND u.membership_tier = 'premium'`;
      break;
    case 'new':
      orderBy = 'u.registered_at DESC';
      break;
    case 'verified':
      extraWhere = `AND u.verification_status = 'verified'`;
      orderBy = 'u.last_active_at DESC';
      break;
    case 'recent':
      // Only show people who are not hiding their online status
      extraWhere = `AND u.is_online = TRUE AND u.hide_online_status = FALSE`;
      orderBy = 'u.last_active_at DESC';
      break;
  }

  try {
    const result = await db.query(
      `SELECT u.* FROM users u
       WHERE u.id != $1
         AND u.account_status = 'active'
         AND u.invisible_mode = FALSE
         ${extraWhere}
         AND u.id NOT IN (
           SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           UNION
           SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
         )
       ORDER BY ${orderBy}
       LIMIT 10`,
      [req.user!.id]
    );
    res.json(result.rows.map(formatDiscoveryUser));
  } catch (err) {
    console.error('getExplore error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
