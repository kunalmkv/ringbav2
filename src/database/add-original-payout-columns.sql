-- Migration: Add original_payout and original_revenue columns to elocal_call_data table
-- These columns store the original payout/revenue values from Ringba before any adjustments

-- Add original_payout column
ALTER TABLE elocal_call_data 
ADD COLUMN IF NOT EXISTS original_payout DECIMAL(10, 2) DEFAULT NULL;

-- Add original_revenue column  
ALTER TABLE elocal_call_data
ADD COLUMN IF NOT EXISTS original_revenue DECIMAL(10, 2) DEFAULT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_original_payout ON elocal_call_data(original_payout);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_original_revenue ON elocal_call_data(original_revenue);

