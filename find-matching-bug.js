#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';
import { getCategoryFromTargetId } from './src/http/ringba-target-calls.js';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const toE164 = (raw) => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return raw;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.length > 0 ? `+${digits}` : null;
};

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    return new Date(dateStr);
  } catch {
    return null;
  }
};

const timeDiffMinutes = (date1, date2) => {
  if (!date1 || !date2) return Infinity;
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

// Simulate the exact matchCall function
const matchCall = (ringbaCall, elocalCall, windowMinutes = 120) => {
  const elocalDate = parseDate(elocalCall.date_of_call);
  const ringbaDate = parseDate(ringbaCall.callDt);
  
  if (!elocalDate || !ringbaDate) {
    return null;
  }
  
  const elocalDateStr = elocalDate.toISOString().split('T')[0];
  const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
  const elocalDateOnly = new Date(elocalDateStr);
  const ringbaDateOnly = new Date(ringbaDateStr);
  const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > 1) {
    return null;
  }
  
  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
  const effectiveWindow = daysDiff === 0 ? windowMinutes : (24 * 60);
  
  if (timeDiff > effectiveWindow) {
    return null;
  }
  
  return { matchScore: timeDiff, timeDiff, elocalCall, ringbaCall };
};

async function findBug() {
  const client = await pool.connect();
  try {
    const date = '2025-12-02';
    
    // Get one specific unmatched call from the analysis
    const ringbaQuery = `
      SELECT 
        inbound_call_id, call_date_time, caller_id, caller_id_e164,
        payout_amount, revenue_amount, target_id
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = $1
        AND inbound_call_id = 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01'
    `;
    const ringbaResult = await client.query(ringbaQuery, [date]);
    
    if (ringbaResult.rows.length === 0) {
      console.log('Ringba call not found');
      return;
    }
    
    const ringbaCallRow = ringbaResult.rows[0];
    const ringbaCategory = getCategoryFromTargetId(ringbaCallRow.target_id);
    const callerE164 = ringbaCallRow.caller_id_e164 || toE164(ringbaCallRow.caller_id);
    
    // Get the eLocal call that should match
    const elocalQuery = `
      SELECT 
        id, caller_id, date_of_call, category, payout,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = $1
        AND id = 799
    `;
    const elocalResult = await client.query(elocalQuery, [date]);
    
    if (elocalResult.rows.length === 0) {
      console.log('eLocal call not found');
      return;
    }
    
    const elocalCall = elocalResult.rows[0];
    
    // Structure the ringbaCall as it would be in the service
    const ringbaCall = {
      inboundCallId: ringbaCallRow.inbound_call_id,
      callDt: ringbaCallRow.call_date_time, // This is what matchCall expects
      callerId: ringbaCallRow.caller_id,
      callerIdE164: ringbaCallRow.caller_id_e164,
      payout: parseFloat(ringbaCallRow.payout_amount),
      revenue: parseFloat(ringbaCallRow.revenue_amount),
      targetId: ringbaCallRow.target_id
    };
    
    console.log('Testing matchCall function:');
    console.log(`Ringba Call: ${ringbaCall.inboundCallId}`);
    console.log(`  callDt: ${ringbaCall.callDt}`);
    console.log(`  Category: ${ringbaCategory}`);
    console.log(`  Caller: ${callerE164}`);
    console.log(`  Payout: $${ringbaCall.payout}`);
    console.log(`\neLocal Call: ${elocalCall.id}`);
    console.log(`  date_of_call: ${elocalCall.date_of_call}`);
    console.log(`  Category: ${elocalCall.category}`);
    console.log(`  Caller: ${elocalCall.caller_id}`);
    console.log(`  Payout: $${elocalCall.payout}`);
    console.log(`  original_payout: ${elocalCall.original_payout}`);
    console.log(`  ringba_inbound_call_id: ${elocalCall.ringba_inbound_call_id}`);
    
    const match = matchCall(ringbaCall, elocalCall);
    if (match) {
      console.log(`\n✅ MATCH FOUND!`);
      console.log(`  Time diff: ${match.timeDiff.toFixed(1)} minutes`);
      console.log(`  Match score: ${match.matchScore.toFixed(2)}`);
    } else {
      console.log(`\n❌ NO MATCH - This is the bug!`);
      console.log(`  Let's debug why...`);
      
      const elocalDate = parseDate(elocalCall.date_of_call);
      const ringbaDate = parseDate(ringbaCall.callDt);
      console.log(`  Parsed elocalDate: ${elocalDate ? elocalDate.toISOString() : 'NULL'}`);
      console.log(`  Parsed ringbaDate: ${ringbaDate ? ringbaDate.toISOString() : 'NULL'}`);
      
      if (elocalDate && ringbaDate) {
        const elocalTimeOnly = new Date(elocalDate);
        elocalTimeOnly.setSeconds(0, 0);
        const ringbaTimeOnly = new Date(ringbaDate);
        ringbaTimeOnly.setSeconds(0, 0);
        const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
        console.log(`  Time diff: ${timeDiff.toFixed(1)} minutes`);
        console.log(`  Window: 120 minutes`);
        console.log(`  Should match: ${timeDiff <= 120 ? 'YES' : 'NO'}`);
      }
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

findBug().catch(console.error);


