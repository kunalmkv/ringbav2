import React from 'react';

const Header = ({ status, statusType, onRefresh, lastUpdated, currentPage, onPageChange }) => {
  const getStatusDotClass = () => {
    if (statusType === 'healthy') return 'healthy';
    if (statusType === 'error') return 'error';
    return '';
  };

  return (
    <header className="dashboard-header">
      <div className="header-content">
        <h1>📊 eLocal Scraper Dashboard</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={onRefresh}>
            🔄 Refresh
          </button>
          <div className="status-indicator">
            <span className={`status-dot ${getStatusDotClass()}`}></span>
            <span>{status || 'Loading...'}</span>
          </div>
        </div>
      </div>
      
      {/* Navigation Tabs */}
      <nav className="dashboard-nav">
        <button 
          className={`nav-tab ${currentPage === 'dashboard' ? 'active' : ''}`}
          onClick={() => onPageChange('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={`nav-tab ${currentPage === 'analysis' ? 'active' : ''}`}
          onClick={() => onPageChange('analysis')}
        >
          📈 Data Analysis
        </button>
        <button 
          className={`nav-tab ${currentPage === 'webhook' ? 'active' : ''}`}
          onClick={() => onPageChange('webhook')}
        >
          🔗 Webhook Tester
        </button>
      </nav>
    </header>
  );
};

export default Header;

