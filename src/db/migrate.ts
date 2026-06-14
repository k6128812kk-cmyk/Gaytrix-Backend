import { db, testConnection } from './pool';

// ==========================================================================
// Database migration — runs once to create all tables.
// Run with: npm run db:migrate
// Safe to re-run (uses IF NOT EXISTS).
// ==========================================================================

async function migrate() {
  await testConnection();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // ------------------------------------------------------------------
    // Users table — one row per real Telegram account
    // telegramId is the immutable unique key — one account = one profile
    // ------------------------------------------------------------------
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
        reports_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    // ------------------------------------------------------------------
    // Verification requests — selfie URLs stored here, never on users table
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // User reports
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // User blocks
    // ------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blocker_id, blocked_id)
      )
    `);

    // ------------------------------------------------------------------
    // Conversations and messages
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Admin audit log
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Map locations
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Sessions (JWT revocation list for banned users)
    // ------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS revoked_sessions (
        telegram_id BIGINT PRIMARY KEY,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ------------------------------------------------------------------
    // Photos — stored as base64 data URLs in DB (no filesystem dependency)
    // ------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_id)`);

    // Indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_requests(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON user_reports(status)`);

    await client.query('COMMIT');
    console.log('✅ Migration complete — all tables created');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

migrate();

// Run additional migrations for role system update
async function migrateRoles() {
  const { db } = await import('./pool');
  // Rename super_admin to admin
  await db.query(`UPDATE users SET admin_role = 'admin' WHERE admin_role = 'super_admin'`);
  console.log('✅ Role migration: super_admin → admin complete');
}
