import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const PayoutComparison = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editModal, setEditModal] = useState({ isOpen: false, date: null, spend: 0, notes: '' });
  const [saving, setSaving] = useState(false);

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

  // Handle opening edit modal
  const handleEditClick = (date, currentSpend = 0, currentNotes = '') => {
    setEditModal({
      isOpen: true,
      date: date,
      spend: currentSpend || 0,
      notes: currentNotes || ''
    });
  };

  // Handle closing edit modal
  const handleCloseModal = () => {
    setEditModal({ isOpen: false, date: null, spend: 0, notes: '' });
  };

  // Handle saving Google Ads spend
  const handleSaveSpend = async () => {
    if (!editModal.date) return;
    
    setSaving(true);
    try {
      await api.saveGoogleAdsSpend(
        editModal.date,
        parseFloat(editModal.spend) || 0,
        editModal.notes || null
      );
      
      // Refresh data after saving
      await fetchData();
      handleCloseModal();
    } catch (err) {
      console.error('[PayoutComparison] Error saving Google Ads spend:', err);
      setError(`Failed to save Google Ads spend: ${err.message}`);
    } finally {
      setSaving(false);
    }
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
              <th colSpan="4" className="col-group">Revenue</th>
              <th rowSpan="2" className="col-amount">Raw Call</th>
              <th rowSpan="2" className="col-amount">RPC</th>
              <th rowSpan="2" className="col-amount">Google Ads Spend</th>
              <th rowSpan="2" className="col-amount">Telco</th>
              <th rowSpan="2" className="col-amount">Cost Per Call</th>
              <th rowSpan="2" className="col-amount">Net</th>
              <th rowSpan="2" className="col-amount">Net Profit</th>
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
              data.map((row, index) => {
                console.log(`[PayoutComparison] Rendering row ${index}:`, row.date);
                
                // All values are now pre-calculated from the database
                // No need to calculate anything in the frontend
                const rawCalls = row.total_calls || 0;
                const googleAdsSpend = parseFloat(row.google_ads_spend) || 0;
                const telco = parseFloat(row.telco) || 0;
                const costPerCall = parseFloat(row.cost_per_call) || 0;
                const net = parseFloat(row.net) || 0;
                const netProfit = parseFloat(row.net_profit) || 0;
                
                return (
                  <tr key={`${row.date}-${index}`} className={getRowClass(row.adjustments)}>
                    <td className="col-date">{formatDate(row.date)}</td>
                    <td className="col-amount">{formatCurrency(row.ringba_static)}</td>
                    <td className="col-amount">{formatCurrency(row.ringba_api)}</td>
                    <td className="col-amount">{formatCurrency(row.elocal_static)}</td>
                    <td className="col-amount">{formatCurrency(row.elocal_api)}</td>
                    <td className="col-amount">{formatCurrency(row.ringba_total)}</td>
                    <td className="col-amount">{formatCurrency(row.elocal_total)}</td>
                    <td className={`col-amount ${row.adjustments < 0 ? 'negative' : row.adjustments > 0 ? 'positive' : ''}`}>
                      {formatCurrency(row.adjustments)}
                    </td>
                    <td className="col-percentage">{formatPercentage(row.adjustment_static_pct)}</td>
                    <td className="col-percentage">{formatPercentage(row.adjustment_api_pct)}</td>
                    <td className={`col-percentage ${row.adjustment_pct < 0 ? 'negative' : row.adjustment_pct > 0 ? 'positive' : ''}`}>
                      {formatPercentage(row.adjustment_pct)}
                    </td>
                    <td className="col-amount">{rawCalls}</td>
                    <td className="col-amount">{formatCurrency(row.rpc)}</td>
                    <td className="col-amount col-google-ads">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        <span>{formatCurrency(googleAdsSpend)}</span>
                        <button
                          onClick={() => handleEditClick(row.date, row.google_ads_spend || 0, row.google_ads_notes || '')}
                          className="btn-edit-spend"
                          title="Edit Google Ads Spend"
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                    <td className="col-amount">{formatCurrency(telco)}</td>
                    <td className="col-amount">{formatCurrency(costPerCall)}</td>
                    <td className={`col-amount ${net < 0 ? 'negative' : net > 0 ? 'positive' : ''}`}>
                      {formatCurrency(net)}
                    </td>
                    <td className={`col-percentage ${netProfit < 0 ? 'negative' : netProfit > 0 ? 'positive' : ''}`}>
                      {formatPercentage(netProfit)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal for Google Ads Spend */}
      {editModal.isOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Google Ads Spend</h3>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Date:</label>
                <input
                  type="text"
                  value={formatDate(editModal.date)}
                  disabled
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Spend Amount ($):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editModal.spend}
                  onChange={(e) => setEditModal({ ...editModal, spend: e.target.value })}
                  className="form-input"
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Notes (optional):</label>
                <textarea
                  value={editModal.notes}
                  onChange={(e) => setEditModal({ ...editModal, notes: e.target.value })}
                  className="form-textarea"
                  placeholder="Add any notes about this spend..."
                  rows="3"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={handleCloseModal}
                className="btn btn-secondary"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSpend}
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PayoutComparison;

