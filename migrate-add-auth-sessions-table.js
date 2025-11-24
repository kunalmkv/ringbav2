#!/usr/bin/env node

// Migration script to add auth_sessions table for PostgreSQL-based session storage

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const createAuthSessionsTable = async () => {
  const client = await pool.connect();
  try {
    console.log('[Migration] Creating auth_sessions table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id SERIAL PRIMARY KEY,
        cookie_header TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_working BOOLEAN DEFAULT TRUE,
        last_checked TIMESTAMP,
        last_error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checked_count INTEGER DEFAULT 0
      );
    `);
    
    console.log('[Migration] Creating indexes...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_is_working ON auth_sessions(is_working);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_last_checked ON auth_sessions(last_checked);
    `);
    
    console.log('[Migration] ✅ auth_sessions table created successfully!');
    
    // Check if there's existing data
    const result = await client.query('SELECT COUNT(*) as count FROM auth_sessions');
    console.log(`[Migration] Current records in auth_sessions: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('[Migration] ❌ Error creating auth_sessions table:', error);
    throw error;
  } finally {
    client.release();
  }
};

const main = async () => {
  try {
    await createAuthSessionsTable();
    await pool.end();
    console.log('[Migration] ✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
};

main();

