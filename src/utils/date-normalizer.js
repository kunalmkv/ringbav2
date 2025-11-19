// Date normalization utilities
// Standardizes dates to ISO format (YYYY-MM-DDTHH:mm:ss) for consistent database storage
// eLocal data is in EST (Eastern Standard Time) USA/Canada timezone

/**
 * Normalize date string to ISO format (YYYY-MM-DDTHH:mm:ss)
 * Preserves time information if available, otherwise uses midnight (00:00:00)
 * Handles various input formats:
 * - MM/DD/YY or MM/DD/YYYY (e.g., "11/18/25" or "11/18/2025") -> "2025-11-18T00:00:00"
 * - MM/DD/YY HH:MM AM/PM EST (e.g., "11/18/25 04:38 PM EST") -> "2025-11-18T16:38:00"
 * - MM/DD/YYYY HH:MM:SS AM/PM (e.g., "11/18/2025 02:30:45 PM") -> "2025-11-18T14:30:45"
 * - YYYY-MM-DD (e.g., "2025-11-18") -> "2025-11-18T00:00:00"
 * - ISO strings (e.g., "2025-11-18T12:30:00.000Z") -> "2025-11-18T12:30:00"
 * - Date objects
 * 
 * IMPORTANT: For eLocal data, dates are saved EXACTLY as received without timezone conversion.
 * If eLocal sends "11/18/25 04:38 PM EST", we save it as "2025-11-18T16:38:00" (just convert 12-hour to 24-hour).
 * We do NOT convert the time to a different timezone - we preserve the time as-is from eLocal.
 * 
 * @param {string|Date} dateInput - Date in various formats (assumed to be EST for eLocal data)
 * @param {boolean} isElocalData - If true, treats the date as EST timezone (default: true)
 * @returns {string|null} - Normalized date+time in ISO format or null if invalid
 */
export const normalizeDateTime = (dateInput, isElocalData = true) => {
  if (!dateInput) return null;
  
  // If it's already a Date object
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    const hours = String(dateInput.getHours()).padStart(2, '0');
    const minutes = String(dateInput.getMinutes()).padStart(2, '0');
    const seconds = String(dateInput.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
  
  // If it's a string
  if (typeof dateInput !== 'string') return null;
  
  const trimmed = dateInput.trim();
  if (!trimmed) return null;
  
  // Try full ISO format first (YYYY-MM-DDTHH:mm:ss...)
  const isoFullMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (isoFullMatch) {
    const year = parseInt(isoFullMatch[1], 10);
    const month = parseInt(isoFullMatch[2], 10);
    const day = parseInt(isoFullMatch[3], 10);
    const hours = parseInt(isoFullMatch[4], 10);
    const minutes = parseInt(isoFullMatch[5], 10);
    const seconds = parseInt(isoFullMatch[6], 10);
    // Validate
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && 
        hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }
  
  // Try MM/DD/YY or MM/DD/YYYY with time (e.g., "11/18/25 04:38 PM EST" or "11/18/2025 02:30:45 PM EST")
  // This is the format used by eLocal API (EST timezone)
  // IMPORTANT: We do NOT convert timezone - we save the time as-is from eLocal
  // eLocal format: "11/18/25 04:38 PM EST" -> "2025-11-18T16:38:00"
  const mmddyyyyTime = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*(EST|EDT|PST|PDT|CST|CDT|MST|MDT|UTC|GMT)?/i);
  if (mmddyyyyTime) {
    const month = parseInt(mmddyyyyTime[1], 10);
    const day = parseInt(mmddyyyyTime[2], 10);
    let year = parseInt(mmddyyyyTime[3], 10);
    let hours = parseInt(mmddyyyyTime[4], 10);
    const minutes = parseInt(mmddyyyyTime[5], 10);
    const seconds = parseInt(mmddyyyyTime[6] || '0', 10); // Default to 0 if seconds not provided
    const ampm = (mmddyyyyTime[7] || '').toUpperCase();
    // Note: timezone indicator (EST, EDT, etc.) is captured but ignored - we don't convert timezone
    
    // Handle 2-digit year (e.g., "25" -> "2025")
    if (year < 100) {
      // Assume years 00-50 are 2000-2050, years 51-99 are 1951-1999
      year = year <= 50 ? 2000 + year : 1900 + year;
    }
    
    // Convert 12-hour to 24-hour format (if AM/PM is present)
    if (ampm === 'PM' && hours !== 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
    // If no AM/PM, assume 24-hour format (hours already correct)
    
    // Validate
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && 
        hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
      // For eLocal data, store the time as-is without timezone conversion
      // eLocal sends time in EST, we save it exactly as received (just convert 12-hour to 24-hour)
      // Example: "11/18/25 04:38 PM EST" -> "2025-11-18T16:38:00"
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }
  
  // Try YYYY-MM-DD format (date only, use midnight)
  const yyyymmdd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const year = parseInt(yyyymmdd[1], 10);
    const month = parseInt(yyyymmdd[2], 10);
    const day = parseInt(yyyymmdd[3], 10);
    // Validate
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
    }
  }
  
  // Try MM/DD/YYYY format (date only, use midnight)
  const mmddyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const month = parseInt(mmddyyyy[1], 10);
    const day = parseInt(mmddyyyy[2], 10);
    const year = parseInt(mmddyyyy[3], 10);
    // Validate
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
    }
  }
  
  // Try DD-MM-YYYY format (date only, use midnight)
  const ddmmyyyy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10);
    const year = parseInt(ddmmyyyy[3], 10);
    // Validate
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
    }
  }
  
  // Try parsing as Date object (fallback)
  try {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    }
  } catch (error) {
    // Ignore
  }
  
  return null;
};

/**
 * Normalize date string to YYYY-MM-DD format (date only, for backward compatibility)
 * @deprecated Use normalizeDateTime for new code
 */
export const normalizeDate = (dateInput) => {
  const dateTime = normalizeDateTime(dateInput);
  if (!dateTime) return null;
  // Extract date part only
  return dateTime.split('T')[0];
};

/**
 * Normalize date with time to ISO format (preserves time)
 * @deprecated Use normalizeDateTime instead
 */
export const normalizeDateWithTime = (dateTimeInput) => {
  return normalizeDateTime(dateTimeInput);
};

/**
 * Convert Ringba date to EST timezone
 * Ringba API returns dates in UTC when formatDateTime: true is used
 * We need to convert UTC to EST to match eLocal data which is in EST
 * 
 * @param {string} ringbaDateStr - Ringba date string (MM/DD/YYYY HH:MM:SS AM/PM format, in UTC)
 * @returns {string|null} - Date in EST timezone as ISO format (YYYY-MM-DDTHH:mm:ss) or null
 */
export const convertRingbaDateToEST = (ringbaDateStr) => {
  if (!ringbaDateStr) return null;
  
  try {
    // Parse Ringba format: MM/DD/YYYY HH:MM:SS AM/PM
    // Ringba returns this in UTC timezone when formatDateTime: true
    const ringbaFormat = ringbaDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
    if (!ringbaFormat) {
      // If not in expected format, try to parse as-is
      return normalizeDateTime(ringbaDateStr, false);
    }
    
    const month = parseInt(ringbaFormat[1], 10) - 1;
    const day = parseInt(ringbaFormat[2], 10);
    const year = parseInt(ringbaFormat[3], 10);
    let hours = parseInt(ringbaFormat[4], 10);
    const minutes = parseInt(ringbaFormat[5], 10);
    const seconds = parseInt(ringbaFormat[6], 10);
    const ampm = ringbaFormat[7].toUpperCase();
    
    // Convert to 24-hour format
    if (ampm === 'PM' && hours !== 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
    
    // Create UTC date object - Ringba dates are in UTC
    const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    
    // Convert UTC to EST
    // EST is UTC-5, EDT (Eastern Daylight Time) is UTC-4
    // Check if date is in DST period (second Sunday in March to first Sunday in November)
    const isDST = isDateInDST(utcDate);
    const estOffsetHours = isDST ? 4 : 5; // EDT is UTC-4, EST is UTC-5
    const estDate = new Date(utcDate.getTime() - (estOffsetHours * 60 * 60 * 1000));
    
    // Format as ISO string (YYYY-MM-DDTHH:mm:ss) in EST
    const yearEST = estDate.getUTCFullYear();
    const monthEST = String(estDate.getUTCMonth() + 1).padStart(2, '0');
    const dayEST = String(estDate.getUTCDate()).padStart(2, '0');
    const hoursEST = String(estDate.getUTCHours()).padStart(2, '0');
    const minutesEST = String(estDate.getUTCMinutes()).padStart(2, '0');
    const secondsEST = String(estDate.getUTCSeconds()).padStart(2, '0');
    
    return `${yearEST}-${monthEST}-${dayEST}T${hoursEST}:${minutesEST}:${secondsEST}`;
  } catch (error) {
    // If conversion fails, return normalized date as-is
    return normalizeDateTime(ringbaDateStr, false);
  }
};

/**
 * Check if a date is in Daylight Saving Time (DST) for Eastern Time
 * DST runs from second Sunday in March (2 AM EST) to first Sunday in November (2 AM EST)
 * 
 * @param {Date} date - Date to check (in UTC)
 * @returns {boolean} - True if date is in DST (EDT), false if EST
 */
const isDateInDST = (date) => {
  const year = date.getUTCFullYear();
  
  // Find second Sunday in March at 2 AM EST (7 AM UTC)
  const march1 = new Date(Date.UTC(year, 2, 1)); // March 1
  const march1Day = march1.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysToSecondSunday = (7 - march1Day) % 7 + 7; // Days to second Sunday
  const dstStart = new Date(Date.UTC(year, 2, 1 + daysToSecondSunday, 7, 0, 0)); // 2 AM EST = 7 AM UTC
  
  // Find first Sunday in November at 2 AM EST (7 AM UTC)
  const nov1 = new Date(Date.UTC(year, 10, 1)); // November 1
  const nov1Day = nov1.getUTCDay();
  const daysToFirstSunday = (7 - nov1Day) % 7; // Days to first Sunday
  const dstEnd = new Date(Date.UTC(year, 10, 1 + daysToFirstSunday, 7, 0, 0)); // 2 AM EST = 7 AM UTC
  
  // DST is active if date is >= dstStart and < dstEnd
  return date >= dstStart && date < dstEnd;
};

