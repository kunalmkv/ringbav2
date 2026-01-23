// Parse Ringba CSV export to find converted calls with zero payout/revenue
// This is more reliable than the API which doesn't return all calls

import fs from 'fs';
import { parse } from 'csv-parse/sync';

const run = async () => {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: node src/services/parse-ringba-csv.js <csvFilePath>');
        console.log('Example: node src/services/parse-ringba-csv.js data/ringba-call-log-export-*.csv');
        process.exit(1);
    }

    const csvPath = args[0];

    try {
        // Read CSV file
        const fileContent = fs.readFileSync(csvPath, 'utf-8');

        // Parse CSV
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        console.log(`\nParsed ${records.length} records from CSV\n`);
        console.log('='.repeat(70));
        console.log('Ringba CSV Analysis - Converted Calls with $0 Revenue/Payout');
        console.log('='.repeat(70));

        // Filter for Converted=True AND Revenue=$0 AND Payout=$0
        const anomalous = records.filter(record => {
            const converted = record['Converted'] === 'True' || record['Converted'] === 'true';
            const revenue = parseFloat(record['Revenue'] || 0);
            const payout = parseFloat(record['Payout'] || 0);

            return converted && revenue === 0 && payout === 0;
        });

        console.log(`\nFound ${anomalous.length} calls with Converted=True and $0 revenue/payout:\n`);

        anomalous.forEach((call, idx) => {
            console.log(`[${idx + 1}] ${call['Call Date']}`);
            console.log(`    Caller ID: ${call['Caller ID']}`);
            console.log(`    Target: ${call['Target']}`);
            console.log(`    Campaign: ${call['Campaign']}`);
            console.log(`    Duration: ${call['Duration']}`);
            console.log(`    Revenue: $${call['Revenue']}, Payout: $${call['Payout']}`);
            console.log(`    Converted: ${call['Converted']}`);
            if (call['tag:Conversion:ConvertedDuringCall']) {
                console.log(`    ConvertedDuringCall: ${call['tag:Conversion:ConvertedDuringCall']}`);
            }
            console.log('');
        });

        // Save to file
        const timestamp = Date.now();
        const outputFile = `ringba_csv_analysis_${timestamp}.json`;
        fs.writeFileSync(outputFile, JSON.stringify(anomalous, null, 2));
        console.log(`✓ Full data saved to: ${outputFile}\n`);

        // Summary by target
        const byTarget = {};
        anomalous.forEach(call => {
            const target = call['Target'];
            if (!byTarget[target]) {
                byTarget[target] = 0;
            }
            byTarget[target]++;
        });

        console.log('Summary by Target:');
        Object.entries(byTarget).forEach(([target, count]) => {
            console.log(`  ${target}: ${count} calls`);
        });

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

run();
