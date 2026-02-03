#!/usr/bin/env node

/**
 * Ringba Revenue Report for Appliance Repair
 * Fetches all Ringba calls and calculates total revenue by category (STATIC and API)
 * 
 * Usage:
 *   node ringba-revenue-report.js 01-01-2026 to 31-01-2026
 *   node ringba-revenue-report.js 01-01-2026 31-01-2026
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

// Parse date range from command line arguments
function parseDateRange(args) {
    if (args.length < 2) {
        return null;
    }

    let startDateStr, endDateStr;

    // Support both "DD-MM-YYYY to DD-MM-YYYY" and "DD-MM-YYYY DD-MM-YYYY"
    if (args.includes('to')) {
        const toIndex = args.indexOf('to');
        startDateStr = args[toIndex - 1];
        endDateStr = args[toIndex + 1];
    } else {
        startDateStr = args[0];
        endDateStr = args[1];
    }

    if (!startDateStr || !endDateStr) {
        return null;
    }

    // Parse DD-MM-YYYY format
    const parseDate = (dateStr) => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const [day, month, year] = parts;
        return new Date(year, month - 1, day);
    };

    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return null;
    }

    // Set time to start and end of day
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
}

// Format date for display
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Main function
async function generateRevenueReport() {
    const args = process.argv.slice(2);

    const dateRange = parseDateRange(args);

    if (!dateRange) {
        console.error('Error: Invalid date range format');
        console.error('');
        console.error('Usage:');
        console.error('  node ringba-revenue-report.js 01-01-2026 to 31-01-2026');
        console.error('  node ringba-revenue-report.js 01-01-2026 31-01-2026');
        console.error('');
        console.error('Date format: DD-MM-YYYY');
        process.exit(1);
    }

    const { startDate, endDate } = dateRange;

    const pool = new Pool({
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        user: process.env.POSTGRES_USER_NAME,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB_NAME
    });

    try {
        console.log('======================================================================');
        console.log('Ringba Revenue Report - Appliance Repair');
        console.log('======================================================================');
        console.log(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`);
        console.log('======================================================================\n');

        // Query to get revenue by category
        const query = `
      SELECT 
        category,
        COUNT(*) as total_calls,
        SUM(COALESCE(payout, 0)) as total_payout,
        SUM(COALESCE(original_payout, payout, 0)) as total_original_payout,
        SUM(COALESCE(original_revenue, payout, 0)) as total_original_revenue,
        MIN(date_of_call) as earliest_call,
        MAX(date_of_call) as latest_call
      FROM elocal_call_data
      WHERE date_of_call >= $1 
        AND date_of_call <= $2
      GROUP BY category
      ORDER BY category;
    `;

        const result = await pool.query(query, [startDate.toISOString(), endDate.toISOString()]);

        if (result.rows.length === 0) {
            console.log('No calls found for the specified date range.\n');
            return;
        }

        let totalCalls = 0;
        let totalPayout = 0;
        let totalOriginalPayout = 0;
        let totalOriginalRevenue = 0;

        // Display results by category
        result.rows.forEach((row) => {
            const category = row.category || 'UNKNOWN';
            const calls = parseInt(row.total_calls);
            const payout = parseFloat(row.total_payout);
            const originalPayout = parseFloat(row.total_original_payout);
            const originalRevenue = parseFloat(row.total_original_revenue);

            console.log(`Category: ${category}`);
            console.log(`  Total Calls: ${calls.toLocaleString()}`);
            console.log(`  Current Total Payout: $${payout.toFixed(2).toLocaleString()}`);
            console.log(`  Original Total Payout: $${originalPayout.toFixed(2).toLocaleString()}`);
            console.log(`  Original Total Revenue: $${originalRevenue.toFixed(2).toLocaleString()}`);
            console.log(`  Earliest Call: ${row.earliest_call}`);
            console.log(`  Latest Call: ${row.latest_call}`);
            console.log('');

            totalCalls += calls;
            totalPayout += payout;
            totalOriginalPayout += originalPayout;
            totalOriginalRevenue += originalRevenue;
        });

        // Display totals
        console.log('======================================================================');
        console.log('TOTALS (All Categories)');
        console.log('======================================================================');
        console.log(`Total Calls: ${totalCalls.toLocaleString()}`);
        console.log(`Current Total Payout: $${totalPayout.toFixed(2).toLocaleString()}`);
        console.log(`Original Total Payout: $${totalOriginalPayout.toFixed(2).toLocaleString()}`);
        console.log(`Original Total Revenue: $${totalOriginalRevenue.toFixed(2).toLocaleString()}`);
        console.log('======================================================================\n');

        // Query for detailed breakdown
        const detailQuery = `
      SELECT 
        category,
        COUNT(CASE WHEN payout > 0 THEN 1 END) as paid_calls,
        COUNT(CASE WHEN payout = 0 THEN 1 END) as zero_payout_calls,
        AVG(CASE WHEN payout > 0 THEN payout END) as avg_payout
      FROM elocal_call_data
      WHERE date_of_call >= $1 
        AND date_of_call <= $2
      GROUP BY category
      ORDER BY category;
    `;

        const detailResult = await pool.query(detailQuery, [startDate.toISOString(), endDate.toISOString()]);

        console.log('Additional Statistics:');
        console.log('======================================================================');
        detailResult.rows.forEach((row) => {
            const category = row.category || 'UNKNOWN';
            console.log(`${category}:`);
            console.log(`  Paid Calls: ${row.paid_calls}`);
            console.log(`  Zero Payout Calls: ${row.zero_payout_calls}`);
            console.log(`  Average Payout (paid calls only): $${row.avg_payout ? parseFloat(row.avg_payout).toFixed(2) : '0.00'}`);
            console.log('');
        });
        console.log('======================================================================\n');

    } catch (error) {
        console.error('Error generating revenue report:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

generateRevenueReport();
