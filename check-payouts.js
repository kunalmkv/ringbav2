import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config();

const config = {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB_NAME,
    user: process.env.POSTGRES_USER_NAME,
    password: process.env.POSTGRES_PASSWORD,
};

async function run() {
    const pool = new Pool(config);
    try {
        const res = await pool.query("SELECT id, caller_id, date_of_call, payout, original_payout, original_revenue FROM elocal_call_data WHERE SUBSTRING(date_of_call, 1, 10) = '2026-01-29' AND category = 'API' LIMIT 20");
        console.table(res.rows);
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        await pool.end();
    }
}

run();
