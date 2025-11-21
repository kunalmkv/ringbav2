#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function check() {
  try {
    const result = await pool.query(`
      SELECT campaign_name, summary_date, rpc, total_calls
      FROM ringba_campaign_summary
      WHERE summary_date = '2025-11-20'
      ORDER BY id DESC
    `);

    console.log('Campaign Summary Records for 2025-11-20:');
    if (result.rows.length === 0) {
      console.log('  No records found');
    } else {
      result.rows.forEach((row, i) => {
        console.log(`  [${i+1}] Campaign: '${row.campaign_name}', RPC: $${row.rpc}, Total Calls: ${row.total_calls}`);
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

check();

