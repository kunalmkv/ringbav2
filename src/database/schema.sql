-- PostgreSQL schema for eLocal scraper

-- Table to track scraping sessions
CREATE TABLE IF NOT EXISTS scraping_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'running',
    calls_scraped INTEGER DEFAULT 0,
    adjustments_scraped INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store campaign calls
CREATE TABLE IF NOT EXISTS elocal_call_data (
    id SERIAL PRIMARY KEY,
    caller_id VARCHAR(50) NOT NULL,
    date_of_call VARCHAR(100) NOT NULL,
    campaign_phone VARCHAR(50) DEFAULT '(877) 834-1273',
    payout DECIMAL(10, 2) DEFAULT 0,
    category VARCHAR(50) DEFAULT 'STATIC',
    city_state VARCHAR(255),
    zip_code VARCHAR(20),
    screen_duration INTEGER,
    post_screen_duration INTEGER,
    total_duration INTEGER,
    assessment VARCHAR(255),
    classification VARCHAR(255),
    adjustment_time VARCHAR(100),
    adjustment_amount DECIMAL(10, 2),
    adjustment_classification VARCHAR(255),
    adjustment_duration INTEGER,
    unmatched BOOLEAN DEFAULT FALSE,
    ringba_inbound_call_id VARCHAR(255),
    original_payout DECIMAL(10, 2) DEFAULT NULL,
    original_revenue DECIMAL(10, 2) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(caller_id, date_of_call, category)
);

-- Table to store adjustment details
CREATE TABLE IF NOT EXISTS adjustment_details (
    id SERIAL PRIMARY KEY,
    time_of_call VARCHAR(100) NOT NULL,
    adjustment_time VARCHAR(100) NOT NULL,
    campaign_phone VARCHAR(50) DEFAULT '(877) 834-1273',
    caller_id VARCHAR(50) NOT NULL,
    duration INTEGER DEFAULT 0,
    call_sid VARCHAR(255),
    amount DECIMAL(10, 2) DEFAULT 0,
    classification VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store Ringba calls (raw data from Ringba API)
CREATE TABLE IF NOT EXISTS ringba_calls (
    id SERIAL PRIMARY KEY,
    inbound_call_id VARCHAR(255) UNIQUE NOT NULL,
    call_date_time VARCHAR(100) NOT NULL,
    caller_id VARCHAR(50),
    caller_id_e164 VARCHAR(50),
    inbound_phone_number VARCHAR(50),
    payout_amount DECIMAL(10, 2) DEFAULT 0,
    revenue_amount DECIMAL(10, 2) DEFAULT 0,
    target_id VARCHAR(255),
    target_name VARCHAR(255),
    campaign_name VARCHAR(255),
    publisher_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_caller_id ON elocal_call_data(caller_id);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_date_of_call ON elocal_call_data(date_of_call);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_category ON elocal_call_data(category);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_ringba_id ON elocal_call_data(ringba_inbound_call_id);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_original_payout ON elocal_call_data(original_payout);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_original_revenue ON elocal_call_data(original_revenue);
CREATE INDEX IF NOT EXISTS idx_adjustment_details_caller_id ON adjustment_details(caller_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_details_time_of_call ON adjustment_details(time_of_call);
CREATE INDEX IF NOT EXISTS idx_scraping_sessions_session_id ON scraping_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_scraping_sessions_status ON scraping_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ringba_calls_inbound_call_id ON ringba_calls(inbound_call_id);
CREATE INDEX IF NOT EXISTS idx_ringba_calls_caller_id ON ringba_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_ringba_calls_caller_id_e164 ON ringba_calls(caller_id_e164);
CREATE INDEX IF NOT EXISTS idx_ringba_calls_call_date_time ON ringba_calls(call_date_time);
CREATE INDEX IF NOT EXISTS idx_ringba_calls_target_id ON ringba_calls(target_id);

-- Table to store Ringba campaign summary data (daily tracking)
CREATE TABLE IF NOT EXISTS ringba_campaign_summary (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) NOT NULL,
    campaign_id VARCHAR(255),
    target_id VARCHAR(255),
    target_name VARCHAR(255),
    summary_date DATE NOT NULL,
    total_calls INTEGER DEFAULT 0,
    revenue DECIMAL(10, 2) DEFAULT 0,
    payout DECIMAL(10, 2) DEFAULT 0,
    rpc DECIMAL(10, 2) DEFAULT 0, -- Revenue Per Call
    total_call_length_seconds INTEGER DEFAULT 0, -- TCL in seconds
    average_call_length_seconds DECIMAL(10, 2) DEFAULT 0, -- ACL in seconds
    total_cost DECIMAL(10, 2) DEFAULT 0,
    no_connections INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0,
    ivr_handled INTEGER DEFAULT 0,
    profit DECIMAL(10, 2) DEFAULT 0,
    margin DECIMAL(10, 2) DEFAULT 0, -- Margin percentage
    conversion_rate DECIMAL(10, 2) DEFAULT 0, -- Conversion rate percentage
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_name, summary_date)
);

-- Create indexes for campaign summary table
CREATE INDEX IF NOT EXISTS idx_ringba_campaign_summary_campaign_name ON ringba_campaign_summary(campaign_name);
CREATE INDEX IF NOT EXISTS idx_ringba_campaign_summary_date ON ringba_campaign_summary(summary_date);
CREATE INDEX IF NOT EXISTS idx_ringba_campaign_summary_campaign_id ON ringba_campaign_summary(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ringba_campaign_summary_target_id ON ringba_campaign_summary(target_id);

