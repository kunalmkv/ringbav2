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
export const getCurrentDayRangeWithTimezone = () => {
  // Get current time in IST timezone
  const now = new Date();
  
  // Use a more reliable method to get IST hours
  // Convert current UTC time to IST (IST is UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  const hoursIST = istTime.getUTCHours();
  
  // Alternative: Get IST time string and parse it
  // Some locales may return "24" for midnight, so we handle that
  const istTimeString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time to get hours (handle "24" as "00")
  const istParts = istTimeString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  let parsedHoursIST = hoursIST; // Default to calculated hours
  
  if (istParts) {
    let parsedHour = parseInt(istParts[4], 10);
    // Handle edge case where hour is 24 (should be 0 for midnight)
    if (parsedHour === 24) {
      parsedHour = 0;
    }
    // Use parsed hour if it's valid (0-23)
    if (parsedHour >= 0 && parsedHour <= 23) {
      parsedHoursIST = parsedHour;
    }
  }
  
  // Get the date to fetch based on IST time
  // If it's after 12:00 AM IST (00:00) and before 12:00 PM IST (12:00), fetch previous day
  // because CST is behind IST by ~11-12 hours
  // If it's 12:00 PM IST (12:00) or later, fetch current day
  let targetDate;
  if (parsedHoursIST >= 0 && parsedHoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST, fetch previous day
    // (because in CST it's still the previous day)
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
  } else {
    // It's 12:00 PM (noon) or later IST, fetch current day
    targetDate = new Date();
  }
  
  // Set to start of day
  targetDate.setHours(0, 0, 0, 0);
  
  // End of day
  const endDate = new Date(targetDate);
  endDate.setHours(23, 59, 59, 999);
  
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
export const getRingbaSyncDateRange = () => {
  // Get current time in IST timezone
  const now = new Date();
  const istTimeString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time to get hours
  const istParts = istTimeString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
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
  
  const hoursIST = parseInt(istParts[4], 10);
  
  // Get the date to fetch based on IST time
  // If it's after 12 AM IST (00:00) and before 12 PM IST (12:00), fetch previous day
  // because CST is behind IST by ~11-12 hours
  // If it's 12 PM IST (12:00) or later, fetch current day
  let targetDate;
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST, fetch previous day
    // (because in CST it's still the previous day)
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
  } else {
    // It's 12:00 PM (noon) or later IST, fetch current day
    targetDate = new Date();
  }
  
  // Set to start of day
  targetDate.setHours(0, 0, 0, 0);
  
  // End of day
  const endDate = new Date(targetDate);
  endDate.setHours(23, 59, 59, 999);
  
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

