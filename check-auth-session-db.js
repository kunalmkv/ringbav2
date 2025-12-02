// Script to check auth session status from database
import pg from 'pg';
import dotenv from 'dotenv';
const { Pool } = pg;
dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

(async () => {
  try {
    const client = await pool.connect();
    
    // Check if auth_sessions table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'auth_sessions'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ auth_sessions table does not exist');
      client.release();
      await pool.end();
      process.exit(1);
    }
    
    console.log('✅ auth_sessions table exists');
    console.log('');
    
    // Get all sessions
    const allSessions = await client.query(`
      SELECT 
        id,
        expires_at,
        is_working,
        last_checked,
        last_error_message,
        created_at,
        updated_at,
        checked_count,
        LENGTH(cookie_header) as cookie_length
      FROM auth_sessions
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`Total sessions in database: ${allSessions.rows.length}`);
    console.log('');
    
    // Get the latest valid working session
    const validSession = await client.query(`
      SELECT 
        id,
        expires_at,
        is_working,
        last_checked,
        last_error_message,
        created_at,
        updated_at,
        checked_count,
        LENGTH(cookie_header) as cookie_length
      FROM auth_sessions
      WHERE is_working = TRUE
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    console.log('=== Latest Valid Working Session ===');
    if (validSession.rows.length === 0) {
      console.log('❌ No valid working session found');
      console.log('');
      console.log('=== All Sessions (Last 10) ===');
      allSessions.rows.forEach((row, i) => {
        const expires = new Date(row.expires_at);
        const created = new Date(row.created_at);
        const now = new Date();
        const isExpired = expires < now;
        console.log(`${i+1}. Session ID: ${row.id}`);
        console.log(`   Created: ${created.toLocaleString()}`);
        console.log(`   Expires: ${expires.toLocaleString()}`);
        console.log(`   Status: ${row.is_working ? '✅ Working' : '❌ Not Working'}`);
        console.log(`   Expired: ${isExpired ? '❌ YES' : '✅ NO'}`);
        if (row.last_checked) {
          console.log(`   Last Checked: ${new Date(row.last_checked).toLocaleString()}`);
        }
        if (row.last_error_message) {
          console.log(`   Last Error: ${row.last_error_message.substring(0, 100)}`);
        }
        console.log(`   Checked Count: ${row.checked_count || 0}`);
        console.log('');
      });
    } else {
      const row = validSession.rows[0];
      const expires = new Date(row.expires_at);
      const created = new Date(row.created_at);
      const now = new Date();
      const timeUntilExpiry = expires - now;
      const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
      const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));
      
      console.log(`Session ID: ${row.id}`);
      console.log(`Created: ${created.toLocaleString()}`);
      console.log(`Expires: ${expires.toLocaleString()}`);
      console.log(`Status: ✅ Working`);
      console.log(`Time until expiry: ${hoursUntilExpiry} hours ${minutesUntilExpiry} minutes`);
      if (row.last_checked) {
        console.log(`Last Checked: ${new Date(row.last_checked).toLocaleString()}`);
      }
      console.log(`Checked Count: ${row.checked_count || 0}`);
      console.log(`Cookie Header Length: ${row.cookie_length} characters`);
      console.log('');
      console.log('✅ Session is VALID and can be used');
    }
    
    client.release();
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();

