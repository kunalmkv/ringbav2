import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: process.env.POSTGRES_USER_NAME,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB_NAME
});

async function checkJanuaryData() {
    try {
        // Check STATIC category
        const staticResult = await pool.query(`
            SELECT 
                category,
                COUNT(*) as total_calls,
                SUM(payout::numeric) as total_payout,
                MIN(date_of_call) as earliest_call,
                MAX(date_of_call) as latest_call
            FROM elocal_call_data
            WHERE date_of_call >= '2026-01-01' AND date_of_call < '2026-02-01'
                AND category = 'STATIC'
            GROUP BY category
        `);

        console.log('\n=== STATIC Category (January 2026) ===');
        if (staticResult.rows.length > 0) {
            const row = staticResult.rows[0];
            console.log(`Total Calls: ${row.total_calls}`);
            console.log(`Total Payout: $${parseFloat(row.total_payout).toFixed(2)}`);
            console.log(`Date Range: ${row.earliest_call} to ${row.latest_call}`);
        } else {
            console.log('No data found');
        }

        // Check API category
        const apiResult = await pool.query(`
            SELECT 
                category,
                COUNT(*) as total_calls,
                SUM(payout::numeric) as total_payout,
                MIN(date_of_call) as earliest_call,
                MAX(date_of_call) as latest_call
            FROM elocal_call_data
            WHERE date_of_call >= '2026-01-01' AND date_of_call < '2026-02-01'
                AND category = 'API'
            GROUP BY category
        `);

        console.log('\n=== API Category (January 2026) ===');
        if (apiResult.rows.length > 0) {
            const row = apiResult.rows[0];
            console.log(`Total Calls: ${row.total_calls}`);
            console.log(`Total Payout: $${parseFloat(row.total_payout).toFixed(2)}`);
            console.log(`Date Range: ${row.earliest_call} to ${row.latest_call}`);
        } else {
            console.log('No data found');
        }

        // Combined summary
        const combinedResult = await pool.query(`
            SELECT 
                COUNT(*) as total_calls,
                SUM(payout::numeric) as total_payout
            FROM elocal_call_data
            WHERE date_of_call >= '2026-01-01' AND date_of_call < '2026-02-01'
        `);

        console.log('\n=== Combined Summary (January 2026) ===');
        if (combinedResult.rows.length > 0) {
            const row = combinedResult.rows[0];
            console.log(`Total Calls (Both Categories): ${row.total_calls}`);
            console.log(`Total Payout (Both Categories): $${parseFloat(row.total_payout).toFixed(2)}`);
        }

        await pool.end();
    } catch (error) {
        console.error('Error checking data:', error.message);
        process.exit(1);
    }
}

checkJanuaryData();
