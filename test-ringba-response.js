#!/usr/bin/env node

import { getCallsByTargetId, TARGET_IDS } from './src/http/ringba-target-calls.js';
import dotenv from 'dotenv';
dotenv.config();

const accountId = process.env.RINGBA_ACCOUNT_ID;
const apiToken = process.env.RINGBA_API_TOKEN;
const targetId = 'TA48aa3e3f5a0544af8549703f76a24faa';

const result = await getCallsByTargetId(accountId, apiToken)(targetId, {
    startDate: '2026-01-27T00:00:00.000Z',
    endDate: '2026-01-27T23:59:59.999Z',
    pageSize: 5
})();

if (result._tag === 'Right') {
    console.log('Sample call data (first call):');
    console.log(JSON.stringify(result.right.calls[0], null, 2));
    console.log('\n\nAll fields in first call:');
    console.log(Object.keys(result.right.calls[0]));
    console.log('\nSummary:', result.right.summary);
} else {
    console.log('Error:', result.left);
}
