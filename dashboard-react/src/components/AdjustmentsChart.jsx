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
import { formatCurrency, formatDate } from '../utils/formatters';

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

const AdjustmentsChart = ({ data, showLast15Days = true }) => {
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

    // Chart data for Adjustments Over Time
    const adjustmentsOverTimeData = {
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
        label: 'Adjustments ($)',
        data: displayData.map(row => {
          try {
            // Use existing adjustments field if available (pre-calculated from database)
            if (row.adjustments !== undefined && row.adjustments !== null) {
              const adj = parseFloat(row.adjustments);
              return isNaN(adj) ? 0 : adj;
            }
            // Fallback: Calculate adjustment: Ringba Total - Elocal Total
            const ringbaTotal = parseFloat(row.ringba_total || 0) || 0;
            const elocalTotal = parseFloat(row.elocal_total || 0) || 0;
            return ringbaTotal - elocalTotal;
          } catch (e) {
            console.error('Error calculating adjustment:', e, row);
            return 0;
          }
        }),
        backgroundColor: displayData.map(row => {
          try {
            // Get adjustment value (pre-calculated from database)
            let adjustment;
            if (row.adjustments !== undefined && row.adjustments !== null) {
              adjustment = parseFloat(row.adjustments || 0) || 0;
            } else {
              // Fallback: Calculate if not available
              const ringbaTotal = parseFloat(row.ringba_total || 0) || 0;
              const elocalTotal = parseFloat(row.elocal_total || 0) || 0;
              adjustment = ringbaTotal - elocalTotal;
            }
            // Red for losses (positive adjustments = we pay more to Ringba)
            // Green for gains (negative adjustments = we pay less to Ringba)
            return adjustment >= 0 
              ? 'rgba(239, 68, 68, 0.8)'  // Red for losses
              : 'rgba(16, 185, 129, 0.8)'; // Green for gains
          } catch (e) {
            console.error('Error calculating color:', e, row);
            return 'rgba(128, 128, 128, 0.8)'; // Gray fallback
          }
        }),
        borderColor: displayData.map(row => {
          try {
            // Get adjustment value (pre-calculated from database)
            let adjustment;
            if (row.adjustments !== undefined && row.adjustments !== null) {
              adjustment = parseFloat(row.adjustments || 0) || 0;
            } else {
              // Fallback: Calculate if not available
              const ringbaTotal = parseFloat(row.ringba_total || 0) || 0;
              const elocalTotal = parseFloat(row.elocal_total || 0) || 0;
              adjustment = ringbaTotal - elocalTotal;
            }
            return adjustment >= 0 
              ? 'rgba(239, 68, 68, 1)'
              : 'rgba(16, 185, 129, 1)';
          } catch (e) {
            console.error('Error calculating border color:', e, row);
            return 'rgba(128, 128, 128, 1)'; // Gray fallback
          }
        }),
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
        display: false, // Hide legend since we only have one dataset
        position: 'bottom',
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
            let label = context.label || '';
            if (label) {
              label += ': ';
            }
            const value = context.parsed.y || 0;
            label += formatCurrency(value);
            
            // Add context about gain/loss
            if (value > 0) {
              label += ' (Loss)';
            } else if (value < 0) {
              label += ' (Gain)';
            }
            
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
        beginAtZero: false, // Allow negative values
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
      <div className="adjustments-chart-container">
        <div className="chart-wrapper">
          <Bar data={adjustmentsOverTimeData} options={chartOptions} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering AdjustmentsChart:', error);
    return (
      <div className="error" style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem' }}>
        <p>Error rendering chart: {error.message}</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Please check the browser console for more details.</p>
      </div>
    );
  }
};

export default AdjustmentsChart;

