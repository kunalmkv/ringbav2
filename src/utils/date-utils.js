// Date utility functions for scraping services

// Get past 10 days range (excluding today) - LEGACY: uses server timezone
export const getPast10DaysRange = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1); // Yesterday
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 9); // 10 days ago (including yesterday)
  
  return {
    startDate,
    endDate,
    startDateFormatted: formatDateForElocal(startDate),
    endDateFormatted: formatDateForElocal(endDate),
    startDateURL: formatDateForURL(startDate),
    endDateURL: formatDateForURL(endDate)
  };
};

/**
 * Get past 15 days range for eLocal Historical Scraping (IST timezone-aware)
 * 
 * This function:
 * 1. Gets past 15 days EXCLUDING the current date (ends at yesterday based on IST)
 * 2. Is timezone-independent (uses IST regardless of server location)
 * 3. Handles midnight edge case:
 *    - Before 12:00 PM IST: considers "today" as the previous IST day
 *    - After 12:00 PM IST: considers "today" as the current IST day
 * 
 * The end date is always "yesterday" relative to the calculated "today"
 * 
 * Examples (all on Nov 26 IST):
 * - 12:08 AM IST Nov 26: today=Nov25, end=Nov24, start=Nov10
 * - 3:08 AM IST Nov 26: today=Nov25, end=Nov24, start=Nov10
 * - 6:08 AM IST Nov 26: today=Nov25, end=Nov24, start=Nov10
 * - 11:58 PM IST Nov 26: today=Nov26, end=Nov25, start=Nov11
 * 
 * @returns {Object} Date range object with startDate, endDate, and formatted strings
 */
export const getPast15DaysRangeForHistorical = () => {
  // Get current time in IST timezone
  const now = new Date();
  const istDateString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time string: format is "MM/DD/YYYY, HH:MM:SS"
  const istParts = istDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    // Fallback: use legacy function
    console.warn('[getPast15DaysRangeForHistorical] Failed to parse IST time, using fallback');
    return getPast10DaysRange();
  }
  
  // Extract IST components
  const monthIST = parseInt(istParts[1], 10);  // MM (1-12)
  const dayIST = parseInt(istParts[2], 10);     // DD
  const yearIST = parseInt(istParts[3], 10);    // YYYY
  let hoursIST = parseInt(istParts[4], 10);     // HH (0-23)
  const minutesIST = parseInt(istParts[5], 10); // MM (0-59)
  
  // Handle edge case where hour is 24 (should be 0 for midnight)
  if (hoursIST === 24) {
    hoursIST = 0;
  }
  
  // Debug logging
  console.log(`[getPast15DaysRangeForHistorical] Current IST: ${yearIST}-${String(monthIST).padStart(2, '0')}-${String(dayIST).padStart(2, '0')} ${String(hoursIST).padStart(2, '0')}:${String(minutesIST).padStart(2, '0')}`);
  
  // Determine "today" based on IST time
  // Logic: 
  // - If it's between 12:00 AM (00:00) and 11:59 AM IST → consider "today" as previous day
  // - If it's 12:00 PM (12:00) or later IST → consider "today" as current day
  
  let todayYear, todayMonth, todayDay;
  
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST
    // Consider "today" as the previous IST day
    console.log(`[getPast15DaysRangeForHistorical] Before noon IST (${hoursIST}:${String(minutesIST).padStart(2, '0')}), considering previous day as 'today'`);
    
    if (dayIST > 1) {
      todayYear = yearIST;
      todayMonth = monthIST;
      todayDay = dayIST - 1;
    } else {
      if (monthIST > 1) {
        todayYear = yearIST;
        todayMonth = monthIST - 1;
        const lastDayOfPrevMonth = new Date(Date.UTC(yearIST, monthIST - 1, 0)).getUTCDate();
        todayDay = lastDayOfPrevMonth;
      } else {
        todayYear = yearIST - 1;
        todayMonth = 12;
        const lastDayOfDec = new Date(Date.UTC(yearIST - 1, 12, 0)).getUTCDate();
        todayDay = lastDayOfDec;
      }
    }
  } else {
    // It's 12:00 PM (noon) or later IST
    // Consider "today" as the current IST day
    console.log(`[getPast15DaysRangeForHistorical] After noon IST (${hoursIST}:${String(minutesIST).padStart(2, '0')}), using current day as 'today'`);
    
    todayYear = yearIST;
    todayMonth = monthIST;
    todayDay = dayIST;
  }
  
  // Calculate END DATE (yesterday relative to "today")
  let endYear = todayYear;
  let endMonth = todayMonth;
  let endDay = todayDay - 1;
  
  // Handle underflow
  if (endDay < 1) {
    endMonth--;
    if (endMonth < 1) {
      endMonth = 12;
      endYear--;
    }
    const lastDayOfMonth = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
    endDay = lastDayOfMonth;
  }
  
  // Calculate START DATE (15 days including end date = 14 days before end date)
  let startYear = endYear;
  let startMonth = endMonth;
  let startDay = endDay - 14; // 15 days including end date
  
  // Handle underflow (day goes negative)
  while (startDay < 1) {
    startMonth--;
    if (startMonth < 1) {
      startMonth = 12;
      startYear--;
    }
    const lastDayOfMonth = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();
    startDay += lastDayOfMonth;
  }
  
  // Create Date objects using UTC to avoid timezone issues
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
  
  // Format dates directly using our calculated values
  const startDateFormatted = `${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')}/${startYear}`;
  const endDateFormatted = `${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')}/${endYear}`;
  const startDateURL = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const endDateURL = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  
  console.log(`[getPast15DaysRangeForHistorical] Date Range: ${startDateFormatted} to ${endDateFormatted} (excludes today)`);
  
  return {
    startDate,
    endDate,
    startDateFormatted,
    endDateFormatted,
    startDateURL,
    endDateURL
  };
};

/**
 * Get past 15 days range for Cost Sync service (IST timezone-aware)
 * 
 * This function:
 * 1. Gets past 15 days INCLUDING the current date (based on IST/CST logic)
 * 2. Is timezone-independent (uses IST regardless of server location)
 * 3. Handles CST data availability:
 *    - Before 12:00 PM IST → uses PREVIOUS day as end date (CST data not complete)
 *    - After 12:00 PM IST → uses CURRENT day as end date (CST data available)
 * 
 * Examples (all on Nov 26):
 * - 12:08 AM IST → Date Range: Nov 11 to Nov 25 (not Nov 26!)
 * - 3:08 AM IST → Date Range: Nov 11 to Nov 25 (not Nov 26!)
 * - 6:08 AM IST → Date Range: Nov 11 to Nov 25 (not Nov 26!)
 * - 9:08 PM IST → Date Range: Nov 12 to Nov 26 (includes Nov 26)
 * 
 * @returns {Object} Date range object with startDate, endDate, and formatted strings
 */
export const getPast15DaysRangeForCostSync = () => {
  // Get current time in IST timezone
  const now = new Date();
  const istDateString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time string: format is "MM/DD/YYYY, HH:MM:SS"
  const istParts = istDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    // Fallback: use legacy function
    console.warn('[getPast15DaysRangeForCostSync] Failed to parse IST time, using fallback');
    return getPast10DaysRange();
  }
  
  // Extract IST components
  const monthIST = parseInt(istParts[1], 10);  // MM (1-12)
  const dayIST = parseInt(istParts[2], 10);     // DD
  const yearIST = parseInt(istParts[3], 10);    // YYYY
  let hoursIST = parseInt(istParts[4], 10);     // HH (0-23)
  const minutesIST = parseInt(istParts[5], 10); // MM (0-59)
  
  // Handle edge case where hour is 24 (should be 0 for midnight)
  if (hoursIST === 24) {
    hoursIST = 0;
  }
  
  // Debug logging
  console.log(`[getPast15DaysRangeForCostSync] Current IST: ${yearIST}-${String(monthIST).padStart(2, '0')}-${String(dayIST).padStart(2, '0')} ${String(hoursIST).padStart(2, '0')}:${String(minutesIST).padStart(2, '0')}`);
  
  // Determine END DATE based on IST time
  // Logic: 
  // - If it's between 12:00 AM (00:00) and 11:59 AM IST → use PREVIOUS day as end date
  //   (because CST is 11.5 hours behind IST, so CST hasn't finished the current IST day yet)
  // - If it's 12:00 PM (12:00) or later IST → use CURRENT day as end date
  //   (because enough time has passed for CST data to be available)
  
  let endYear, endMonth, endDay;
  
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST
    // Use PREVIOUS day as end date (CST data for current IST day isn't complete)
    console.log(`[getPast15DaysRangeForCostSync] Before noon IST (${hoursIST}:${String(minutesIST).padStart(2, '0')}), using previous day as end date`);
    
    if (dayIST > 1) {
      // Simple case: just subtract 1 from day
      endYear = yearIST;
      endMonth = monthIST;
      endDay = dayIST - 1;
    } else {
      // Day is 1, need to go to previous month
      if (monthIST > 1) {
        // Go to previous month
        endYear = yearIST;
        endMonth = monthIST - 1;
        // Get last day of previous month
        const lastDayOfPrevMonth = new Date(Date.UTC(yearIST, monthIST - 1, 0)).getUTCDate();
        endDay = lastDayOfPrevMonth;
      } else {
        // Month is January (1), go to December of previous year
        endYear = yearIST - 1;
        endMonth = 12;
        // Get last day of December
        const lastDayOfDec = new Date(Date.UTC(yearIST - 1, 12, 0)).getUTCDate();
        endDay = lastDayOfDec;
      }
    }
  } else {
    // It's 12:00 PM (noon) or later IST
    // Use CURRENT day as end date (CST data should be available by now)
    console.log(`[getPast15DaysRangeForCostSync] After noon IST (${hoursIST}:${String(minutesIST).padStart(2, '0')}), using current day as end date`);
    
    endYear = yearIST;
    endMonth = monthIST;
    endDay = dayIST;
  }
  
  // Calculate START DATE (15 days before end date, including end date = 14 days before)
  let startYear = endYear;
  let startMonth = endMonth;
  let startDay = endDay - 14; // 15 days including end date
  
  // Handle underflow (day goes negative)
  while (startDay < 1) {
    // Go to previous month
    startMonth--;
    if (startMonth < 1) {
      startMonth = 12;
      startYear--;
    }
    // Get last day of the new month
    const lastDayOfMonth = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();
    startDay += lastDayOfMonth;
  }
  
  // Create Date objects using UTC to avoid timezone issues
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
  
  // Format dates directly using our calculated values (avoids local timezone conversion issues)
  const startDateFormatted = `${String(startMonth).padStart(2, '0')}/${String(startDay).padStart(2, '0')}/${startYear}`;
  const endDateFormatted = `${String(endMonth).padStart(2, '0')}/${String(endDay).padStart(2, '0')}/${endYear}`;
  const startDateURL = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const endDateURL = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  
  console.log(`[getPast15DaysRangeForCostSync] Date Range: ${startDateFormatted} to ${endDateFormatted}`);
  
  return {
    startDate,
    endDate,
    startDateFormatted,
    endDateFormatted,
    startDateURL,
    endDateURL
  };
};

// Get current day range (today only)
export const getCurrentDayRange = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);
  
  return {
    startDate: today,
    endDate,
    startDateFormatted: formatDateForElocal(today),
    endDateFormatted: formatDateForElocal(today),
    startDateURL: formatDateForURL(today),
    endDateURL: formatDateForURL(today)
  };
};

// Get current day range with timezone logic (for CST timezone tracking)
// If it's after 12:00 AM IST (midnight), fetch previous day's data (because CST is behind IST)
// If it's 12:00 PM IST or later, fetch current day's data
// IMPORTANT: Uses direct date component manipulation to avoid timezone issues
export const getCurrentDayRangeWithTimezone = () => {
  // Get current time in IST timezone
  const now = new Date();
  
  // Get IST date components directly
  const istDateString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time string: format is "MM/DD/YYYY, HH:MM:SS"
  const istParts = istDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    // Fallback: use current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    return {
      startDate: today,
      endDate,
      startDateFormatted: formatDateForElocal(today),
      endDateFormatted: formatDateForElocal(today),
      startDateURL: formatDateForURL(today),
      endDateURL: formatDateForURL(today)
    };
  }
  
  // Extract IST components
  const monthIST = parseInt(istParts[1], 10);  // MM (1-12)
  const dayIST = parseInt(istParts[2], 10);     // DD
  const yearIST = parseInt(istParts[3], 10);    // YYYY
  let hoursIST = parseInt(istParts[4], 10);     // HH (0-23)
  
  // Handle edge case where hour is 24 (should be 0 for midnight)
  if (hoursIST === 24) {
    hoursIST = 0;
  }
  
  // Determine target date based on IST time
  // Logic: If it's between 12:00 AM (00:00) and 11:59 AM IST, fetch previous day
  //        If it's 12:00 PM (12:00) or later IST, fetch current day
  // 
  // Examples:
  // - Nov 25, 12:05 AM IST → fetch Nov 24 (yesterday)
  // - Nov 25, 3:05 AM IST → fetch Nov 24 (yesterday)
  // - Nov 25, 9:05 PM IST → fetch Nov 25 (today)
  
  let targetYear, targetMonth, targetDay;
  
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST, fetch previous day
    // Work directly with date components to avoid timezone issues
    if (dayIST > 1) {
      // Simple case: just subtract 1 from day
      targetYear = yearIST;
      targetMonth = monthIST;
      targetDay = dayIST - 1;
    } else {
      // Day is 1, need to go to previous month
      if (monthIST > 1) {
        // Go to previous month
        targetYear = yearIST;
        targetMonth = monthIST - 1;
        // Get last day of previous month
        const lastDayOfPrevMonth = new Date(Date.UTC(yearIST, monthIST - 1, 0)).getUTCDate();
        targetDay = lastDayOfPrevMonth;
      } else {
        // Month is January (1), go to December of previous year
        targetYear = yearIST - 1;
        targetMonth = 12;
        // Get last day of December
        const lastDayOfDec = new Date(Date.UTC(yearIST - 1, 12, 0)).getUTCDate();
        targetDay = lastDayOfDec;
      }
    }
  } else {
    // It's 12:00 PM (noon) or later IST, fetch current day
    targetYear = yearIST;
    targetMonth = monthIST;
    targetDay = dayIST;
  }
  
  // Create Date objects using UTC to avoid timezone issues
  const targetDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 23, 59, 59, 999));
  
  return {
    startDate: targetDate,
    endDate,
    startDateFormatted: formatDateForElocal(targetDate),
    endDateFormatted: formatDateForElocal(targetDate),
    startDateURL: formatDateForURL(targetDate),
    endDateURL: formatDateForURL(targetDate)
  };
};

// Get date range for Ringba sync based on IST timezone
// If it's after 12 AM IST (midnight), fetch previous day's data (because Ringba uses CST which is behind IST)
// If it's 12 PM IST or later, fetch current day's data
// IMPORTANT: Uses direct date component manipulation to avoid timezone issues
export const getRingbaSyncDateRange = () => {
  // Get current time in IST timezone
  const now = new Date();
  const istDateString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time string: format is "MM/DD/YYYY, HH:MM:SS"
  const istParts = istDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    // Fallback: use current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    return {
      startDate: today,
      endDate,
      startDateFormatted: formatDateForElocal(today),
      endDateFormatted: formatDateForElocal(today),
      startDateURL: formatDateForURL(today),
      endDateURL: formatDateForURL(today)
    };
  }
  
  // Extract IST components
  const monthIST = parseInt(istParts[1], 10);  // MM (1-12)
  const dayIST = parseInt(istParts[2], 10);     // DD
  const yearIST = parseInt(istParts[3], 10);    // YYYY
  let hoursIST = parseInt(istParts[4], 10);     // HH (0-23)
  
  // Handle edge case where hour is 24 (should be 0 for midnight)
  if (hoursIST === 24) {
    hoursIST = 0;
  }
  
  // Determine target date based on IST time
  // Logic: If it's between 12:00 AM (00:00) and 11:59 AM IST, fetch previous day
  //        If it's 12:00 PM (12:00) or later IST, fetch current day
  // 
  // Examples:
  // - Nov 25, 12:05 AM IST → fetch Nov 24 (yesterday)
  // - Nov 25, 3:05 AM IST → fetch Nov 24 (yesterday)
  // - Nov 25, 9:05 PM IST → fetch Nov 25 (today)
  
  let targetYear, targetMonth, targetDay;
  
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST, fetch previous day
    // Work directly with date components to avoid timezone issues
    if (dayIST > 1) {
      // Simple case: just subtract 1 from day
      targetYear = yearIST;
      targetMonth = monthIST;
      targetDay = dayIST - 1;
    } else {
      // Day is 1, need to go to previous month
      if (monthIST > 1) {
        // Go to previous month
        targetYear = yearIST;
        targetMonth = monthIST - 1;
        // Get last day of previous month
        const lastDayOfPrevMonth = new Date(Date.UTC(yearIST, monthIST - 1, 0)).getUTCDate();
        targetDay = lastDayOfPrevMonth;
      } else {
        // Month is January (1), go to December of previous year
        targetYear = yearIST - 1;
        targetMonth = 12;
        // Get last day of December
        const lastDayOfDec = new Date(Date.UTC(yearIST - 1, 12, 0)).getUTCDate();
        targetDay = lastDayOfDec;
      }
    }
  } else {
    // It's 12:00 PM (noon) or later IST, fetch current day
    targetYear = yearIST;
    targetMonth = monthIST;
    targetDay = dayIST;
  }
  
  // Create Date objects using UTC to avoid timezone issues
  const targetDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 23, 59, 59, 999));
  
  return {
    startDate: targetDate,
    endDate,
    startDateFormatted: formatDateForElocal(targetDate),
    endDateFormatted: formatDateForElocal(targetDate),
    startDateURL: formatDateForURL(targetDate),
    endDateURL: formatDateForURL(targetDate)
  };
};

// Format date for eLocal API (MM/DD/YYYY)
const formatDateForElocal = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

// Format date for URL (YYYY-MM-DD)
const formatDateForURL = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get human-readable date range description
export const getDateRangeDescription = (dateRange) => {
  const start = formatDateForElocal(dateRange.startDate);
  const end = formatDateForElocal(dateRange.endDate);
  if (start === end) {
    return start;
  }
  return `${start} to ${end}`;
};

// Get service schedule information
export const getServiceScheduleInfo = (serviceType) => {
  const info = {
    historical: {
      name: 'Historical Data Service',
      description: 'Scrapes past 15 days of data (excluding today, IST-aware)',
      schedule: 'Daily at 11:58 PM IST',
      category: 'STATIC'
    },
    current: {
      name: 'Current Day Service',
      description: 'Scrapes current day data (IST-aware)',
      schedule: 'Every 15 minutes',
      category: 'STATIC'
    },
    'historical-api': {
      name: 'Historical Data Service (API)',
      description: 'Scrapes past 15 days of API category data (excluding today, IST-aware)',
      schedule: 'Daily at 11:58 PM IST',
      category: 'API'
    },
    'current-api': {
      name: 'Current Day Service (API)',
      description: 'Scrapes current day API category data (IST-aware)',
      schedule: 'Every 15 minutes',
      category: 'API'
    }
  };
  
  return info[serviceType] || {
    name: 'Unknown Service',
    description: 'Service information not available',
    schedule: 'N/A',
    category: 'UNKNOWN'
  };
};

