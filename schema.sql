-- Customers imported from Excel
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- All messages sent/received
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  direction TEXT CHECK (direction IN ('outbound', 'inbound')),
  type TEXT CHECK (type IN ('text', 'image', 'video', 'template')),
  content TEXT,          -- text body or caption
  media_url TEXT,        -- URL or uploaded media URL
  wa_message_id TEXT,    -- WhatsApp message ID from Meta
  status TEXT DEFAULT 'pending', -- pending, sent, delivered, read, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign log for bulk sends
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT,
  message_type TEXT,
  content TEXT,
  media_url TEXT,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Users Table for Authentication & Password Management
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
