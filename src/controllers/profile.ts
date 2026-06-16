import { Response } from 'express';
import { db } from '../db/pool';
import { AuthenticatedRequest } from '../middleware/auth';

// ==========================================================================
// Profile controller — get and update the authenticated user's own profile.
// Includes gender identity, orientation, and interested_in fields.
// Online status respects hide_online_status privacy setting.
// ==========================================================================

function formatUser(row: Record<string, unknown>, hideOnline = false) {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    telegramUsername: row.telegram_username,
    displayName: row.display_name,
    bio: row.bio,
    age: row.age,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    country: row.country,
    city: row.city,
    nationality: row.nationality,
    relationshipStatus: row.relationship_status,
    lookingFor: row.looking_for,
    languages: row.languages,
    interests: row.interests,
    occupation: row.occupation,
    photos: row.photos,
    lastActiveAt: row.last_active_at,
    // Apply privacy: if hideOnline is true (viewing another user's profile) respect their setting
    isOnline: hideOnline ? false : (row.hide_online_status ? false : row.is_online),
    verification: row.verification_status,
    membership: row.membership_tier,
    adminRole: row.admin_role,
    accountStatus: row.account_status,
    registeredAt: row.registered_at,
    reportsCount: row.reports_count,
    genderIdentity: row.gender_identity,
    interestedIn: row.interested_in,
    orientation: row.orientation,
    languagePreference: row.language_preference,
    privacy: {
      hideExactLocation: row.hide_exact_location,
      invisibleMode: row.invisible_mode,
      hideOnlineStatus: row.hide_online_status,
      privateProfile: row.private_profile,
    },
    registrationComplete: row.registration_complete,
  };
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user!.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    // For your own profile, show actual online status
    res.json(formatUser(result.rows[0], false));
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateMe(req: AuthenticatedRequest, res: Response) {
  const {
    displayName, bio, age, heightCm, weightKg, country, city, nationality,
    relationshipStatus, lookingFor, languages, interests, occupation, photos,
    privacy, genderIdentity, interestedIn, orientation, languagePreference,
  } = req.body;

  if (age !== undefined && (isNaN(age) || age < 18)) {
    return res.status(400).json({ error: 'Must be 18 or older' });
  }

  try {
    const result = await db.query(
      `UPDATE users SET
        display_name = COALESCE($1, display_name),
        bio = COALESCE($2, bio),
        age = COALESCE($3, age),
        height_cm = COALESCE($4, height_cm),
        weight_kg = COALESCE($5, weight_kg),
        country = COALESCE($6, country),
        city = COALESCE($7, city),
        nationality = COALESCE($8, nationality),
        relationship_status = COALESCE($9, relationship_status),
        looking_for = COALESCE($10, looking_for),
        languages = COALESCE($11, languages),
        interests = COALESCE($12, interests),
        occupation = COALESCE($13, occupation),
        photos = COALESCE($14, photos),
        hide_exact_location = COALESCE($15, hide_exact_location),
        invisible_mode = COALESCE($16, invisible_mode),
        hide_online_status = COALESCE($17, hide_online_status),
        private_profile = COALESCE($18, private_profile),
        gender_identity = COALESCE($19, gender_identity),
        interested_in = COALESCE($20, interested_in),
        orientation = COALESCE($21, orientation),
        language_preference = COALESCE($22, language_preference)
      WHERE id = $23
      RETURNING *`,
      [
        displayName || null,
        bio || null,
        age || null,
        heightCm || null,
        weightKg || null,
        country || null,
        city || null,
        nationality || null,
        relationshipStatus || null,
        lookingFor ?? null,
        languages ?? null,
        interests ?? null,
        occupation || null,
        photos ?? null,
        privacy?.hideExactLocation ?? null,
        privacy?.invisibleMode ?? null,
        privacy?.hideOnlineStatus ?? null,
        privacy?.privateProfile ?? null,
        genderIdentity || null,
        interestedIn || null,
        orientation || null,
        languagePreference || null,
        req.user!.id,
      ]
    );
    res.json(formatUser(result.rows[0], false));
  } catch (err) {
    console.error('updateMe error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT u.* FROM users u
       WHERE u.id = $1
         AND u.account_status = 'active'
         AND u.invisible_mode = FALSE
         AND u.registration_complete = TRUE`,
      [req.params.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Profile not found' });

    const blockCheck = await db.query(
      `SELECT 1 FROM user_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)`,
      [req.user!.id, req.params.id]
    );
    if (blockCheck.rows.length > 0) return res.status(404).json({ error: 'Profile not found' });

    const row = result.rows[0];
    // When viewing another user's profile, respect their hide_online_status
    const profile = formatUser(row, Boolean(row.hide_online_status));
    res.json(profile);
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function reportUser(req: AuthenticatedRequest, res: Response) {
  const { reason, details } = req.body;
  if (!reason) return res.status(400).json({ error: 'Reason required' });

  try {
    await db.query(
      `INSERT INTO user_reports (reporter_id, reported_id, reason, details) VALUES ($1, $2, $3, $4)`,
      [req.user!.id, req.params.id, reason, details || null]
    );
    await db.query('UPDATE users SET reports_count = reports_count + 1 WHERE id = $1', [req.params.id]);

    // Notify admins about the report
    const reportedInfo = await db.query(
      `SELECT telegram_id, telegram_username FROM users WHERE id = $1`, [req.params.id]
    );
    if (reportedInfo.rows[0]) {
      const { notifyAdmins } = await import('../bot/bot');
      notifyAdmins('user_report', {
        userId: req.params.id,
        telegramId: reportedInfo.rows[0].telegram_id,
        telegramUsername: reportedInfo.rows[0].telegram_username,
        details: `Reason: ${reason}${details ? ` — ${details}` : ''}`,
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('reportUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getBlockedUsers(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await db.query(
      `SELECT u.id, u.display_name, u.photos, u.telegram_username
       FROM user_blocks b JOIN users u ON b.blocked_id = u.id
       WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [req.user!.id]
    );
    res.json(result.rows.map(row => ({
      id: row.id, displayName: row.display_name,
      photos: row.photos, telegramUsername: row.telegram_username,
    })));
  } catch (err) {
    console.error('getBlockedUsers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function blockUser(req: AuthenticatedRequest, res: Response) {
  try {
    await db.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user!.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('blockUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function unblockUser(req: AuthenticatedRequest, res: Response) {
  try {
    await db.query(
      `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [req.user!.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('unblockUser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ==========================================================================
// completeRegistration — atomically saves the final onboarding data and
// sets registration_complete = TRUE in a single transaction.
//
// Rules (enforced server-side, never bypassed by client):
//   • displayName must be a non-empty string (after trim)
//   • photos array must contain at least one entry
//   • If either check fails the profile is NOT marked complete and the
//     user remains invisible to other users in the feed and on profiles.
//   • This is the ONLY endpoint that sets registration_complete = TRUE.
//     updateMe() intentionally cannot flip this flag.
// ==========================================================================
export async function completeRegistration(req: AuthenticatedRequest, res: Response) {
  const {
    displayName, photos, age, city, relationshipStatus,
    lookingFor, bio,
  } = req.body;

  // Server-side validation — never trust the client alone
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  const photoList: string[] = Array.isArray(photos) ? photos.filter(Boolean) : [];

  if (!name) {
    return res.status(400).json({ error: 'A display name is required to complete registration.' });
  }
  if (photoList.length === 0) {
    return res.status(400).json({ error: 'At least one profile photo is required to complete registration.' });
  }
  // Reject blob: URLs — these are temporary Android/browser object URLs
  // that only exist locally and mean the upload hasn't finished yet.
  const invalidPhotos = photoList.filter((u) => !u.startsWith('http'));
  if (invalidPhotos.length > 0) {
    return res.status(400).json({ error: 'Photo upload is still in progress. Please wait a moment and try again.' });
  }
  if (age !== undefined && (isNaN(Number(age)) || Number(age) < 18)) {
    return res.status(400).json({ error: 'Must be 18 or older.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE users SET
        display_name      = $1,
        photos            = $2,
        age               = COALESCE($3, age),
        city              = COALESCE($4, city),
        relationship_status = COALESCE($5, relationship_status),
        looking_for       = COALESCE($6, looking_for),
        bio               = COALESCE($7, bio),
        registration_complete = TRUE
       WHERE id = $8
       RETURNING *`,
      [
        name,
        photoList,
        age ? Number(age) : null,
        city?.trim() || null,
        relationshipStatus || null,
        lookingFor ?? null,
        bio?.trim() || null,
        req.user!.id,
      ]
    );

    await client.query('COMMIT');
    res.json(formatUser(result.rows[0], false));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('completeRegistration error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
}
