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

  // Fetch data - Simplified with better error handling
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[PayoutComparison] ===== FETCHING DATA =====');
      console.log('[PayoutComparison] Start Date:', startDate || 'null');
      console.log('[PayoutComparison] End Date:', endDate || 'null');
      
      const result = await api.payoutComparison(startDate || null, endDate || null);
      console.log('[PayoutComparison] ===== API RESPONSE RECEIVED =====');
      console.log('[PayoutComparison] Full Response Object:', result);
      console.log('[PayoutComparison] Response Type:', typeof result);
      console.log('[PayoutComparison] Is result null?', result === null);
      console.log('[PayoutComparison] Is result undefined?', result === undefined);
      
      if (!result) {
        console.error('[PayoutComparison] ❌ Result is null or undefined!');
        setError('No data returned from API');
        setData([]);
        return;
      }
      
      console.log('[PayoutComparison] Has data property:', 'data' in result);
      console.log('[PayoutComparison] Result keys:', Object.keys(result));
      
      // Direct access to data array
      const dataArray = result?.data || [];
      console.log('[PayoutComparison] Data Array:', dataArray);
      console.log('[PayoutComparison] Data Array Type:', Array.isArray(dataArray));
      console.log('[PayoutComparison] Data Array Length:', dataArray.length);
      console.log('[PayoutComparison] Data Array is empty?', dataArray.length === 0);
      
      if (dataArray.length > 0) {
        console.log('[PayoutComparison] ✓ First Record:', JSON.stringify(dataArray[0], null, 2));
        console.log('[PayoutComparison] ✓ Setting data state with', dataArray.length, 'records');
        setData(dataArray);
        console.log('[PayoutComparison] ✓ Data state updated');
      } else {
        console.warn('[PayoutComparison] ⚠️ No data in array!');
        console.warn('[PayoutComparison] Result object:', JSON.stringify(result, null, 2));
        setData([]);
      }
      
      console.log('[PayoutComparison] ===== FETCH COMPLETE =====');
    } catch (err) {
      console.error('[PayoutComparison] ===== ERROR OCCURRED =====');
      console.error('[PayoutComparison] Error Type:', err.constructor.name);
      console.error('[PayoutComparison] Error Message:', err.message);
      console.error('[PayoutComparison] Error Stack:', err.stack);
      setError(err.message || 'Failed to fetch data');
      setData([]);
    } finally {
      setLoading(false);
      console.log('[PayoutComparison] Loading set to false');
    }
  };

  useEffect(() => {
    console.log('[PayoutComparison] useEffect triggered, fetching data...');
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

  // Debug: Log current state
  console.log('[PayoutComparison] Render - Current state:', {
    loading,
    error,
    dataLength: data.length,
    hasData: data.length > 0
  });

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

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{padding: '10px', background: '#f0f0f0', margin: '10px 0', fontSize: '12px'}}>
          <strong>Debug:</strong> Loading: {loading ? 'Yes' : 'No'}, 
          Error: {error || 'None'}, 
          Data: {data.length} records
        </div>
      )}

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
            {loading ? (
              <tr>
                <td colSpan="13" className="no-data">Loading data...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="13" className="no-data" style={{color: 'red'}}>
                  Error: {error}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan="13" className="no-data">No data available</td>
              </tr>
            ) : (
              data.map((row, index) => {
                console.log(`[PayoutComparison] Rendering row ${index}:`, row.date);
                return (
                  <tr key={`${row.date}-${index}`} className={getRowClass(row.adjustments)}>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default PayoutComparison;

