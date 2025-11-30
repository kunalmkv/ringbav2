import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import AdjustmentsChart from './AdjustmentsChart';
import DailyRevenueChart from './DailyRevenueChart';

const DataAnalysis = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Set default date range to last 15 days
  useEffect(() => {
    const today = new Date();
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(today.getDate() - 15);
    
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    setEndDate(formatDate(today));
    setStartDate(formatDate(fifteenDaysAgo));
  }, []);

  // Fetch data
  const fetchData = async () => {
    if (!startDate || !endDate) {
      console.log('[DataAnalysis] Skipping fetch - dates not set:', { startDate, endDate });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('[DataAnalysis] Fetching data...', { startDate, endDate });
      
      const result = await api.payoutComparison(startDate || null, endDate || null);
      
      console.log('[DataAnalysis] API Response:', result);
      
      if (!result) {
        setError('No data returned from API');
        setData([]);
        return;
      }
      
      const dataArray = result?.data || [];
      console.log('[DataAnalysis] Data Array Length:', dataArray.length);
      
      if (dataArray.length > 0) {
        // Ensure each row has a date field for charts
        const processedData = dataArray.map(row => ({
          ...row,
          date: row.date || row.comparison_date || null
        }));
        setData(processedData);
        console.log('[DataAnalysis] Sample data:', processedData[0]);
      } else {
        setData([]);
      }
    } catch (err) {
      console.error('[DataAnalysis] Error:', err);
      setError(err.message || 'Failed to fetch data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    } else {
      // If dates aren't set yet, stop loading
      setLoading(false);
    }
  }, [startDate, endDate]); // Run when dates are set

  const handleDateFilter = () => {
    if (startDate && endDate) {
      fetchData();
    } else {
      setError('Please select both start and end dates');
    }
  };

  const handleRefresh = () => {
    fetchData();
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  if (loading && data.length === 0) {
    return (
      <section className="section data-analysis-section">
        <h2>📈 Data Analysis</h2>
        <div className="loading">Loading data analysis...</div>
      </section>
    );
  }

  if (error && data.length === 0) {
    return (
      <section className="section data-analysis-section">
        <h2>📈 Data Analysis</h2>
        <div className="error">Error: {error}</div>
        <button onClick={handleRefresh} className="btn-refresh">Retry</button>
      </section>
    );
  }

  return (
    <section className="section data-analysis-section">
      <div className="section-header">
        <h2>📈 Data Analysis</h2>
        <div className="section-controls">
          <div className="date-filters">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Start Date"
              className="date-input"
            />
            <span className="date-separator">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End Date"
              className="date-input"
            />
            <button onClick={handleDateFilter} className="btn-filter">Filter</button>
            <button onClick={handleRefresh} className="btn-refresh">Refresh</button>
          </div>
        </div>
      </div>

      {error && data.length > 0 && (
        <div className="error" style={{marginBottom: '1rem', padding: '0.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem'}}>
          Warning: {error}
        </div>
      )}

      {/* Charts Grid */}
      {data.length > 0 ? (
        <div className="charts-grid">
          {/* Adjustments Over Time Chart */}
          <div className="chart-section chart-wide">
            <h3>
              Adjustments Over Time
              {data.length <= 15 ? ` (${data.length} Days)` : ' (Last 15 Days)'}
            </h3>
            <p className="chart-description">
              Shows the difference between Ringba and Elocal payouts. 
              <span style={{color: '#ef4444'}}> Red bars</span> indicate losses (Ringba &gt; Elocal), 
              <span style={{color: '#10b981'}}> green bars</span> indicate gains (Ringba &lt; Elocal).
              {startDate && endDate && (
                <span> Date range: {formatDate(startDate)} to {formatDate(endDate)}</span>
              )}
            </p>
            {loading ? (
              <div className="loading">Loading chart...</div>
            ) : (
              <AdjustmentsChart data={data} showLast15Days={data.length > 15} />
            )}
          </div>

          {/* Daily Revenue Comparison Chart */}
          <div className="chart-section chart-wide">
            <h3>
              Daily Revenue Comparison
              {data.length <= 15 ? ` (${data.length} Days)` : ' (Last 15 Days)'}
            </h3>
            <p className="chart-description">
              Compares daily revenue between Ringba and Elocal. 
              <span style={{color: '#2563eb'}}> Blue bars</span> represent Ringba revenue, 
              <span style={{color: '#10b981'}}> green bars</span> represent Elocal revenue.
              {startDate && endDate && (
                <span> Date range: {formatDate(startDate)} to {formatDate(endDate)}</span>
              )}
            </p>
            {loading ? (
              <div className="loading">Loading chart...</div>
            ) : (
              <DailyRevenueChart data={data} showLast15Days={data.length > 15} />
            )}
          </div>
        </div>
      ) : (
        <div className="no-data">
          <p>No data available for the selected date range.</p>
          <p>Please adjust the date filters and try again.</p>
        </div>
      )}

      {/* Summary Statistics */}
      {data.length > 0 && (
        <div className="analysis-summary">
          <h3>Summary Statistics</h3>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-label">Total Days</div>
              <div className="summary-value">{data.length}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Adjustments</div>
              <div className="summary-value">
                ${data.reduce((sum, row) => {
                  const adjustment = parseFloat(row.adjustments || 0);
                  return sum + adjustment;
                }, 0).toFixed(2)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Average Daily Adjustment</div>
              <div className="summary-value">
                ${(data.reduce((sum, row) => {
                  const adjustment = parseFloat(row.adjustments || 0);
                  return sum + adjustment;
                }, 0) / data.length).toFixed(2)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Days with Gains</div>
              <div className="summary-value" style={{color: '#10b981'}}>
                {data.filter(row => parseFloat(row.adjustments || 0) < 0).length}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Days with Losses</div>
              <div className="summary-value" style={{color: '#ef4444'}}>
                {data.filter(row => parseFloat(row.adjustments || 0) > 0).length}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DataAnalysis;

