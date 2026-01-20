import fetch from 'node-fetch';
import * as TE from 'fp-ts/lib/TaskEither.js';
import dotenv from 'dotenv';

dotenv.config();

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

/**
 * Fetch calls for a specific campaign ID with usage custom columns
 * 
 * @param {string} accountId 
 * @param {string} apiToken 
 * @param {string} campaignId 
 * @param {string[]} columns - Array of column names to fetch
 * @param {Object} options 
 * @returns {Promise<Either<Error, {calls, summary}>>}
 */
export const getCallsByCampaignId = (accountId, apiToken) => (campaignId, columns, options = {}) =>
    TE.tryCatch(
        async () => {
            if (!campaignId) throw new Error('campaignId is required');
            if (!accountId || !apiToken) throw new Error('Ringba accountId and apiToken are required');

            let startDate, endDate;
            if (options.startDate) {
                startDate = new Date(options.startDate);
            } else {
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 1); // Default to yesterday
            }

            if (options.endDate) {
                endDate = new Date(options.endDate);
            } else {
                endDate = new Date();
            }

            const pageSize = Math.min(options.pageSize || 1000, 1000);
            const allCalls = [];
            let offset = 0;
            let hasMore = true;

            console.log(`[Ringba] Fetching calls for Campaign ID: "${campaignId}"`);
            console.log(`[Ringba] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

            // Map columns to valueColumns format
            const valueColumns = columns.map(col => ({ column: col }));

            while (hasMore) {
                const url = `${RINGBA_BASE_URL}/${accountId}/calllogs`;
                const headers = {
                    'Authorization': `Token ${apiToken}`,
                    'Content-Type': 'application/json'
                };

                const body = {
                    reportStart: startDate.toISOString(),
                    reportEnd: endDate.toISOString(),
                    offset: offset,
                    size: pageSize,
                    orderByColumns: [
                        { column: 'callDt', direction: 'desc' }
                    ],
                    valueColumns: valueColumns,
                    filters: [
                        {
                            anyConditionToMatch: [
                                {
                                    column: 'campaignId',
                                    comparisonType: 'EQUALS',
                                    value: campaignId,
                                    isNegativeMatch: false
                                }
                            ]
                        }
                    ],
                    formatDateTime: true
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unable to read error response');
                    throw new Error(`Ringba API error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                const records = data.report?.records || [];
                const totalCount = data.report?.totalCount || data.report?.total || records.length;

                console.log(`[Ringba] Retrieved ${records.length} calls (offset ${offset})`);

                allCalls.push(...records);

                if (records.length < pageSize || allCalls.length >= totalCount) {
                    hasMore = false;
                } else {
                    offset += pageSize;
                    // Rate limit protection
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return {
                campaignId,
                calls: allCalls,
                totalCalls: allCalls.length
            };
        },
        (error) => new Error(`Failed to fetch calls by campaign ID: ${error.message}`)
    );
