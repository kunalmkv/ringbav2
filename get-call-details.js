#!/usr/bin/env node

/**
 * Get detailed information for the 3 retried calls
 */

import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// eLocal Call IDs that were retried
const elocalCallIds = [1995, 2346, 3184];

async function getCallDetails() {
    const pool = new Pool({
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        user: process.env.POSTGRES_USER_NAME,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB_NAME
    });

    try {
        console.log('======================================================================');
        console.log('Call Details for Retried Calls');
        console.log('======================================================================\n');

        const query = `
      SELECT 
        id as elocal_call_id,
        caller_id,
        date_of_call,
        total_duration,
        screen_duration,
        post_screen_duration,
        payout,
        original_payout,
        original_revenue,
        category,
        city_state,
        zip_code,
        assessment,
        classification,
        ringba_inbound_call_id,
        created_at
      FROM elocal_call_data
      WHERE id = ANY($1)
      ORDER BY id;
    `;

        const result = await pool.query(query, [elocalCallIds]);

        if (result.rows.length === 0) {
            console.log('No calls found.');
            return;
        }

        result.rows.forEach((call, index) => {
            console.log(`Call ${index + 1}:`);
            console.log(`  eLocal Call ID: ${call.elocal_call_id}`);
            console.log(`  Ringba Call ID: ${call.ringba_inbound_call_id}`);
            console.log(`  Caller ID: ${call.caller_id}`);
            console.log(`  Call Date: ${call.date_of_call}`);
            console.log(`  Call Duration: ${call.call_duration} seconds`);
            console.log(`  Payout: $${call.payout}`);
            console.log(`  Revenue: $${call.revenue}`);
            console.log(`  Category: ${call.category}`);
            console.log(`  Created At: ${call.created_at}`);
            console.log('');
        });

        console.log('======================================================================');
        console.log(`Total Calls: ${result.rows.length}`);
        console.log('======================================================================\n');

    } catch (error) {
        console.error('Error fetching call details:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

getCallDetails();
