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

async function test() {
  try {
    // Test the exact query that works
    const result1 = await pool.query(`
      SELECT rcs.*
      FROM public.ringba_campaign_summary AS rcs
      WHERE rcs.summary_date = '2025-11-20'
    `);
    
    console.log('Query 1 (exact match):');
    console.log(`Found ${result1.rows.length} records`);
    result1.rows.forEach(row => {
      console.log(`  Campaign: '${row.campaign_name}', Date: ${row.summary_date}, RPC: $${row.rpc}`);
    });
    
    // Test with date filter
    const result2 = await pool.query(`
      SELECT 
        summary_date::text as date,
        rpc,
        campaign_name
      FROM ringba_campaign_summary
      WHERE summary_date >= $1::date AND summary_date <= $2::date
      ORDER BY summary_date DESC
    `, ['2025-11-20', '2025-11-20']);
    
    console.log('\nQuery 2 (with date filter):');
    console.log(`Found ${result2.rows.length} records`);
    result2.rows.forEach(row => {
      console.log(`  Date: '${row.date}', Campaign: '${row.campaign_name}', RPC: $${row.rpc}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

test();

