import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Discovery controller — filters apply to ALL sections.
// showMe: 'men' = gender_identity=male, 'women' = female,
//         'gay' = orientation=gay, 'everyone' = no filter
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

// Build filter params from query
function buildFilters(q: Record<string, unknown>) {
  const showMe = (q.showMe as string) || '';
  const orientation = (q.orientation as string) || '';

  // showMe translates to gender/orientation filter
  let genderFilter = (q.genderIdentity as string) || '';
  let orientationFilter = orientation;

  if (showMe === 'men') genderFilter = 'male';
  else if (showMe === 'women') genderFilter = 'female';
  else if (showMe === 'gay') { orientationFilter = 'gay'; genderFilter = ''; }
  else if (showMe === 'everyone') { genderFilter = ''; orientationFilter = ''; }

  return {
    ageMin: Number(q.ageMin ?? 18),
    ageMax: Number(q.ageMax ?? 99),
    verifiedOnly: q.verifiedOnly === 'true' || q.verifiedOnly === true,
    onlineOnly: q.onlineOnly === 'true' || q.onlineOnly === true,
    country: (q.country as string) || null,
    city: (q.city as string) || null,
    genderFilter,
    orientationFilter,
  };
}

// Build the shared WHERE clause for filters
function filterWhere(f: ReturnType<typeof buildFilters>) {
  return {
    sql: `
      AND (u.age IS NULL OR (u.age >= $2 AND u.age <= $3))
      AND ($4::boolean = FALSE OR u.verification_status = 'verified')
      AND ($5::boolean = FALSE OR (u.is_online = TRUE AND u.hide_online_status = FALSE))
      AND ($6::text IS NULL OR u.country = $6)
      AND ($7::text IS NULL OR u.city = $7)
      AND ($8::text = '' OR u.gender_identity = $8 OR u.gender_identity = '')
      AND ($9::text = '' OR u.orientation = $9)
    `,
    params: [f.ageMin, f.ageMax, f.verifiedOnly, f.onlineOnly,
             f.country, f.city, f.genderFilter, f.orientationFilter],
  };
}

export async function getNearby(req: AuthenticatedRequest, res: Response) {
  const { page = 1, ...rest } = req.query;
  const f = buildFilters(rest);
  const { sql, params } = filterWhere(f);
  const limit = 20;
  const offset = (Number(page) - 1) * limit;

  try {
    const meRes = await db.query(
      'SELECT interested_in, gender_identity FROM users WHERE id = $1', [req.user!.id]
    );
    const myGender = meRes.rows[0]?.gender_identity || '';

    const result = await db.query(
      `SELECT u.* FROM users u
       WHERE u.id != $1
         AND u.account_status = 'active'
         AND u.invisible_mode = FALSE
         ${sql}
         AND u.id NOT IN (
           SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
         )
       ORDER BY
         CASE WHEN u.verification_status = 'verified' THEN 0 ELSE 1 END,
         CASE WHEN u.membership_tier = 'premium' THEN 0 ELSE 1 END,
         u.last_active_at DESC
       LIMIT $10 OFFSET $11`,
      [req.user!.id, ...params, limit, offset]
    );

    res.json(result.rows.map(formatDiscoveryUser));
  } catch (err) {
    console.error('getNearby error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getExplore(req: AuthenticatedRequest, res: Response) {
  const { section } = req.params;
  const f = buildFilters(req.query);
  const { sql, params } = filterWhere(f);

  let sectionWhere = '';
  let orderBy = 'u.last_active_at DESC';

  switch (section) {
    case 'new':
      orderBy = 'u.registered_at DESC';
      break;
    case 'verified':
      sectionWhere = `AND u.verification_status = 'verified'`;
      break;
    case 'recent':
      sectionWhere = `AND u.is_online = TRUE AND u.hide_online_status = FALSE`;
      break;
  }

  try {
    const result = await db.query(
      `SELECT u.* FROM users u
       WHERE u.id != $1
         AND u.account_status = 'active'
         AND u.invisible_mode = FALSE
         ${sql}
         ${sectionWhere}
         AND u.id NOT IN (
           SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
         )
       ORDER BY ${orderBy}
       LIMIT 20`,
      [req.user!.id, ...params]
    );
    res.json(result.rows.map(formatDiscoveryUser));
  } catch (err) {
    console.error('getExplore error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
