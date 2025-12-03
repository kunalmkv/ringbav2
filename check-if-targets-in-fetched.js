#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';
import { syncRingbaOriginalPayout } from './src/services/ringba-original-sync.js';

dotenv.config();

const buildConfig = () => {
  return {
    dbHost: process.env.POSTGRES_HOST || process.env.DB_HOST,
    dbPort: process.env.POSTGRES_PORT || process.env.DB_PORT || 5432,
    dbName: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    dbUser: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    dbPassword: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
    dbSsl: process.env.DB_SSL === 'true',
    ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
    ringbaApiToken: process.env.RINGBA_API_TOKEN
  };
};

// Check the database to see which calls were recently updated

async function checkAfterRun() {
  const config = buildConfig();
  const { Pool } = pg;
  const pool = new Pool({
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbName,
    user: config.dbUser,
    password: config.dbPassword,
    ssl: config.dbSsl ? { rejectUnauthorized: false } : false
  });
  
  const client = await pool.connect();
  try {
    // Check all Ringba calls fetched in the last few minutes (recently updated)
    const recentCalls = await client.query(`
      SELECT inbound_call_id, call_date_time, updated_at
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = '2025-12-02'
        AND updated_at > NOW() - INTERVAL '5 minutes'
      ORDER BY updated_at DESC
      LIMIT 60
    `);
    
    console.log(`Recently updated calls (last 5 minutes): ${recentCalls.rows.length}`);
    
    const target1 = 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01';
    const target2 = 'RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01';
    
    const found1 = recentCalls.rows.some(r => r.inbound_call_id === target1);
    const found2 = recentCalls.rows.some(r => r.inbound_call_id === target2);
    
    console.log(`\nTarget 1 (${target1.substring(0, 20)}...): ${found1 ? '✅ Found in recent updates' : '❌ NOT in recent updates'}`);
    console.log(`Target 2 (${target2.substring(0, 20)}...): ${found2 ? '✅ Found in recent updates' : '❌ NOT in recent updates'}`);
    
    if (!found1 || !found2) {
      console.log(`\n⚠️  The target calls were NOT updated in the last run, meaning they were NOT fetched from the API.`);
      console.log(`This suggests they're not in the API response for the date range being queried.`);
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkAfterRun().catch(console.error);

