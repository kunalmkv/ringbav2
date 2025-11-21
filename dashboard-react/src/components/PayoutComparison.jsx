import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const PayoutComparison = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Format date from YYYY-MM-DD to DD/MM/YYYY
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
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

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.payoutComparison(startDate || null, endDate || null);
      setData(result.data || []);
    } catch (err) {
      console.error('Error fetching payout comparison:', err);
      setError(err.message);
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

  // Get row class based on adjustments
  const getRowClass = (adjustments) => {
    const adj = parseFloat(adjustments) || 0;
    if (adj < 0) return 'row-negative';
    if (adj > 0) return 'row-positive';
    return '';
  };

  if (loading && data.length === 0) {
    return (
      <section className="section payout-comparison-section">
        <h2>💰 Payout Comparison</h2>
        <div className="loading">Loading payout comparison data...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section payout-comparison-section">
        <h2>💰 Payout Comparison</h2>
        <div className="error">Error: {error}</div>
        <button onClick={handleRefresh} className="btn-refresh">Retry</button>
      </section>
    );
  }

  return (
    <section className="section payout-comparison-section">
      <div className="section-header">
        <h2>💰 Payout Comparison</h2>
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

      <div className="table-container">
        <table className="payout-comparison-table">
          <thead>
            <tr>
              <th rowSpan="2" className="col-date">DATE</th>
              <th colSpan="2" className="col-group">RINGBA</th>
              <th colSpan="2" className="col-group">E-Local</th>
              <th rowSpan="2" className="col-total">Ringba Total</th>
              <th rowSpan="2" className="col-total">Elocal Total</th>
              <th rowSpan="2" className="col-amount">Raw Call</th>
              <th rowSpan="2" className="col-amount">RPC</th>
              <th colSpan="4" className="col-group">Revenue</th>
            </tr>
            <tr>
              <th className="col-sub">Static</th>
              <th className="col-sub">API</th>
              <th className="col-sub">Static</th>
              <th className="col-sub">API</th>
              <th className="col-sub">Adjustments</th>
              <th className="col-sub">Adjustment (Static)</th>
              <th className="col-sub">Adjustment (API)</th>
              <th className="col-sub">Adjustment %</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan="13" className="no-data">No data available</td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr key={row.date} className={getRowClass(row.adjustments)}>
                  <td className="col-date">{formatDate(row.date)}</td>
                  <td className="col-amount">{formatCurrency(row.ringba_static)}</td>
                  <td className="col-amount">{formatCurrency(row.ringba_api)}</td>
                  <td className="col-amount">{formatCurrency(row.elocal_static)}</td>
                  <td className="col-amount">{formatCurrency(row.elocal_api)}</td>
                  <td className="col-amount">{formatCurrency(row.ringba_total)}</td>
                  <td className="col-amount">{formatCurrency(row.elocal_total)}</td>
                  <td className="col-amount">{row.total_calls || 0}</td>
                  <td className="col-amount">{formatCurrency(row.rpc)}</td>
                  <td className={`col-amount ${row.adjustments < 0 ? 'negative' : row.adjustments > 0 ? 'positive' : ''}`}>
                    {formatCurrency(row.adjustments)}
                  </td>
                  <td className="col-percentage">{formatPercentage(row.adjustment_static_pct)}</td>
                  <td className="col-percentage">{formatPercentage(row.adjustment_api_pct)}</td>
                  <td className={`col-percentage ${row.adjustment_pct < 0 ? 'negative' : row.adjustment_pct > 0 ? 'positive' : ''}`}>
                    {formatPercentage(row.adjustment_pct)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default PayoutComparison;

