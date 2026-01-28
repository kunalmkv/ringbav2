import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const WebhookTester = () => {
  const [webhookId, setWebhookId] = useState('');
  const [webhookRequests, setWebhookRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [availableWebhooks, setAvailableWebhooks] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // Get base URL for webhook
  const getWebhookUrl = (id) => {
    const baseUrl = window.location.origin;
    const basePath = window.location.pathname.includes('/ringba-sync-dashboard') 
      ? '/ringba-sync-dashboard' 
      : '';
    return `${baseUrl}${basePath}/webhook/${id}`;
  };

  // Load available webhooks
  useEffect(() => {
    loadAvailableWebhooks();
  }, []);

  // Auto-refresh logic
  useEffect(() => {
    if (autoRefresh && webhookId) {
      const interval = setInterval(() => {
        loadWebhookRequests(webhookId);
      }, 3000); // Refresh every 3 seconds
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  }, [autoRefresh, webhookId]);

  const loadAvailableWebhooks = async () => {
    try {
      const response = await api.getWebhooks();
      setAvailableWebhooks(response.data || []);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    }
  };

  const loadWebhookRequests = async (id) => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.getWebhookRequests(id, 100, 0);
      setWebhookRequests(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load webhook requests');
      console.error('Failed to load webhook requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleWebhookIdChange = (e) => {
    const newId = e.target.value;
    setWebhookId(newId);
    if (newId) {
      loadWebhookRequests(newId);
    } else {
      setWebhookRequests([]);
    }
  };

  const handleRefresh = () => {
    if (webhookId) {
      loadWebhookRequests(webhookId);
      loadAvailableWebhooks();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const formatJson = (obj) => {
    if (!obj) return '{}';
    if (typeof obj === 'string') {
      try {
        return JSON.stringify(JSON.parse(obj), null, 2);
      } catch {
        return obj;
      }
    }
    return JSON.stringify(obj, null, 2);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="webhook-tester">
      <div className="webhook-header">
        <h2>🔗 Webhook Tester</h2>
        <p>Test webhook endpoints and view incoming requests</p>
      </div>

      <div className="webhook-controls">
        <div className="webhook-input-group">
          <label htmlFor="webhook-id">Webhook ID:</label>
          <div className="input-with-suggestions">
            <input
              id="webhook-id"
              type="text"
              value={webhookId}
              onChange={handleWebhookIdChange}
              placeholder="Enter webhook ID (e.g., 698f93990257b3f4)"
              className="webhook-input"
            />
            {availableWebhooks.length > 0 && (
              <select
                className="webhook-select"
                onChange={(e) => {
                  if (e.target.value) {
                    setWebhookId(e.target.value);
                    loadWebhookRequests(e.target.value);
                  }
                }}
                value=""
              >
                <option value="">Select existing webhook...</option>
                {availableWebhooks.map(wh => (
                  <option key={wh.webhook_id} value={wh.webhook_id}>
                    {wh.webhook_id} ({wh.request_count} requests)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {webhookId && (
          <div className="webhook-url-section">
            <label>Webhook URL:</label>
            <div className="url-display">
              <code className="webhook-url">{getWebhookUrl(webhookId)}</code>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => copyToClipboard(getWebhookUrl(webhookId))}
              >
                📋 Copy URL
              </button>
            </div>
            <div className="webhook-example">
              <p><strong>Example cURL command:</strong></p>
              <pre className="curl-example">
{`curl -X POST "${getWebhookUrl(webhookId)}" \\
     -H "Content-Type: application/json" \\
     -d '{
           "customer_id": "user_900",
           "event_name": "user_signup",
           "email": "lucas.jones01@example.com",
           "timestamp": "2026-01-27T10:00:00Z",
           "plan_type": "Free"
         }'`}
              </pre>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => {
                  const curlCmd = `curl -X POST "${getWebhookUrl(webhookId)}" \\
     -H "Content-Type: application/json" \\
     -d '{
           "customer_id": "user_900",
           "event_name": "user_signup",
           "email": "lucas.jones01@example.com",
           "timestamp": "2026-01-27T10:00:00Z",
           "plan_type": "Free"
         }'`;
                  copyToClipboard(curlCmd);
                }}
              >
                📋 Copy cURL
              </button>
            </div>
          </div>
        )}

        <div className="webhook-actions">
          <button
            className="btn btn-primary"
            onClick={handleRefresh}
            disabled={!webhookId || loading}
          >
            🔄 Refresh
          </button>
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              disabled={!webhookId}
            />
            <span>Auto-refresh (3s)</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ Error: {error}
        </div>
      )}

      {webhookId && (
        <div className="webhook-requests">
          <h3>Received Requests ({webhookRequests.length})</h3>
          
          {loading && <div className="loading">Loading...</div>}
          
          {!loading && webhookRequests.length === 0 && (
            <div className="no-requests">
              <p>No requests received yet. Send a request to the webhook URL above.</p>
            </div>
          )}

          {!loading && webhookRequests.length > 0 && (
            <div className="requests-list">
              {webhookRequests.map((request) => (
                <div key={request.id} className="request-card">
                  <div className="request-header">
                    <div className="request-meta">
                      <span className={`request-method method-${request.method}`}>{request.method}</span>
                      <span className="request-id">ID: {request.id}</span>
                      <span className="request-time">{formatTimestamp(request.created_at)}</span>
                    </div>
                    <div className="request-info">
                      <span className="request-ip">IP: {request.ip_address}</span>
                    </div>
                  </div>

                  <div className="request-body-section">
                    <h4>Request Body:</h4>
                    <pre className="json-display">
                      {formatJson(request.request_body)}
                    </pre>
                  </div>

                  {request.query_params && Object.keys(request.query_params).length > 0 && (
                    <div className="request-query-section">
                      <h4>Query Parameters:</h4>
                      <pre className="json-display">
                        {formatJson(request.query_params)}
                      </pre>
                    </div>
                  )}

                  <div className="request-headers-section">
                    <h4>Headers:</h4>
                    <pre className="json-display">
                      {formatJson(request.headers)}
                    </pre>
                  </div>

                  {request.user_agent && (
                    <div className="request-user-agent">
                      <strong>User-Agent:</strong> {request.user_agent}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!webhookId && (
        <div className="webhook-placeholder">
          <p>Enter a webhook ID above to start testing.</p>
        </div>
      )}
    </div>
  );
};

export default WebhookTester;
