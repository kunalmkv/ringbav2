import pg from 'pg';
const { Pool } = pg;

// Initialize PostgreSQL connection pool
let pool = null;

export const dbOps = (config) => {
  if (!pool) {
    pool = new Pool({
      host: config.dbHost || process.env.DB_HOST,
      port: config.dbPort || process.env.DB_PORT || 5432,
      database: config.dbName || process.env.DB_NAME,
      user: config.dbUser || process.env.DB_USER,
      password: config.dbPassword || process.env.DB_PASSWORD,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : false
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('[ERROR] Unexpected database pool error:', err);
    });
  }

  return {
    // Create a new scraping session
    async createSession(session) {
      try {
        const query = `
          INSERT INTO scraping_sessions (session_id, started_at, status)
          VALUES ($1, $2, $3)
          ON CONFLICT (session_id) DO NOTHING
          RETURNING session_id;
        `;
        const result = await pool.query(query, [
          session.sessionId,
          session.startedAt || new Date().toISOString(),
          session.status || 'running'
        ]);
        return result.rows[0] || { session_id: session.sessionId };
      } catch (error) {
        console.error('[ERROR] Failed to create session:', error);
        throw error;
      }
    },

    // Update session with completion status
    updateSession(sessionId) {
      return async (updates) => {
        try {
          const fields = [];
          const values = [];
          let paramIndex = 1;

          if (updates.completed_at) {
            fields.push(`completed_at = $${paramIndex++}`);
            values.push(updates.completed_at);
          }
          if (updates.status) {
            fields.push(`status = $${paramIndex++}`);
            values.push(updates.status);
          }
          if (updates.calls_scraped !== undefined) {
            fields.push(`calls_scraped = $${paramIndex++}`);
            values.push(updates.calls_scraped);
          }
          if (updates.adjustments_scraped !== undefined) {
            fields.push(`adjustments_scraped = $${paramIndex++}`);
            values.push(updates.adjustments_scraped);
          }
          if (updates.error_message) {
            fields.push(`error_message = $${paramIndex++}`);
            values.push(updates.error_message);
          }

          if (fields.length === 0) {
            return { updated: 0 };
          }

          values.push(sessionId);
          const query = `
            UPDATE scraping_sessions
            SET ${fields.join(', ')}
            WHERE session_id = $${paramIndex}
            RETURNING session_id;
          `;
          const result = await pool.query(query, values);
          return { updated: result.rowCount || 0 };
        } catch (error) {
          console.error('[ERROR] Failed to update session:', error);
          throw error;
        }
      };
    },

    // Insert or update campaign calls in batch
    // Handles timestamp corrections: when originalDateOfCall is set, the record is looked up
    // by the original timestamp and updated with the corrected dateOfCall from adjustment table
    async insertCallsBatch(calls) {
      if (!calls || calls.length === 0) {
        return { inserted: 0, updated: 0 };
      }

      try {
        let inserted = 0;
        let updated = 0;
        let timestampCorrected = 0;
        let skippedDuplicates = 0;

        // Use a transaction for batch operations
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          for (const call of calls) {
            // Check if call already exists (based on callerId, date_of_call, and category)
            // date_of_call now stores full ISO timestamp (YYYY-MM-DDTHH:mm:ss)
            // Match on exact timestamp to allow multiple calls per day
            //
            // TIMESTAMP CORRECTION HANDLING:
            // If originalDateOfCall is set (from adjustment merge), we need to:
            // 1. Look up the record by the ORIGINAL timestamp
            // 2. Update it with the CORRECTED timestamp (from adjustment's "Time of Call")
            // 3. BUT if the corrected timestamp already exists, skip the timestamp correction
            
            const lookupTimestamp = call.originalDateOfCall || call.dateOfCall;
            let correctedTimestamp = call.dateOfCall;
            let isTimestampCorrection = call.originalDateOfCall && call.originalDateOfCall !== call.dateOfCall;
            
            // If this is a timestamp correction, check if the corrected timestamp would cause a duplicate
            if (isTimestampCorrection) {
              const duplicateCheckQuery = `
                SELECT id FROM elocal_call_data
                WHERE caller_id = $1 
                  AND date_of_call = $2
                  AND category = $3
                LIMIT 1;
              `;
              const duplicateCheckResult = await client.query(duplicateCheckQuery, [
                call.callerId,
                correctedTimestamp,
                call.category || 'STATIC'
              ]);
              
              if (duplicateCheckResult.rows.length > 0) {
                // A record with the corrected timestamp already exists!
                // Skip the timestamp correction - keep the original timestamp
                console.log(`[DB SKIP] Timestamp correction would cause duplicate for caller ${call.callerId.substring(0,10)}...`);
                console.log(`         - Original: ${call.originalDateOfCall}`);
                console.log(`         - Corrected (skipped): ${correctedTimestamp}`);
                console.log(`         - Reason: Record with corrected timestamp already exists`);
                correctedTimestamp = lookupTimestamp; // Revert to original timestamp
                isTimestampCorrection = false;
                skippedDuplicates++;
              }
            }
            
            const checkQuery = `
              SELECT id FROM elocal_call_data
              WHERE caller_id = $1 
                AND date_of_call = $2
                AND category = $3
              LIMIT 1;
            `;
            const checkResult = await client.query(checkQuery, [
              call.callerId,
              lookupTimestamp || '',
              call.category || 'STATIC'
            ]);

            if (checkResult.rows.length > 0) {
              // Update existing call
              // NOTE: If this is a timestamp correction, we update date_of_call to the corrected value
              const updateQuery = `
                UPDATE elocal_call_data
                SET
                  date_of_call = $1,
                  campaign_phone = $2,
                  payout = $3,
                  category = $4,
                  city_state = $5,
                  zip_code = $6,
                  screen_duration = $7,
                  post_screen_duration = $8,
                  total_duration = $9,
                  assessment = $10,
                  classification = $11,
                  adjustment_time = $12,
                  adjustment_amount = $13,
                  adjustment_classification = $14,
                  adjustment_duration = $15,
                  unmatched = $16,
                  ringba_inbound_call_id = $17,
                  updated_at = NOW()
                WHERE caller_id = $18 
                  AND date_of_call = $19
                  AND category = $20
                RETURNING id;
              `;
              await client.query(updateQuery, [
                correctedTimestamp, // Use corrected timestamp (may be same or different)
                call.campaignPhone || '(877) 834-1273',
                call.payout || 0,
                call.category || 'STATIC',
                call.cityState || null,
                call.zipCode || null,
                call.screenDuration || null,
                call.postScreenDuration || null,
                call.totalDuration || null,
                call.assessment || null,
                call.classification || null,
                call.adjustmentTime || null,
                call.adjustmentAmount || null,
                call.adjustmentClassification || null,
                call.adjustmentDuration || null,
                call.unmatched || false,
                call.ringbaInboundCallId || null,
                call.callerId,
                lookupTimestamp || '', // Use original timestamp for WHERE clause
                call.category || 'STATIC'
              ]);
              updated++;
              
              if (isTimestampCorrection) {
                timestampCorrected++;
              }
            } else {
              // Insert new call - but first check if the timestamp already exists (for non-correction cases)
              const existsCheckQuery = `
                SELECT id FROM elocal_call_data
                WHERE caller_id = $1 
                  AND date_of_call = $2
                  AND category = $3
                LIMIT 1;
              `;
              const existsCheckResult = await client.query(existsCheckQuery, [
                call.callerId,
                correctedTimestamp,
                call.category || 'STATIC'
              ]);
              
              if (existsCheckResult.rows.length > 0) {
                // Record with this timestamp already exists, update it instead
                const updateQuery = `
                  UPDATE elocal_call_data
                  SET
                    campaign_phone = $1,
                    payout = $2,
                    city_state = $3,
                    zip_code = $4,
                    screen_duration = $5,
                    post_screen_duration = $6,
                    total_duration = $7,
                    assessment = $8,
                    classification = $9,
                    adjustment_time = $10,
                    adjustment_amount = $11,
                    adjustment_classification = $12,
                    adjustment_duration = $13,
                    unmatched = $14,
                    ringba_inbound_call_id = $15,
                    updated_at = NOW()
                  WHERE caller_id = $16 
                    AND date_of_call = $17
                    AND category = $18
                  RETURNING id;
                `;
                await client.query(updateQuery, [
                  call.campaignPhone || '(877) 834-1273',
                  call.payout || 0,
                  call.cityState || null,
                  call.zipCode || null,
                  call.screenDuration || null,
                  call.postScreenDuration || null,
                  call.totalDuration || null,
                  call.assessment || null,
                  call.classification || null,
                  call.adjustmentTime || null,
                  call.adjustmentAmount || null,
                  call.adjustmentClassification || null,
                  call.adjustmentDuration || null,
                  call.unmatched || false,
                  call.ringbaInboundCallId || null,
                  call.callerId,
                  correctedTimestamp,
                  call.category || 'STATIC'
                ]);
                updated++;
              } else {
                // Insert new call
                const insertQuery = `
                  INSERT INTO elocal_call_data (
                    caller_id, date_of_call, campaign_phone, payout, category,
                    city_state, zip_code, screen_duration, post_screen_duration,
                    total_duration, assessment, classification,
                    adjustment_time, adjustment_amount, adjustment_classification,
                    adjustment_duration, unmatched, ringba_inbound_call_id, created_at
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
                  RETURNING id;
                `;
                await client.query(insertQuery, [
                  call.callerId,
                  correctedTimestamp, // Use corrected timestamp
                  call.campaignPhone || '(877) 834-1273',
                  call.payout || 0,
                  call.category || 'STATIC',
                  call.cityState || null,
                  call.zipCode || null,
                  call.screenDuration || null,
                  call.postScreenDuration || null,
                  call.totalDuration || null,
                  call.assessment || null,
                  call.classification || null,
                  call.adjustmentTime || null,
                  call.adjustmentAmount || null,
                  call.adjustmentClassification || null,
                  call.adjustmentDuration || null,
                  call.unmatched || false,
                  call.ringbaInboundCallId || null
                ]);
                inserted++;
              }
            }
          }
          
          if (timestampCorrected > 0) {
            console.log(`[DB] Timestamp corrections applied to ${timestampCorrected} existing records`);
          }
          if (skippedDuplicates > 0) {
            console.log(`[DB] Skipped ${skippedDuplicates} timestamp corrections (would cause duplicates)`);
          }

          await client.query('COMMIT');
          return { inserted, updated, skippedDuplicates };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        console.error('[ERROR] Failed to insert/update calls batch:', error);
        throw error;
      }
    },

    // Insert adjustment details in batch
    async insertAdjustmentsBatch(adjustments) {
      if (!adjustments || adjustments.length === 0) {
        return { inserted: 0, skipped: 0 };
      }

      try {
        let inserted = 0;
        let skipped = 0;

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          for (const adj of adjustments) {
            // Check if adjustment already exists (based on call_sid or combination of fields)
            const checkQuery = `
              SELECT id FROM adjustment_details
              WHERE call_sid = $1 OR (
                caller_id = $2 AND time_of_call = $3 AND adjustment_time = $4
              )
              LIMIT 1;
            `;
            const checkResult = await client.query(checkQuery, [
              adj.callSid || '',
              adj.callerId,
              adj.timeOfCall,
              adj.adjustmentTime
            ]);

            if (checkResult.rows.length > 0) {
              skipped++;
              continue;
            }

            // Insert new adjustment
            const insertQuery = `
              INSERT INTO adjustment_details (
                time_of_call, adjustment_time, campaign_phone, caller_id,
                duration, call_sid, amount, classification, created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              RETURNING id;
            `;
            await client.query(insertQuery, [
              adj.timeOfCall,
              adj.adjustmentTime,
              adj.campaignPhone || '(877) 834-1273',
              adj.callerId,
              adj.duration || 0,
              adj.callSid || null,
              adj.amount || 0,
              adj.classification || null
            ]);
            inserted++;
          }

          await client.query('COMMIT');
          return { inserted, skipped };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        console.error('[ERROR] Failed to insert adjustments batch:', error);
        throw error;
      }
    },
    
    // Get calls from database for a date range
    async getCallsForDateRange(startDate, endDate, category = null) {
      try {
        // Format dates for comparison (YYYY-MM-DD format for date part matching)
        // date_of_call now stores full ISO timestamp (YYYY-MM-DDTHH:mm:ss)
        // We match on the date part (first 10 characters)
        const formatDate = (date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        // Generate all dates in the range for comparison
        const datesInRange = [];
        const current = new Date(startDate);
        const end = new Date(endDate);
        
        while (current <= end) {
          datesInRange.push(formatDate(new Date(current)));
          current.setDate(current.getDate() + 1);
        }
        
        // Build query to match any date in the range
        // Match on date part (first 10 characters) of date_of_call
        const placeholders = datesInRange.map((_, i) => `$${i + 1}`).join(', ');
        const params = [...datesInRange];
        
        let categoryFilter = '';
        if (category) {
          categoryFilter = ` AND category = $${params.length + 1}`;
          params.push(category);
        }
        
        const query = `
          SELECT 
            id, caller_id, date_of_call, payout, category,
            original_payout, original_revenue, ringba_inbound_call_id, unmatched
          FROM elocal_call_data
          WHERE SUBSTRING(date_of_call, 1, 10) = ANY(ARRAY[${placeholders}])${categoryFilter}
          ORDER BY caller_id, date_of_call
        `;
        
        const result = await pool.query(query, params);
        return result.rows || [];
      } catch (error) {
        console.error('[ERROR] Failed to get calls for date range:', error);
        throw error;
      }
    },
    
    // Update original payout/revenue for a call
    async updateOriginalPayout(callId, originalPayout, originalRevenue, ringbaInboundCallId) {
      try {
        const query = `
          UPDATE elocal_call_data
          SET 
            original_payout = $1,
            original_revenue = $2,
            ringba_inbound_call_id = COALESCE($3, ringba_inbound_call_id),
            updated_at = NOW()
          WHERE id = $4
          RETURNING id;
        `;
        const result = await pool.query(query, [
          originalPayout,
          originalRevenue,
          ringbaInboundCallId,
          callId
        ]);
        return { updated: result.rowCount || 0 };
      } catch (error) {
        console.error('[ERROR] Failed to update original payout:', error);
        throw error;
      }
    },
    
    // Get call by ID (for fetching current payout before update)
    async getCallById(callId) {
      try {
        const query = `
          SELECT id, caller_id, date_of_call, payout, category, unmatched
          FROM elocal_call_data
          WHERE id = $1
        `;
        const result = await pool.query(query, [callId]);
        return result.rows[0] || null;
      } catch (error) {
        console.error('[ERROR] Failed to get call by ID:', error);
        throw error;
      }
    },
    
    // Update existing call with adjustment (only payout and adjustment fields)
    async updateCallWithAdjustment(callId, adjustmentData) {
      try {
        const query = `
          UPDATE elocal_call_data
          SET 
            payout = $1,
            adjustment_time = $2,
            adjustment_amount = $3,
            adjustment_classification = $4,
            adjustment_duration = $5,
            unmatched = $6,
            updated_at = NOW()
          WHERE id = $7
          RETURNING id;
        `;
        const result = await pool.query(query, [
          adjustmentData.payout || 0,
          adjustmentData.adjustmentTime || null,
          adjustmentData.adjustmentAmount || null,
          adjustmentData.adjustmentClassification || null,
          adjustmentData.adjustmentDuration || null,
          false, // Set unmatched to false when adjustment is matched
          callId
        ]);
        return { updated: result.rowCount || 0 };
      } catch (error) {
        console.error('[ERROR] Failed to update call with adjustment:', error);
        throw error;
      }
    },
    
    // Insert Ringba calls in batch (upsert by inbound_call_id)
    async insertRingbaCallsBatch(ringbaCalls) {
      if (!ringbaCalls || ringbaCalls.length === 0) {
        return { inserted: 0, updated: 0, skipped: 0 };
      }
      
      try {
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        
        // Process in batches of 500 to avoid query size limits
        const batchSize = 500;
        for (let i = 0; i < ringbaCalls.length; i += batchSize) {
          const batch = ringbaCalls.slice(i, i + batchSize);
          
          for (const call of batch) {
            try {
              // Check if call already exists
              const checkQuery = `
                SELECT id FROM ringba_calls 
                WHERE inbound_call_id = $1
              `;
              const checkResult = await pool.query(checkQuery, [call.inboundCallId]);
              
              if (checkResult.rows.length > 0) {
                // Update existing record
                const updateQuery = `
                  UPDATE ringba_calls
                  SET 
                    call_date_time = $1,
                    caller_id = $2,
                    caller_id_e164 = $3,
                    inbound_phone_number = $4,
                    payout_amount = $5,
                    revenue_amount = $6,
                    call_duration = $7,
                    target_id = $8,
                    target_name = $9,
                    campaign_name = $10,
                    publisher_name = $11,
                    updated_at = NOW()
                  WHERE inbound_call_id = $12
                `;
                await pool.query(updateQuery, [
                  call.callDt || '',
                  call.callerId || null,
                  call.callerIdE164 || null,
                  call.inboundPhoneNumber || null,
                  call.payout || 0,
                  call.revenue || 0,
                  call.callDuration || 0,
                  call.targetId || null,
                  call.targetName || null,
                  call.campaignName || null,
                  call.publisherName || null,
                  call.inboundCallId
                ]);
                updated++;
              } else {
                // Insert new record
                const insertQuery = `
                  INSERT INTO ringba_calls (
                    inbound_call_id, call_date_time, caller_id, caller_id_e164,
                    inbound_phone_number, payout_amount, revenue_amount, call_duration,
                    target_id, target_name, campaign_name, publisher_name
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `;
                await pool.query(insertQuery, [
                  call.inboundCallId,
                  call.callDt || '',
                  call.callerId || null,
                  call.callerIdE164 || null,
                  call.inboundPhoneNumber || null,
                  call.payout || 0,
                  call.revenue || 0,
                  call.callDuration || 0,
                  call.targetId || null,
                  call.targetName || null,
                  call.campaignName || null,
                  call.publisherName || null
                ]);
                inserted++;
              }
            } catch (error) {
              console.warn(`[WARN] Failed to insert/update Ringba call ${call.inboundCallId}:`, error.message);
              skipped++;
            }
          }
        }
        
        return { inserted, updated, skipped };
      } catch (error) {
        console.error('[ERROR] Failed to insert Ringba calls batch:', error);
        throw error;
      }
    },
    
    // Expose pool for direct access if needed
    get pool() {
      return pool;
    }
  };
};

