// Script to import Excel data into payout_comparison_daily table
import XLSX from 'xlsx';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Excel file path
const EXCEL_FILE_PATH = join(__dirname, 'data', 'Ringba Update2.xlsx');
const MAX_DATE = '2025-11-26'; // Only import data up to November 26

// Helper to parse date from various Excel formats
const parseDate = (excelDate) => {
  if (!excelDate) return null;
  
  // If it's already a string in YYYY-MM-DD format
  if (typeof excelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(excelDate)) {
    return excelDate;
  }
  
  // If it's an Excel serial date number
  if (typeof excelDate === 'number') {
    // Excel epoch is January 1, 1900
    const excelEpoch = new Date(1900, 0, 1);
    const days = excelDate - 2; // Excel counts from 0, but treats 1900 as leap year
    const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // If it's a Date object
  if (excelDate instanceof Date) {
    const year = excelDate.getFullYear();
    const month = String(excelDate.getMonth() + 1).padStart(2, '0');
    const day = String(excelDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Try to parse as string date
  if (typeof excelDate === 'string') {
    // Try MM/DD/YYYY
    const mmddyyyy = excelDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
      const month = mmddyyyy[1].padStart(2, '0');
      const day = mmddyyyy[2].padStart(2, '0');
      const year = mmddyyyy[3];
      return `${year}-${month}-${day}`;
    }
    
    // Try DD-MM-YYYY
    const ddMMyyyy = excelDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddMMyyyy) {
      const day = ddMMyyyy[1].padStart(2, '0');
      const month = ddMMyyyy[2].padStart(2, '0');
      const year = ddMMyyyy[3];
      return `${year}-${month}-${day}`;
    }
    
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(excelDate)) {
      return excelDate;
    }
  }
  
  return null;
};

// Helper to parse number/currency values
const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols, commas, and whitespace
    const cleaned = value.replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

// Helper to parse integer
const parseIntSafe = (value) => {
  const num = parseNumber(value);
  return Math.floor(num);
};

// Analyze Excel file structure
const analyzeExcelFile = () => {
  console.log('\n[Import] Analyzing Excel file structure...');
  console.log(`[Import] File path: ${EXCEL_FILE_PATH}`);
  
  if (!fs.existsSync(EXCEL_FILE_PATH)) {
    throw new Error(`Excel file not found: ${EXCEL_FILE_PATH}`);
  }
  
  const workbook = XLSX.readFile(EXCEL_FILE_PATH);
  console.log(`[Import] Found ${workbook.SheetNames.length} sheet(s):`, workbook.SheetNames);
  
  // Use the first sheet (or find the one with data)
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  console.log(`[Import] Using sheet: "${sheetName}"`);
  
  // Convert to JSON to analyze structure
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    defval: null,
    raw: false // Get formatted values
  });
  
  console.log(`[Import] Found ${jsonData.length} rows of data`);
  
  if (jsonData.length === 0) {
    throw new Error('No data found in Excel file');
  }
  
  // Log first few rows to understand structure
  console.log('\n[Import] Sample data (first 3 rows):');
  console.log(JSON.stringify(jsonData.slice(0, 3), null, 2));
  
  // Log all column names
  if (jsonData.length > 0) {
    console.log('\n[Import] Column names found:');
    console.log(Object.keys(jsonData[0]).join(', '));
  }
  
  return { jsonData, sheetName };
};

// Map Excel columns to database fields
// Based on actual Excel structure:
// DATE, RINGBA (Static), __EMPTY (API), E-Local (Static), __EMPTY_1 (API), Revenue (Ringba Total), __EMPTY_2 (Elocal Total), etc.
const mapRowToDatabase = (row) => {
  // Skip header rows (rows where DATE is null or contains text like "Static", "API", etc.)
  const dateValue = row['DATE '] || row['DATE'];
  if (!dateValue || typeof dateValue === 'string' && (dateValue.toLowerCase().includes('static') || dateValue.toLowerCase().includes('api') || dateValue.toLowerCase().includes('total'))) {
    return null; // Skip header row
  }
  
  // Parse date from "DATE " column (MM/DD/YYYY format)
  const date = parseDate(dateValue);
  if (!date) {
    console.warn('[Import] Warning: Could not parse date from row:', dateValue);
    return null;
  }
  
  // Check if date is after MAX_DATE
  if (date > MAX_DATE) {
    return null; // Skip this row
  }
  
  // Map fields based on actual Excel column structure
  const mapped = {
    comparison_date: date,
    // RINGBA column = Ringba Static
    ringba_static: parseNumber(row['RINGBA']),
    // __EMPTY column = Ringba API
    ringba_api: parseNumber(row['__EMPTY']),
    // E-Local column = Elocal Static
    elocal_static: parseNumber(row[' E-Local']),
    // __EMPTY_1 column = Elocal API
    elocal_api: parseNumber(row['__EMPTY_1']),
    // Raw Call column
    total_calls: parseIntSafe(row['Raw Call']),
    // RPC column
    rpc: parseNumber(row['RPC']),
    // Google Ads Spend column
    google_ads_spend: parseNumber(row['Google Ads Spend']),
    google_ads_notes: null, // Not in Excel
    // Telco column
    telco: parseNumber(row['Telco']),
  };
  
  // Calculate totals
  mapped.ringba_total = mapped.ringba_static + mapped.ringba_api;
  mapped.elocal_total = mapped.elocal_static + mapped.elocal_api;
  
  // Calculate adjustments
  mapped.adjustments = mapped.ringba_total - mapped.elocal_total;
  mapped.adjustment_static_pct = (mapped.ringba_static - mapped.elocal_static) / 100;
  mapped.adjustment_api_pct = (mapped.ringba_api - mapped.elocal_api) / 100;
  mapped.adjustment_pct = mapped.ringba_total > 0 
    ? (mapped.adjustments / mapped.ringba_total) * 100 
    : 0;
  
  // Calculate derived metrics
  mapped.cost_per_call = mapped.total_calls > 0 ? mapped.google_ads_spend / mapped.total_calls : 0;
  mapped.net = mapped.elocal_total - mapped.google_ads_spend - mapped.telco;
  mapped.net_profit = mapped.elocal_total > 0 ? (mapped.net / mapped.elocal_total) * 100 : 0;
  
  return mapped;
};

// Import data into database
const importData = async (mappedData) => {
  let client = null;
  try {
    console.log(`\n[Import] Importing ${mappedData.length} records into database...`);
    
    client = await pool.connect();
    
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
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const record of mappedData) {
      try {
        await client.query(upsertQuery, [
          record.comparison_date,
          record.ringba_static,
          record.ringba_api,
          record.ringba_total,
          record.elocal_static,
          record.elocal_api,
          record.elocal_total,
          record.adjustments,
          record.adjustment_static_pct,
          record.adjustment_api_pct,
          record.adjustment_pct,
          record.total_calls,
          record.rpc,
          record.google_ads_spend,
          record.google_ads_notes,
          record.telco,
          record.cost_per_call,
          record.net,
          record.net_profit
        ]);
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({ date: record.comparison_date, error: error.message });
        console.error(`[Import] Error importing ${record.comparison_date}:`, error.message);
      }
    }
    
    console.log(`\n[Import] Import completed!`);
    console.log(`[Import] Successful: ${successCount}`);
    console.log(`[Import] Failed: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\n[Import] Errors:');
      errors.forEach(e => console.log(`  - ${e.date}: ${e.error}`));
    }
    
    return { successCount, errorCount, errors };
  } catch (error) {
    console.error('[Import] Database error:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Main function
const main = async () => {
  try {
    console.log('='.repeat(60));
    console.log('Excel to Payout Comparison Import Script');
    console.log('='.repeat(60));
    console.log(`[Import] Max date filter: ${MAX_DATE}`);
    
    // Step 1: Analyze Excel file
    const { jsonData } = analyzeExcelFile();
    
    // Step 2: Map and filter data
    console.log('\n[Import] Mapping Excel columns to database fields...');
    const mappedData = [];
    const skippedRows = [];
    
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const mapped = mapRowToDatabase(row);
      
      if (!mapped) {
        // Skip header rows silently, only log actual data rows that were skipped
        const dateValue = row['DATE '] || row['DATE'];
        if (dateValue && typeof dateValue === 'string' && !dateValue.toLowerCase().includes('static') && !dateValue.toLowerCase().includes('api')) {
          skippedRows.push({ rowIndex: i + 2, date: dateValue, reason: 'Could not parse date or date after max date' });
        }
        continue;
      }
      
      mappedData.push(mapped);
    }
    
    console.log(`[Import] Mapped ${mappedData.length} valid records`);
    console.log(`[Import] Skipped ${skippedRows.length} rows`);
    
    if (mappedData.length === 0) {
      console.error('[Import] No valid data to import!');
      if (skippedRows.length > 0) {
        console.log('[Import] Skipped rows:', skippedRows.slice(0, 10));
      }
      process.exit(1);
    }
    
    // Show sample of mapped data
    console.log('\n[Import] Sample mapped data (first 3 records):');
    console.log(JSON.stringify(mappedData.slice(0, 3), null, 2));
    
    // Step 3: Import to database
    const result = await importData(mappedData);
    
    console.log('\n' + '='.repeat(60));
    console.log('[Import] Import Summary:');
    console.log(`  Total rows in Excel: ${jsonData.length}`);
    console.log(`  Valid records: ${mappedData.length}`);
    console.log(`  Successfully imported: ${result.successCount}`);
    console.log(`  Failed: ${result.errorCount}`);
    console.log('='.repeat(60));
    
    await pool.end();
    process.exit(result.errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n[Import] Fatal error:', error);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
};

main();

