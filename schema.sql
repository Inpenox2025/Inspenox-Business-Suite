
-- 1. Companies / Tenancy Workspaces Table
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  whatsapp_phone_number_id TEXT,
  whatsapp_access_token TEXT,
  whatsapp_business_account_id TEXT,
  whatsapp_verify_token TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enhanced Multi-Channel Customer Directory Table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,                          -- For Email Marketing & Automated Sequences
  company_name TEXT,                   -- Business / Organization Name
  address TEXT,                        -- Street Address
  city TEXT,                           -- City / Town
  state TEXT,                          -- State / Province
  pincode TEXT,                        -- Postal / ZIP Code
  country TEXT DEFAULT 'India',        -- Country
  tags TEXT,                           -- Comma-separated segment tags (e.g. "VIP, Lead, Wholesale")
  notes TEXT,                          -- Custom internal notes
  custom_fields JSONB DEFAULT '{}',    -- Key-Value metadata for Email/SMS campaign variables
  is_saved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Messages Log Table (Inbound & Outbound Messaging across Channels)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  direction TEXT CHECK (direction IN ('outbound', 'inbound')),
  type TEXT,                           -- text, image, video, template, button, interactive, email, sms
  channel TEXT DEFAULT 'whatsapp',     -- whatsapp, email, sms
  content TEXT,                        -- Text body, caption, or HTML content
  media_url TEXT,                      -- Media asset attachment URL
  wa_message_id TEXT,                  -- External Message ID from Meta / Provider
  status TEXT DEFAULT 'pending',       -- pending, sent, delivered, read, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Campaign Log Table for Broadcasts & Automated Sequences
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT,
  channel TEXT DEFAULT 'whatsapp',     -- whatsapp, email, sms
  message_type TEXT,
  content TEXT,
  media_url TEXT,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Admin Users Table (Linked to Companies)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Media Library Assets Table
CREATE TABLE IF NOT EXISTS media_library (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'image',
  meta_media_id VARCHAR(255),
  file_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- Seed Default Admin User (admin / admin123)
INSERT INTO users (username, password_hash, role)
VALUES (
  'admin', 
  '00e3bcd172820d16832b5039623de4977201c4bdf15c60af94eaafa7c584f7e0', 
  'admin'
)
ON CONFLICT (username) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;

-- =========================================================================
-- ALTER Migration Script for Existing Databases (Safe & Idempotent)
-- =========================================================================

-- Create companies table if missing
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  whatsapp_phone_number_id TEXT,
  whatsapp_access_token TEXT,
  whatsapp_business_account_id TEXT,
  whatsapp_verify_token TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT true;

-- Add missing columns to messages, campaigns, users, media_library tables
ALTER TABLE messages ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE companies RENAME COLUMN webhook_verify_token TO whatsapp_verify_token;
