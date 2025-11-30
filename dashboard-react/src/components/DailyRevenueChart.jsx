import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { formatCurrency } from '../utils/formatters';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Check if Chart.js is available
const isChartJSReady = () => {
  try {
    return typeof ChartJS !== 'undefined' && ChartJS.registry !== undefined;
  } catch (e) {
    return false;
  }
};

const DailyRevenueChart = ({ data, showLast15Days = true }) => {
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    // Ensure Chart.js is ready before rendering
    if (isChartJSReady()) {
      setChartReady(true);
    } else {
      // Retry after a short delay
      const timer = setTimeout(() => {
        if (isChartJSReady()) {
          setChartReady(true);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // If no data or empty data, don't render
  if (!data || data.length === 0) {
    return <div className="no-data">No data available for chart.</div>;
  }

  // Wait for Chart.js to be ready
  if (!chartReady) {
    return <div className="loading">Loading chart...</div>;
  }

  try {
    // Validate and filter out invalid data
    const validData = data.filter(row => {
      if (!row) return false;
      // Check for date field (could be 'date' or 'comparison_date')
      const dateValue = row.date || row.comparison_date;
      return dateValue && dateValue !== '';
    });

    if (validData.length === 0) {
      return <div className="no-data">No valid data available for chart.</div>;
    }

    // Sort data by date (oldest to newest)
    const sortedData = [...validData].sort((a, b) => {
      try {
        const dateAValue = a.date || a.comparison_date || '';
        const dateBValue = b.date || b.comparison_date || '';
        const dateA = dateAValue ? new Date(dateAValue + 'T00:00:00') : new Date(0);
        const dateB = dateBValue ? new Date(dateBValue + 'T00:00:00') : new Date(0);
        return dateA.getTime() - dateB.getTime();
      } catch (e) {
        console.error('Error sorting dates:', e, a, b);
        return 0;
      }
    });

    // If showLast15Days is true and we have more than 15 days, show only last 15
    // Otherwise, show all data (useful when date filtering is applied)
    const displayData = showLast15Days && sortedData.length > 15 
      ? sortedData.slice(-15) 
      : sortedData;

    if (displayData.length === 0) {
      return <div className="no-data">No data to display after filtering.</div>;
    }

    // Chart data for Daily Revenue Comparison
    const dailyRevenueComparisonData = {
      labels: displayData.map(row => {
        try {
          // Handle date format - could be 'date' or 'comparison_date' field
          const dateValue = row.date || row.comparison_date;
          if (!dateValue) {
            console.warn('No date field found in row:', row);
            return 'Invalid Date';
          }
          
          // Handle date format - could be YYYY-MM-DD string or Date object
          let date;
          if (typeof dateValue === 'string') {
            date = new Date(dateValue + 'T00:00:00'); // Add time to avoid timezone issues
          } else if (dateValue instanceof Date) {
            date = dateValue;
          } else {
            date = new Date(dateValue);
          }
          
          if (isNaN(date.getTime())) {
            console.warn('Invalid date:', dateValue);
            return 'Invalid Date';
          }
          
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch (e) {
          console.error('Error formatting date:', e, row);
          return 'Invalid Date';
        }
      }),
      datasets: [
        {
          label: 'Ringba Revenue',
          data: displayData.map(row => {
            try {
              // Use pre-calculated ringba_total from database if available
              if (row.ringba_total !== undefined && row.ringba_total !== null) {
                const total = parseFloat(row.ringba_total);
                return isNaN(total) ? 0 : total;
              }
              // Fallback: Calculate Ringba total: ringba_static + ringba_api
              const ringbaStatic = parseFloat(row.ringba_static || 0) || 0;
              const ringbaApi = parseFloat(row.ringba_api || 0) || 0;
              return ringbaStatic + ringbaApi;
            } catch (e) {
              console.error('Error calculating Ringba revenue:', e, row);
              return 0;
            }
          }),
          backgroundColor: 'rgba(37, 99, 235, 0.8)', // Blue for Ringba
          borderColor: 'rgba(37, 99, 235, 1)',
          borderWidth: 1
        },
        {
          label: 'Elocal Revenue',
          data: displayData.map(row => {
            try {
              // Use pre-calculated elocal_total from database if available
              if (row.elocal_total !== undefined && row.elocal_total !== null) {
                const total = parseFloat(row.elocal_total);
                return isNaN(total) ? 0 : total;
              }
              // Fallback: Calculate Elocal total: elocal_static + elocal_api
              const elocalStatic = parseFloat(row.elocal_static || 0) || 0;
              const elocalApi = parseFloat(row.elocal_api || 0) || 0;
              return elocalStatic + elocalApi;
            } catch (e) {
              console.error('Error calculating Elocal revenue:', e, row);
              return 0;
            }
          }),
          backgroundColor: 'rgba(16, 185, 129, 0.8)', // Green for Elocal
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1
        }
      ]
    };

    // Chart options
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              const value = context.parsed.y || 0;
              label += formatCurrency(value);
              return label;
            },
            title: function(context) {
              return context[0].label;
            }
          }
        },
        title: {
          display: false // Title is handled by parent component
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCurrency(value);
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    };

    return (
      <div className="daily-revenue-chart-container">
        <div className="chart-wrapper">
          <Bar data={dailyRevenueComparisonData} options={chartOptions} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering DailyRevenueChart:', error);
    return (
      <div className="error" style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem' }}>
        <p>Error rendering chart: {error.message}</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Please check the browser console for more details.</p>
      </div>
    );
  }
};

export default DailyRevenueChart;

