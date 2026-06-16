import { db, testConnection } from './pool';

async function migrate() {
  await testConnection();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        telegram_id BIGINT UNIQUE NOT NULL,
        telegram_username TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        age INTEGER,
        height_cm INTEGER,
        weight_kg INTEGER,
        country TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        nationality TEXT,
        relationship_status TEXT NOT NULL DEFAULT 'single',
        looking_for TEXT[] NOT NULL DEFAULT '{}',
        languages TEXT[] NOT NULL DEFAULT '{}',
        interests TEXT[] NOT NULL DEFAULT '{}',
        occupation TEXT,
        photos TEXT[] NOT NULL DEFAULT '{}',
        last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_online BOOLEAN NOT NULL DEFAULT FALSE,
        verification_status TEXT NOT NULL DEFAULT 'none',
        membership_tier TEXT NOT NULL DEFAULT 'free',
        admin_role TEXT NOT NULL DEFAULT 'none',
        account_status TEXT NOT NULL DEFAULT 'active',
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        hide_exact_location BOOLEAN NOT NULL DEFAULT TRUE,
        invisible_mode BOOLEAN NOT NULL DEFAULT FALSE,
        hide_online_status BOOLEAN NOT NULL DEFAULT FALSE,
        private_profile BOOLEAN NOT NULL DEFAULT FALSE,
        location_lat DOUBLE PRECISION,
        location_lng DOUBLE PRECISION,
        reports_count INTEGER NOT NULL DEFAULT 0,
        gender_identity TEXT NOT NULL DEFAULT '',
        interested_in TEXT NOT NULL DEFAULT 'everyone',
        orientation TEXT NOT NULL DEFAULT '',
        language_preference TEXT NOT NULL DEFAULT 'en',
        registration_complete BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    // Add new columns to existing users table if they don't exist
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_identity TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS interested_in TEXT NOT NULL DEFAULT 'everyone'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS orientation TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status TEXT NOT NULL DEFAULT 'single'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference TEXT NOT NULL DEFAULT 'en'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_complete BOOLEAN NOT NULL DEFAULT FALSE`);

    // Backfill: any user who already has a display_name AND at least one
    // photo was registered before this column existed — mark them complete
    // so they reappear in the feed immediately after this migration runs.
    await client.query(`
      UPDATE users
      SET registration_complete = TRUE
      WHERE registration_complete = FALSE
        AND display_name IS NOT NULL
        AND display_name <> ''
        AND array_length(photos, 1) >= 1
    `);

    // Rename super_admin → admin for existing rows
    await client.query(`UPDATE users SET admin_role = 'admin' WHERE admin_role = 'super_admin'`);

    // Fix http:// photo URLs -> https:// in users.photos array.
    // Photos uploaded before the Railway proxy fix were stored with http:// URLs.
    // Android WebView blocks http:// images on https:// pages (mixed content).
    // iOS WebView is lenient and shows them anyway — that's why iOS works but Android doesn't.
    // This rewrites every http:// element in every user's photos array to https://.
    await client.query(`
      UPDATE users
      SET photos = ARRAY(
        SELECT regexp_replace(unnest(photos), '^http://', 'https://')
      )
      WHERE EXISTS (
        SELECT 1 FROM unnest(photos) AS p WHERE p LIKE 'http://%'
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        selfie_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blocker_id, blocked_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_request BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_a, user_b)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content_type TEXT NOT NULL DEFAULT 'text',
        text TEXT,
        media_url TEXT,
        duration_sec INTEGER,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID NOT NULL REFERENCES users(id),
        target_id UUID REFERENCES users(id),
        action TEXT NOT NULL,
        reason TEXT,
        performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS map_locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        upvotes INTEGER NOT NULL DEFAULT 0,
        reports_count INTEGER NOT NULL DEFAULT 0,
        created_by UUID REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Map Events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS map_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'social_meetup',
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        max_attendees INTEGER,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES conversations(id),
        status TEXT NOT NULL DEFAULT 'active',
        reports_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Event attendees
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_attendees (
        event_id UUID NOT NULL REFERENCES map_events(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (event_id, user_id)
      )
    `);

    // Event group conversations
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES map_events(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        conversation_id UUID NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (conversation_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES group_conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content_type TEXT NOT NULL DEFAULT 'text',
        text TEXT,
        media_url TEXT,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS revoked_sessions (
        telegram_id BIGINT PRIMARY KEY,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_requests(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON user_reports(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_map_events_starts ON map_events(starts_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_messages_conv ON group_messages(conversation_id, sent_at)`);

    // ── Stories ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        caption TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Add caption column if upgrading existing DB
    await client.query(`ALTER TABLE stories ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT ''`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS story_views (
        story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (story_id, viewer_id)
      )
    `);

    // ── Community Groups ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        photo_url TEXT,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_message_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'active',
        is_private BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Add is_private column if upgrading existing DB
    await client.query(`ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS community_group_members (
        group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      )
    `);
    // Add role column if upgrading existing DB
    await client.query(`ALTER TABLE community_group_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS community_group_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT,
        media_url TEXT,
        content_type TEXT NOT NULL DEFAULT 'text',
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Add media columns if upgrading existing DB
    await client.query(`ALTER TABLE community_group_messages ADD COLUMN IF NOT EXISTS media_url TEXT`);
    await client.query(`ALTER TABLE community_group_messages ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'text'`);

    // Group join requests (for private/locked groups)
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_group_join_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by UUID REFERENCES users(id),
        UNIQUE(group_id, user_id)
      )
    `);

    // Group notification mutes
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_group_mutes (
        group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        muted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      )
    `);

    // ── Per-user conversation soft-delete ───────────────────────────────
    // Tracks which user has "deleted" a conversation from their side.
    // The conversation is hidden for that user but still visible to the other.
    // When BOTH sides delete, the conversation (and messages) are physically removed.
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_deletions (
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (conversation_id, user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conv_deletions ON conversation_deletions(conversation_id)`);

    // Group message soft-delete (admins/super-admins can remove messages)
    await client.query(`ALTER TABLE community_group_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE community_group_messages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id)`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_story_views ON story_views(story_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_groups_last_msg ON community_groups(last_message_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_msgs ON community_group_messages(group_id, sent_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_join_requests ON community_group_join_requests(group_id, status)`);

    await client.query('COMMIT');
    console.log('✅ Migration complete — all tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    // NOTE: do NOT call db.end() here — pool stays open when called from index.ts
  }
}

export { migrate };

// Standalone runner: node -r tsx/cjs src/db/migrate.ts
if (require.main === module) {
  migrate().then(() => db.end()).catch((err) => { console.error(err); process.exit(1); });
}
