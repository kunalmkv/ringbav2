#!/usr/bin/env node

// Migration script to add webhook_requests table for storing webhook test requests

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

const createWebhookRequestsTable = async () => {
  const client = await pool.connect();
  try {
    console.log('[Migration] Creating webhook_requests table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_requests (
        id SERIAL PRIMARY KEY,
        webhook_id VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        request_body JSONB,
        headers JSONB,
        query_params JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('[Migration] Creating indexes...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_requests_webhook_id ON webhook_requests(webhook_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_requests_created_at ON webhook_requests(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_webhook_requests_method ON webhook_requests(method);
    `);
    
    console.log('[Migration] ✅ webhook_requests table created successfully!');
    
    // Check if there's existing data
    const result = await client.query('SELECT COUNT(*) as count FROM webhook_requests');
    console.log(`[Migration] Current records in webhook_requests: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('[Migration] ❌ Error creating webhook_requests table:', error);
    throw error;
  } finally {
    client.release();
  }
};

const main = async () => {
  try {
    await createWebhookRequestsTable();
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
