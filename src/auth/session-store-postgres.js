// PostgreSQL-based session store for auth cookies
// Replaces file-based session storage with database storage

import pg from 'pg';
const { Pool } = pg;

// Create a pool instance for session operations
let sessionPool = null;

const getPool = (config) => {
  if (!sessionPool) {
    sessionPool = new Pool({
      host: config.dbHost || process.env.DB_HOST,
      port: config.dbPort || process.env.DB_PORT || 5432,
      database: config.dbName || process.env.DB_NAME,
      user: config.dbUser || process.env.DB_USER,
      password: config.dbPassword || process.env.DB_PASSWORD,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : false
    });

    // Handle pool errors
    sessionPool.on('error', (err) => {
      console.error('[Session Store] Unexpected database pool error:', err);
    });
  }
  return sessionPool;
};

/**
 * Build cookie header string from Puppeteer cookies array
 */
export const buildCookieHeaderFromPuppeteer = (cookies) => {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
};

/**
 * Create session object from cookies
 */
export const createSessionFromCookies = (cookies, ttlMs) => {
  const cookieHeader = buildCookieHeaderFromPuppeteer(cookies);
  const now = Date.now();
  return {
    cookieHeader,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
};

/**
 * Read the latest valid session from database
 */
export const readSession = async (config) => {
  try {
    const pool = getPool(config);
    const client = await pool.connect();
    
    try {
      // Get the most recent working session that hasn't expired
      const query = `
        SELECT 
          id,
          cookie_header,
          expires_at,
          is_working,
          last_checked,
          last_error_message,
          created_at,
          updated_at,
          checked_count
        FROM auth_sessions
        WHERE is_working = TRUE
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const result = await client.query(query);
      
      if (result.rows.length === 0) {
        console.log('[Session Store] No valid session found in database');
        return null;
      }
      
      const row = result.rows[0];
      const session = {
        id: row.id,
        cookieHeader: row.cookie_header,
        expiresAt: new Date(row.expires_at).getTime(),
        createdAt: new Date(row.created_at).getTime(),
        isWorking: row.is_working,
        lastChecked: row.last_checked ? new Date(row.last_checked).getTime() : null,
        lastErrorMessage: row.last_error_message,
        checkedCount: row.checked_count || 0
      };
      
      console.log(`[Session Store] Retrieved session ID ${row.id} from database`);
      return session;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Session Store] Error reading session from database:', error);
    throw error;
  }
};

/**
 * Check if session is valid (not expired and marked as working)
 */
export const isSessionValid = (session) => {
  if (!session || !session.cookieHeader) {
    return false;
  }
  
  // Check if session has expiration
  if (session.expiresAt) {
    const expires = new Date(session.expiresAt);
    if (expires < new Date()) {
      return false;
    }
  }
  
  // Check if session is marked as working
  if (session.isWorking === false) {
    return false;
  }
  
  return true;
};

/**
 * Save session to database
 * If a session already exists, it will be updated
 */
export const saveSession = async (config, session, isWorking = true, errorMessage = null) => {
  try {
    const pool = getPool(config);
    const client = await pool.connect();
    
    try {
      // Mark all existing sessions as not working (only one active session at a time)
      await client.query(`
        UPDATE auth_sessions
        SET is_working = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE is_working = TRUE
      `);
      
      // Insert new session
      const insertQuery = `
        INSERT INTO auth_sessions (
          cookie_header,
          expires_at,
          is_working,
          last_checked,
          last_error_message,
          checked_count
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, updated_at
      `;
      
      const expiresAt = new Date(session.expiresAt);
      const lastChecked = new Date();
      
      const result = await client.query(insertQuery, [
        session.cookieHeader,
        expiresAt.toISOString(),
        isWorking,
        lastChecked.toISOString(),
        errorMessage,
        0 // checked_count starts at 0
      ]);
      
      const savedSession = result.rows[0];
      console.log(`[Session Store] Saved session ID ${savedSession.id} to database`);
      console.log(`[Session Store] Expires at: ${expiresAt.toISOString()}`);
      console.log(`[Session Store] Is working: ${isWorking}`);
      
      return {
        id: savedSession.id,
        ...session,
        isWorking,
        lastChecked: lastChecked.getTime(),
        lastErrorMessage: errorMessage
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Session Store] Error saving session to database:', error);
    throw error;
  }
};

/**
 * Update session status (mark as working/not working, update last checked, etc.)
 */
export const updateSessionStatus = async (config, sessionId, updates) => {
  try {
    const pool = getPool(config);
    const client = await pool.connect();
    
    try {
      const updateFields = [];
      const values = [];
      let paramIndex = 1;
      
      if (updates.isWorking !== undefined) {
        updateFields.push(`is_working = $${paramIndex++}`);
        values.push(updates.isWorking);
      }
      
      if (updates.lastChecked !== undefined) {
        updateFields.push(`last_checked = $${paramIndex++}`);
        values.push(updates.lastChecked instanceof Date 
          ? updates.lastChecked.toISOString() 
          : new Date(updates.lastChecked).toISOString());
      }
      
      if (updates.lastErrorMessage !== undefined) {
        updateFields.push(`last_error_message = $${paramIndex++}`);
        values.push(updates.lastErrorMessage);
      }
      
      if (updates.incrementCheckedCount) {
        updateFields.push(`checked_count = checked_count + 1`);
      }
      
      if (updateFields.length === 0) {
        console.log('[Session Store] No fields to update');
        return;
      }
      
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(sessionId);
      
      const query = `
        UPDATE auth_sessions
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, is_working, last_checked, checked_count
      `;
      
      const result = await client.query(query, values);
      
      if (result.rows.length > 0) {
        console.log(`[Session Store] Updated session ID ${sessionId}:`, {
          isWorking: result.rows[0].is_working,
          lastChecked: result.rows[0].last_checked,
          checkedCount: result.rows[0].checked_count
        });
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Session Store] Error updating session status:', error);
    throw error;
  }
};

/**
 * Get session statistics
 */
export const getSessionStats = async (config) => {
  try {
    const pool = getPool(config);
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(*) FILTER (WHERE is_working = TRUE) as working_sessions,
          COUNT(*) FILTER (WHERE expires_at > NOW()) as valid_sessions,
          COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_sessions,
          MAX(created_at) as latest_session,
          MAX(last_checked) as last_checked_time
        FROM auth_sessions
      `;
      
      const result = await client.query(query);
      return result.rows[0];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Session Store] Error getting session stats:', error);
    throw error;
  }
};
