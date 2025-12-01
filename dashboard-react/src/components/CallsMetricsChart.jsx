import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
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

const CallsMetricsChart = ({ data, showLast15Days = true }) => {
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
      // Check for date field
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

    // Chart data for Calls Metrics
    const callsMetricsData = {
      labels: displayData.map(row => {
        try {
          // Handle date format
          const dateValue = row.date || row.comparison_date;
          if (!dateValue) {
            console.warn('No date field found in row:', row);
            return 'Invalid Date';
          }
          
          let date;
          if (typeof dateValue === 'string') {
            date = new Date(dateValue + 'T00:00:00');
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
          label: 'Total Calls',
          data: displayData.map(row => parseInt(row.total_calls || 0) || 0),
          backgroundColor: 'rgba(59, 130, 246, 0.8)', // Blue
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Connected Calls',
          data: displayData.map(row => parseInt(row.connected_calls || 0) || 0),
          backgroundColor: 'rgba(16, 185, 129, 0.8)', // Green
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Completed Calls',
          data: displayData.map(row => parseInt(row.completed_calls || 0) || 0),
          backgroundColor: 'rgba(245, 158, 11, 0.8)', // Amber
          borderColor: 'rgba(245, 158, 11, 1)',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Chargebacks',
          data: displayData.map(row => parseInt(row.chargebacks_count || 0) || 0),
          backgroundColor: 'rgba(239, 68, 68, 0.8)', // Red
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1,
          yAxisID: 'y',
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
              label += value.toLocaleString(); // Format number with commas
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
              return value.toLocaleString(); // Format numbers with commas
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
      <div className="calls-metrics-chart-container">
        <div className="chart-wrapper">
          <Bar data={callsMetricsData} options={chartOptions} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error rendering CallsMetricsChart:', error);
    return (
      <div className="error" style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem' }}>
        <p>Error rendering chart: {error.message}</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Please check the browser console for more details.</p>
      </div>
    );
  }
};

export default CallsMetricsChart;

