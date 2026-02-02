
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const path = '/Users/rajeev/Desktop/adstia/elocal-scrapper/ringbav2/elocal_api_2026-01-29_to_2026-01-30_1769923876315.txt';

try {
    const content = fs.readFileSync(path, 'utf8');
    const data = JSON.parse(content);

    if (data.calls && Array.isArray(data.calls)) {
        data.calls = data.calls.map(call => {
            // Map original_payout to revenue and final_payout to payout
            // Ensure they are numbers
            const revenue = call.original_payout !== undefined ? Number(call.original_payout) : 0;
            const payout = call.final_payout !== undefined ? Number(call.final_payout) : 0;

            // Add new fields to the call object
            return {
                ...call,
                revenue: revenue,
                payout: payout
            };
        });
    }

    fs.writeFileSync(path, JSON.stringify(data, null, 2));
    console.log('Successfully added revenue and payout fields to ' + path);
} catch (error) {
    console.error('Error updating file:', error);
}
