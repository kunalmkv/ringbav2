// Date utility functions for scraping services

// Get past 10 days range (excluding today)
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
      description: 'Scrapes past 10 days of data (excluding today)',
      schedule: 'Daily at 2:00 AM',
      category: 'STATIC'
    },
    current: {
      name: 'Current Day Service',
      description: 'Scrapes current day data',
      schedule: 'Every 15 minutes',
      category: 'STATIC'
    },
    'historical-api': {
      name: 'Historical Data Service (API)',
      description: 'Scrapes past 10 days of API category data (excluding today)',
      schedule: 'Daily at 2:30 AM',
      category: 'API'
    },
    'current-api': {
      name: 'Current Day Service (API)',
      description: 'Scrapes current day API category data',
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

