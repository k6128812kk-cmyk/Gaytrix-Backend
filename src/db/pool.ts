import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function testConnection() {
  const client = await db.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('✅ Database connected');
}