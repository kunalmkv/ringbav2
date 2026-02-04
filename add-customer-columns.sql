-- Optional: Add customer detail columns to existing ringba_call_data table
-- This script is SAFE and will NOT delete any existing data
-- It only ADDS new columns if they don't already exist

-- Check if columns exist before adding them
DO $$ 
BEGIN
  -- Add first_name if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'first_name') THEN
    ALTER TABLE ringba_call_data ADD COLUMN first_name VARCHAR(100);
    RAISE NOTICE 'Added column: first_name';
  END IF;

  -- Add last_name if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'last_name') THEN
    ALTER TABLE ringba_call_data ADD COLUMN last_name VARCHAR(100);
    RAISE NOTICE 'Added column: last_name';
  END IF;

  -- Add full_name if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'full_name') THEN
    ALTER TABLE ringba_call_data ADD COLUMN full_name VARCHAR(200);
    RAISE NOTICE 'Added column: full_name';
  END IF;

  -- Add email if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'email') THEN
    ALTER TABLE ringba_call_data ADD COLUMN email VARCHAR(255);
    RAISE NOTICE 'Added column: email';
  END IF;

  -- Add phone if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'phone') THEN
    ALTER TABLE ringba_call_data ADD COLUMN phone VARCHAR(50);
    RAISE NOTICE 'Added column: phone';
  END IF;

  -- Add address if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'address') THEN
    ALTER TABLE ringba_call_data ADD COLUMN address TEXT;
    RAISE NOTICE 'Added column: address';
  END IF;

  -- Add city if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'city') THEN
    ALTER TABLE ringba_call_data ADD COLUMN city VARCHAR(100);
    RAISE NOTICE 'Added column: city';
  END IF;

  -- Add state if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'state') THEN
    ALTER TABLE ringba_call_data ADD COLUMN state VARCHAR(50);
    RAISE NOTICE 'Added column: state';
  END IF;

  -- Add zip_code if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'zip_code') THEN
    ALTER TABLE ringba_call_data ADD COLUMN zip_code VARCHAR(20);
    RAISE NOTICE 'Added column: zip_code';
  END IF;

  -- Add country if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'country') THEN
    ALTER TABLE ringba_call_data ADD COLUMN country VARCHAR(100);
    RAISE NOTICE 'Added column: country';
  END IF;

  -- Add company if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'company') THEN
    ALTER TABLE ringba_call_data ADD COLUMN company VARCHAR(255);
    RAISE NOTICE 'Added column: company';
  END IF;

  -- Add notes if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'notes') THEN
    ALTER TABLE ringba_call_data ADD COLUMN notes TEXT;
    RAISE NOTICE 'Added column: notes';
  END IF;

  -- Add message if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'message') THEN
    ALTER TABLE ringba_call_data ADD COLUMN message TEXT;
    RAISE NOTICE 'Added column: message';
  END IF;

  -- Add updated_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'ringba_call_data' AND column_name = 'updated_at') THEN
    ALTER TABLE ringba_call_data ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    RAISE NOTICE 'Added column: updated_at';
  END IF;
END $$;

-- Create indexes for better performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_email ON ringba_call_data(email);
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_phone ON ringba_call_data(phone);
CREATE INDEX IF NOT EXISTS idx_ringba_call_data_name ON ringba_call_data(first_name, last_name);

-- Show final table structure
SELECT 
  column_name, 
  data_type, 
  character_maximum_length,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'ringba_call_data'
ORDER BY ordinal_position;
