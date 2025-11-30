// Service to calculate and store payout comparison data in payout_comparison_daily table
import pg from 'pg';
import dotenv from 'dotenv';

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

/**
 * Calculate and store payout comparison data for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
export const syncPayoutComparisonForDate = async (date) => {
  let client = null;
  try {
    console.log(`[PayoutComparisonSync] Syncing data for date: ${date}`);
    
    client = await pool.connect();
    
    // Get elocal call data grouped by category
    const elocalQuery = `
      SELECT 
        category,
        COALESCE(SUM(payout), 0) as elocal_payout,
        COALESCE(SUM(original_payout), 0) as ringba_payout,
        COALESCE(SUM(original_revenue), 0) as ringba_revenue,
        COUNT(*) as call_count
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = $1
      GROUP BY category
    `;
    
    const elocalResult = await client.query(elocalQuery, [date]);
    
    // Initialize values
    let ringbaStatic = 0;
    let ringbaApi = 0;
    let elocalStatic = 0;
    let elocalApi = 0;
    let totalCalls = 0;
    
    // Process elocal call data
    for (const row of elocalResult.rows) {
      const category = String(row.category || 'STATIC').toUpperCase();
      const elocalPayout = parseFloat(row.elocal_payout) || 0;
      const ringbaPayout = parseFloat(row.ringba_payout) || 0;
      const ringbaRevenue = parseFloat(row.ringba_revenue) || 0;
      const callCount = parseInt(row.call_count) || 0;
      
      if (category === 'STATIC') {
        ringbaStatic = ringbaPayout;
        elocalStatic = elocalPayout;
      } else if (category === 'API') {
        ringbaApi = ringbaRevenue;
        elocalApi = elocalPayout;
      }
      
      totalCalls += callCount;
    }
    
    // Calculate totals
    const ringbaTotal = ringbaStatic + ringbaApi;
    const elocalTotal = elocalStatic + elocalApi;
    
    // Get RPC from ringba_campaign_summary (prefer "Appliance Repair" campaign)
    const rpcQuery = `
      SELECT rpc, campaign_name 
      FROM ringba_campaign_summary 
      WHERE summary_date = $1
      ORDER BY 
        CASE 
          WHEN campaign_name = 'Appliance Repair' THEN 1
          WHEN LOWER(campaign_name) LIKE '%appliance repair%' THEN 2
          ELSE 3
        END ASC
      LIMIT 1
    `;
    
    const rpcResult = await client.query(rpcQuery, [date]);
    const rpc = rpcResult.rows.length > 0 ? parseFloat(rpcResult.rows[0].rpc) || 0 : 0;
    
    // Get Google Ads spend and telco from ringba_campaign_summary (Appliance Repair)
    const summaryQuery = `
      SELECT google_ads_spend, google_ads_notes, insights_total_cost
      FROM ringba_campaign_summary 
      WHERE summary_date = $1 
        AND campaign_name = 'Appliance Repair'
      LIMIT 1
    `;
    
    const summaryResult = await client.query(summaryQuery, [date]);
    const googleAdsSpend = summaryResult.rows.length > 0 
      ? parseFloat(summaryResult.rows[0].google_ads_spend) || 0 
      : 0;
    const googleAdsNotes = summaryResult.rows.length > 0 
      ? summaryResult.rows[0].google_ads_notes || null 
      : null;
    const telco = summaryResult.rows.length > 0 
      ? parseFloat(summaryResult.rows[0].insights_total_cost) || 0 
      : 0;
    
    // Calculate adjustments
    const adjustments = ringbaTotal - elocalTotal;
    const adjustmentStaticPct = (ringbaStatic - elocalStatic) / 100;
    const adjustmentApiPct = (ringbaApi - elocalApi) / 100;
    const adjustmentPct = ringbaTotal > 0 
      ? (adjustments / ringbaTotal) * 100 
      : 0;
    
    // Calculate frontend metrics
    const costPerCall = totalCalls > 0 ? googleAdsSpend / totalCalls : 0;
    const net = elocalTotal - googleAdsSpend - telco;
    const netProfit = elocalTotal > 0 ? (net / elocalTotal) * 100 : 0;
    
    // Upsert into payout_comparison_daily table
    const upsertQuery = `
      INSERT INTO payout_comparison_daily (
        comparison_date,
        ringba_static,
        ringba_api,
        ringba_total,
        elocal_static,
        elocal_api,
        elocal_total,
        adjustments,
        adjustment_static_pct,
        adjustment_api_pct,
        adjustment_pct,
        total_calls,
        rpc,
        google_ads_spend,
        google_ads_notes,
        telco,
        cost_per_call,
        net,
        net_profit,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP
      )
      ON CONFLICT (comparison_date) 
      DO UPDATE SET
        ringba_static = EXCLUDED.ringba_static,
        ringba_api = EXCLUDED.ringba_api,
        ringba_total = EXCLUDED.ringba_total,
        elocal_static = EXCLUDED.elocal_static,
        elocal_api = EXCLUDED.elocal_api,
        elocal_total = EXCLUDED.elocal_total,
        adjustments = EXCLUDED.adjustments,
        adjustment_static_pct = EXCLUDED.adjustment_static_pct,
        adjustment_api_pct = EXCLUDED.adjustment_api_pct,
        adjustment_pct = EXCLUDED.adjustment_pct,
        total_calls = EXCLUDED.total_calls,
        rpc = EXCLUDED.rpc,
        google_ads_spend = EXCLUDED.google_ads_spend,
        google_ads_notes = EXCLUDED.google_ads_notes,
        telco = EXCLUDED.telco,
        cost_per_call = EXCLUDED.cost_per_call,
        net = EXCLUDED.net,
        net_profit = EXCLUDED.net_profit,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await client.query(upsertQuery, [
      date,
      ringbaStatic,
      ringbaApi,
      ringbaTotal,
      elocalStatic,
      elocalApi,
      elocalTotal,
      adjustments,
      adjustmentStaticPct,
      adjustmentApiPct,
      adjustmentPct,
      totalCalls,
      rpc,
      googleAdsSpend,
      googleAdsNotes,
      telco,
      costPerCall,
      net,
      netProfit
    ]);
    
    console.log(`[PayoutComparisonSync] ✓ Successfully synced data for ${date}`);
    
    return {
      date,
      ringbaStatic,
      ringbaApi,
      ringbaTotal,
      elocalStatic,
      elocalApi,
      elocalTotal,
      adjustments,
      totalCalls,
      rpc,
      googleAdsSpend,
      telco,
      costPerCall,
      net,
      netProfit
    };
  } catch (error) {
    console.error(`[PayoutComparisonSync] Error syncing data for ${date}:`, error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

/**
 * Sync payout comparison data for a date range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 */
export const syncPayoutComparisonForDateRange = async (startDate, endDate) => {
  try {
    console.log(`[PayoutComparisonSync] Syncing data for date range: ${startDate} to ${endDate}`);
    
    // Generate array of dates
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dates.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`[PayoutComparisonSync] Processing ${dates.length} dates...`);
    
    const results = [];
    for (const date of dates) {
      try {
        const result = await syncPayoutComparisonForDate(date);
        results.push({ date, status: 'success', data: result });
      } catch (error) {
        console.error(`[PayoutComparisonSync] Failed to sync ${date}:`, error.message);
        results.push({ date, status: 'error', error: error.message });
      }
    }
    
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    
    console.log(`[PayoutComparisonSync] Completed: ${successful} successful, ${failed} failed`);
    
    return {
      total: dates.length,
      successful,
      failed,
      results
    };
  } catch (error) {
    console.error('[PayoutComparisonSync] Error syncing date range:', error);
    throw error;
  }
};

/**
 * Update Google Ads spend for a specific date
 * This is called when user edits Google Ads spend in the UI
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} spend - Google Ads spend amount
 * @param {string} notes - Optional notes
 */
export const updateGoogleAdsSpend = async (date, spend, notes = null) => {
  let client = null;
  try {
    console.log(`[PayoutComparisonSync] Updating Google Ads spend for ${date}: ${spend}`);
    
    client = await pool.connect();
    
    // Get current row data
    const getRowQuery = `
      SELECT 
        elocal_total,
        telco,
        total_calls
      FROM payout_comparison_daily
      WHERE comparison_date = $1
    `;
    
    const rowResult = await client.query(getRowQuery, [date]);
    
    if (rowResult.rows.length === 0) {
      throw new Error(`No payout comparison data found for date ${date}. Please sync the data first.`);
    }
    
    const row = rowResult.rows[0];
    const elocalTotal = parseFloat(row.elocal_total) || 0;
    const telco = parseFloat(row.telco) || 0;
    const totalCalls = parseInt(row.total_calls) || 0;
    
    // Recalculate cost_per_call, net, and net_profit
    const costPerCall = totalCalls > 0 ? spend / totalCalls : 0;
    const net = elocalTotal - spend - telco;
    const netProfit = elocalTotal > 0 ? (net / elocalTotal) * 100 : 0;
    
    // Update the row
    const updateQuery = `
      UPDATE payout_comparison_daily
      SET
        google_ads_spend = $1,
        google_ads_notes = $2,
        cost_per_call = $3,
        net = $4,
        net_profit = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE comparison_date = $6
    `;
    
    await client.query(updateQuery, [spend, notes, costPerCall, net, netProfit, date]);
    
    console.log(`[PayoutComparisonSync] ✓ Updated Google Ads spend for ${date}`);
    
    return {
      date,
      googleAdsSpend: spend,
      googleAdsNotes: notes,
      costPerCall,
      net,
      netProfit
    };
  } catch (error) {
    console.error(`[PayoutComparisonSync] Error updating Google Ads spend for ${date}:`, error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

