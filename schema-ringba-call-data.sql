-- Database schema for ringba_call_data table
-- This table stores customer personal details and call information from Ringba API

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS ringba_call_data (
  id SERIAL PRIMARY KEY,
  
  -- Call Identification
  inbound_call_id VARCHAR(255) UNIQUE NOT NULL,
  call_dt TIMESTAMP,
  
  -- Target/Routing Information
  target_id VARCHAR(255),
  target_name VARCHAR(255),
  inbound_phone_number VARCHAR(50),
  caller_id VARCHAR(50),
  
  -- Financial Data
  conversion_amount DECIMAL(10, 2) DEFAULT 0,  -- Revenue from Ringba
  payout_amount DECIMAL(10, 2) DEFAULT 0,      -- Payout/cost from Ringba
  
  -- Call Metrics
  call_duration INTEGER DEFAULT 0,  -- Duration in seconds
  
  -- Campaign Information
  campaign_name VARCHAR(255),
  publisher_name VARCHAR(255),
  
  -- Customer Personal Details (Form Fields)
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  full_name VARCHAR(200),
  email VARCHAR(255),
  phone VARCHAR(50),
  
  -- Address Information
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(100),
  
  -- Additional Details
  company VARCHAR(255),
  notes TEXT,
  message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_call_dt ON ringba_call_data(call_dt);
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_caller_id ON ringba_call_data(caller_id);
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_target_id ON ringba_call_data(target_id);
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_email ON ringba_call_data(email);
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_phone ON ringba_call_data(phone);

-- Create index on customer name for search
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_name ON ringba_call_data(first_name, last_name);

-- Add comments to table
COMMENT ON TABLE ringba_call_data IS 'Stores customer personal details and call information from Ringba API';
COMMENT ON COLUMN ringba_call_data.inbound_call_id IS 'Unique Ringba call identifier';
COMMENT ON COLUMN ringba_call_data.conversion_amount IS 'Revenue amount from Ringba';
COMMENT ON COLUMN ringba_call_data.payout_amount IS 'Payout/cost amount from Ringba';
COMMENT ON COLUMN ringba_call_data.call_duration IS 'Call duration in seconds';

-- Optional: Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ringba_call_data_updated_at 
  BEFORE UPDATE ON ringba_call_data 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Display table info
SELECT 
  column_name, 
  data_type, 
  character_maximum_length,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'ringba_call_data'
ORDER BY ordinal_position;
