#!/usr/bin/env node

/**
 * Check database for unmatched records with the specific caller ID
 * to see how they're actually stored
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST,
  port: process.env.POSTGRES_PORT || process.env.DB_PORT || 5432,
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const targetCallerId = '(727) 804-3296';
const targetDate1 = '2025-12-16T11:30:00';
const targetDate2 = '2025-12-16T11:28:00';

async function checkDatabase() {
  try {
    console.log('='.repeat(70));
    console.log('CHECKING DATABASE FOR UNMATCHED RECORDS');
    console.log('='.repeat(70));
    console.log(`Target Caller ID: "${targetCallerId}"`);
    console.log(`Target Dates: "${targetDate1}" and "${targetDate2}"`);
    console.log('');

    // Find all records with this caller ID
    const query = `
      SELECT 
        id,
        caller_id,
        date_of_call,
        unmatched,
        adjustment_amount,
        adjustment_time,
        category,
        payout,
        LENGTH(caller_id) as caller_id_length,
        LENGTH(date_of_call) as date_length,
        created_at,
        updated_at
      FROM elocal_call_data
      WHERE caller_id LIKE '%727%804%3296%'
         OR caller_id = $1
         OR caller_id = TRIM($1)
      ORDER BY date_of_call, created_at
    `;

    const result = await pool.query(query, [targetCallerId]);

    console.log(`Found ${result.rows.length} record(s) with this caller ID\n`);

    if (result.rows.length === 0) {
      console.log('No records found. Trying broader search...');
      const broadQuery = `
        SELECT 
          id,
          caller_id,
          date_of_call,
          unmatched,
          adjustment_amount,
          category
        FROM elocal_call_data
        WHERE date_of_call LIKE '%2025-12-16%11:3%'
           OR date_of_call LIKE '%2025-12-16%11:2%'
        ORDER BY date_of_call
        LIMIT 20
      `;
      const broadResult = await pool.query(broadQuery);
      console.log(`Found ${broadResult.rows.length} record(s) with similar dates\n`);
      
      if (broadResult.rows.length > 0) {
        broadResult.rows.forEach((row, i) => {
          console.log(`Record ${i+1}:`);
          console.log(`  Caller ID: "${row.caller_id}"`);
          console.log(`  Date: "${row.date_of_call}"`);
          console.log(`  Unmatched: ${row.unmatched}`);
          console.log(`  Category: ${row.category}`);
          console.log('');
        });
      }
    } else {
      result.rows.forEach((row, i) => {
        console.log(`Record ${i+1}:`);
        console.log(`  ID: ${row.id}`);
        console.log(`  Caller ID: "${row.caller_id}"`);
        console.log(`    Length: ${row.caller_id_length}`);
        console.log(`    Exact match: ${row.caller_id === targetCallerId}`);
        console.log(`    Trimmed match: ${row.caller_id.trim() === targetCallerId.trim()}`);
        console.log(`  Date of Call: "${row.date_of_call}"`);
        console.log(`    Length: ${row.date_length}`);
        console.log(`    Matches date1: ${row.date_of_call === targetDate1}`);
        console.log(`    Matches date2: ${row.date_of_call === targetDate2}`);
        console.log(`    Contains date1: ${row.date_of_call.includes('2025-12-16T11:30')}`);
        console.log(`    Contains date2: ${row.date_of_call.includes('2025-12-16T11:28')}`);
        console.log(`  Unmatched: ${row.unmatched}`);
        console.log(`  Has Adjustment: ${row.adjustment_amount != null}`);
        console.log(`  Adjustment Amount: ${row.adjustment_amount || 'NULL'}`);
        console.log(`  Adjustment Time: ${row.adjustment_time || 'NULL'}`);
        console.log(`  Category: ${row.category}`);
        console.log(`  Payout: ${row.payout}`);
        console.log(`  Created: ${row.created_at}`);
        console.log(`  Updated: ${row.updated_at}`);
        console.log('');
      });

      // Analyze matching potential
      console.log('='.repeat(70));
      console.log('MATCHING ANALYSIS');
      console.log('='.repeat(70));
      
      const recordsWithDate1 = result.rows.filter(r => 
        r.date_of_call === targetDate1 || r.date_of_call.includes('2025-12-16T11:30')
      );
      const recordsWithDate2 = result.rows.filter(r => 
        r.date_of_call === targetDate2 || r.date_of_call.includes('2025-12-16T11:28')
      );

      console.log(`Records with date1 (11:30): ${recordsWithDate1.length}`);
      recordsWithDate1.forEach(r => {
        console.log(`  - ID ${r.id}, Unmatched: ${r.unmatched}, Has Adj: ${r.adjustment_amount != null}`);
      });

      console.log(`Records with date2 (11:28): ${recordsWithDate2.length}`);
      recordsWithDate2.forEach(r => {
        console.log(`  - ID ${r.id}, Unmatched: ${r.unmatched}, Has Adj: ${r.adjustment_amount != null}`);
      });

      console.log('');

      // Check if they could match
      if (recordsWithDate1.length > 0 && recordsWithDate2.length > 0) {
        console.log('Potential Matching Scenarios:');
        recordsWithDate1.forEach(r1 => {
          recordsWithDate2.forEach(r2 => {
            const callerMatch = r1.caller_id.trim() === r2.caller_id.trim();
            const timeDiff = Math.abs(
              new Date(r1.date_of_call).getTime() - new Date(r2.date_of_call).getTime()
            ) / 60000;
            
            console.log(`  Record ${r1.id} (${r1.date_of_call}) <-> Record ${r2.id} (${r2.date_of_call})`);
            console.log(`    Caller ID match: ${callerMatch}`);
            console.log(`    Time diff: ${timeDiff.toFixed(2)} minutes`);
            console.log(`    Within window: ${timeDiff <= 30}`);
            console.log(`    r1 unmatched: ${r1.unmatched}, r2 unmatched: ${r2.unmatched}`);
            console.log(`    r1 has adj: ${r1.adjustment_amount != null}, r2 has adj: ${r2.adjustment_amount != null}`);
            
            if (callerMatch && timeDiff <= 30) {
              if (r1.unmatched && r2.adjustment_amount != null) {
                console.log(`    ⚠️  r1 is unmatched but r2 has adjustment - should match!`);
              } else if (r2.unmatched && r1.adjustment_amount != null) {
                console.log(`    ⚠️  r2 is unmatched but r1 has adjustment - should match!`);
              } else if (r1.unmatched && r2.unmatched) {
                console.log(`    ⚠️  Both unmatched - one should have matched the other!`);
              }
            }
            console.log('');
          });
        });
      }
    }

    // Check adjustment_details table
    console.log('='.repeat(70));
    console.log('CHECKING ADJUSTMENT_DETAILS TABLE');
    console.log('='.repeat(70));
    
    const adjQuery = `
      SELECT 
        id,
        caller_id,
        time_of_call,
        amount,
        adjustment_time,
        LENGTH(caller_id) as caller_id_length,
        LENGTH(time_of_call) as time_length,
        created_at
      FROM adjustment_details
      WHERE caller_id LIKE '%727%804%3296%'
         OR caller_id = $1
         OR caller_id = TRIM($1)
      ORDER BY time_of_call
    `;

    const adjResult = await pool.query(adjQuery, [targetCallerId]);
    console.log(`Found ${adjResult.rows.length} adjustment(s) with this caller ID\n`);

    adjResult.rows.forEach((row, i) => {
      console.log(`Adjustment ${i+1}:`);
      console.log(`  ID: ${row.id}`);
      console.log(`  Caller ID: "${row.caller_id}"`);
      console.log(`    Length: ${row.caller_id_length}`);
      console.log(`  Time of Call: "${row.time_of_call}"`);
      console.log(`    Length: ${row.time_length}`);
      console.log(`    Contains date1: ${row.time_of_call.includes('2025-12-16T11:30')}`);
      console.log(`    Contains date2: ${row.time_of_call.includes('2025-12-16T11:28')}`);
      console.log(`  Amount: ${row.amount}`);
      console.log(`  Adjustment Time: ${row.adjustment_time}`);
      console.log(`  Created: ${row.created_at}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkDatabase();



