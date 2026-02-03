import fetch from 'node-fetch';
import * as TE from 'fp-ts/lib/TaskEither.js';
import dotenv from 'dotenv';

dotenv.config();

const ELOCAL_BASE_URL = 'https://apis.elocal.com/affiliates/v2/campaign-results';

/**
 * Fetch calls from eLocal API v2
 * 
 * @param {string} apiKey - eLocal API Key
 * @param {string} uuid - Campaign UUID
 * @param {Object} dateRange - { startDate, endDate } in YYYY-MM-DD format
 * @param {Object} options - { sortBy, sortOrder }
 * @returns {TE.TaskEither<Error, Object>} API response
 */
export const getElocalCalls = (apiKey, uuid) => (dateRange, options = {}) =>
  TE.tryCatch(
    async () => {
      if (!apiKey) throw new Error('eLocal API Key is required');
      if (!uuid) throw new Error('Campaign UUID is required');

      const url = new URL(`${ELOCAL_BASE_URL}/${uuid}/calls.json`);

      // Add query parameters (API v2 requires YYYY-MM-DD)
      url.searchParams.append('start_date', dateRange.startDateURL);

      // IMPORTANT: Extend end_date by one day for inclusive fetching
      // eLocal API does not include calls on the end_date itself, so we must add 1 day
      // This matches the behavior in elocal-api-fetch.js
      const endDateParts = dateRange.endDateURL.split('-');
      const endDateObj = new Date(Date.UTC(
        parseInt(endDateParts[0]),
        parseInt(endDateParts[1]) - 1,
        parseInt(endDateParts[2])
      ));
      endDateObj.setUTCDate(endDateObj.getUTCDate() + 1);
      const extendedEndDate = endDateObj.toISOString().split('T')[0];

      url.searchParams.append('end_date', extendedEndDate);
      url.searchParams.append('sortBy', options.sortBy || 'callStartTime');
      url.searchParams.append('sortOrder', options.sortOrder || 'desc');

      console.log(`[eLocal] Fetching API: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        throw new Error(`eLocal API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // Handle different possible response formats (array vs object with calls array)
      const calls = Array.isArray(data) ? data : (data.calls || data.results || []);

      return {
        calls,
        totalCalls: calls.length,
        raw: data
      };
    },
    (error) => new Error(`Failed to fetch calls from eLocal API: ${error.message}`)
  );
