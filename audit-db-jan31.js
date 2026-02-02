import dotenv from 'dotenv';
import { dbOps } from './src/database/postgres-operations.js';

dotenv.config();

const config = {
    dbHost: process.env.POSTGRES_HOST,
    dbPort: process.env.POSTGRES_PORT || 5432,
    dbName: process.env.POSTGRES_DB_NAME,
    dbUser: process.env.POSTGRES_USER_NAME,
    dbPassword: process.env.POSTGRES_PASSWORD,
};

async function auditDates() {
    const db = dbOps(config);
    const dates = ['2026-01-29'];

    for (const date of dates) {
        console.log(`\n========================================`);
        console.log(`AUDITING DATE: ${date}`);
        console.log(`========================================`);

        console.log(`\n--- eLocal Call Data ---`);
        const elocalQuery = `
            SELECT id, caller_id, date_of_call, payout, category, total_duration, ringba_inbound_call_id
            FROM elocal_call_data
            WHERE SUBSTRING(date_of_call, 1, 10) = '${date}'
            ORDER BY date_of_call;
        `;
        const elocalResult = await db.pool.query(elocalQuery);
        console.log(`Found ${elocalResult.rows.length} eLocal calls.`);
        elocalResult.rows.forEach(row => {
            console.log(`[eLocal] ${row.date_of_call} | ${row.caller_id} | Payout: $${row.payout} | Dur: ${row.total_duration}s | Cat: ${row.category} | Ringba ID: ${row.ringba_inbound_call_id || 'NONE'}`);
        });

        console.log(`\n--- Ringba Calls in DB ---`);
        const ringbaQuery = `
            SELECT id, inbound_call_id, call_date_time, caller_id, caller_id_e164, payout_amount, revenue_amount, call_duration, target_id
            FROM ringba_calls
            WHERE SUBSTRING(call_date_time, 1, 10) = '${date}'
            ORDER BY call_date_time;
        `;
        const ringbaResult = await db.pool.query(ringbaQuery);
        console.log(`Found ${ringbaResult.rows.length} Ringba calls.`);
        ringbaResult.rows.forEach(row => {
            console.log(`[Ringba] ${row.call_date_time} | ${row.caller_id} (${row.caller_id_e164}) | Payout: $${row.payout_amount} | Dur: ${row.call_duration}s | Target: ${row.target_id}`);
        });
    }

    process.exit(0);
}

auditDates().catch(err => {
    console.error(err);
    process.exit(1);
});
