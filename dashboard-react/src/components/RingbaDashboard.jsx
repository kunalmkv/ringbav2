import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { formatDate as formatDateUtil } from '../utils/formatters';

const RingbaDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [campaignName, setCampaignName] = useState('');

  // Format date to human-readable format (e.g., "Nov 21, 2025")
  // Handles YYYY-MM-DD format from database by adding time to avoid timezone issues
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      // If it's already in YYYY-MM-DD format, add time to avoid timezone shifts
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const date = new Date(dateStr + 'T00:00:00');
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
      // Fallback to utility formatter for other formats
      return formatDateUtil(dateStr);
    } catch (error) {
      return formatDateUtil(dateStr);
    }
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '$0.00';
    const num = parseFloat(value);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  };

  // Format percentage
  const formatPercentage = (value) => {
    if (value === null || value === undefined) return '0.00%';
    const num = parseFloat(value);
    if (isNaN(num)) return '0.00%';
    return `${num.toFixed(2)}%`;
  };

  // Format number
  const formatNumber = (value) => {
    if (value === null || value === undefined) return '0';
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    return num.toLocaleString();
  };

  // Format duration (seconds to MM:SS)
  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[RingbaDashboard] Fetching data...', { startDate, endDate, campaignName });
      const result = await api.getRingbaCampaignSummary(
        startDate || null,
        endDate || null,
        campaignName || null
      );
      
      console.log('[RingbaDashboard] API Response:', result);
      
      if (!result) {
        setError('No data returned from API');
        setData([]);
        return;
      }
      
      const dataArray = result?.data || [];
      console.log('[RingbaDashboard] Data Array Length:', dataArray.length);
      
      if (dataArray.length > 0) {
        setData(dataArray);
      } else {
        setData([]);
      }
    } catch (err) {
      console.error('[RingbaDashboard] Error:', err);
      setError(err.message || 'Failed to fetch data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    fetchData();
  };

  const handleDateFilter = () => {
    fetchData();
  };

  // Get unique campaign names for filter
  const uniqueCampaigns = [...new Set(data.map(row => row.campaign_name).filter(Boolean))].sort();

  if (loading && data.length === 0) {
    return (
      <section className="section ringba-dashboard-section">
        <h2>📊 Ringba Dashboard</h2>
        <div className="loading">Loading Ringba campaign summary data...</div>
      </section>
    );
  }

  if (error && data.length === 0) {
    return (
      <section className="section ringba-dashboard-section">
        <h2>📊 Ringba Dashboard</h2>
        <div className="error">Error: {error}</div>
        <button onClick={handleRefresh} className="btn-refresh">Retry</button>
      </section>
    );
  }

  return (
    <section className="section ringba-dashboard-section">
      <div className="section-header">
        <h2>📊 Ringba Dashboard</h2>
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
            <select
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="campaign-select"
            >
              <option value="">All Campaigns</option>
              {uniqueCampaigns.map(campaign => (
                <option key={campaign} value={campaign}>{campaign}</option>
              ))}
            </select>
            <button onClick={handleDateFilter} className="btn-filter">Filter</button>
            <button onClick={handleRefresh} className="btn-refresh">Refresh</button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="ringba-dashboard-table">
          <thead>
            <tr>
              <th className="col-date">Date</th>
              <th className="col-number">Total Calls</th>
              <th className="col-number">Connected</th>
              <th className="col-percentage">Conn Rate</th>
              <th className="col-number">Completed</th>
              <th className="col-percentage">Comp Rate</th>
              <th className="col-currency">Revenue</th>
              <th className="col-currency">Payout</th>
              <th className="col-currency">RPC</th>
              <th className="col-currency">Total Cost</th>
              <th className="col-currency">Telco</th>
              <th className="col-percentage">Margin</th>
              <th className="col-percentage">Conv Rate</th>
              <th className="col-number">No Conn</th>
              <th className="col-number">Duplicates</th>
              <th className="col-number">Root Calls</th>
              <th className="col-duration">Call Length</th>
              <th className="col-currency">Ads Spend</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="18" className="no-data">Loading data...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="18" className="no-data" style={{color: 'red'}}>
                  Error: {error}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan="18" className="no-data">No data available</td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr key={`${row.id}-${index}`}>
                  <td className="col-date">{formatDate(row.summary_date)}</td>
                  <td className="col-number">{formatNumber(row.total_calls)}</td>
                  <td className="col-number">{formatNumber(row.connected_calls || 0)}</td>
                  <td className="col-percentage">{formatPercentage(row.connection_rate || 0)}</td>
                  <td className="col-number">{formatNumber(row.completed_calls || 0)}</td>
                  <td className="col-percentage">{formatPercentage(row.completion_rate || 0)}</td>
                  <td className="col-currency">{formatCurrency(row.revenue)}</td>
                  <td className="col-currency">{formatCurrency(row.payout)}</td>
                  <td className="col-currency">{formatCurrency(row.rpc)}</td>
                  <td className="col-currency">{formatCurrency(row.total_cost)}</td>
                  <td className="col-currency">{formatCurrency(row.telco || row.insights_total_cost || 0)}</td>
                  <td className="col-percentage">{formatPercentage(row.margin)}</td>
                  <td className="col-percentage">{formatPercentage(row.conversion_rate)}</td>
                  <td className="col-number">{formatNumber(row.no_connections)}</td>
                  <td className="col-number">{formatNumber(row.duplicates)}</td>
                  <td className="col-number">{formatNumber(row.root_calls || row.total_calls || 0)}</td>
                  <td className="col-duration">{formatDuration(row.total_call_length_seconds || 0)}</td>
                  <td className="col-currency">{formatCurrency(row.google_ads_spend || 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default RingbaDashboard;

