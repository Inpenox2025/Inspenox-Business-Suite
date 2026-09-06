-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  is_saved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- All messages sent/received
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  direction TEXT CHECK (direction IN ('outbound', 'inbound')),
  type TEXT,
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

-- Media Library Assets Table
CREATE TABLE IF NOT EXISTS media_library (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'image',
  meta_media_id VARCHAR(255),
  file_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- 2. Insert default admin user (Username: admin | Password: admin123)
INSERT INTO users (username, password_hash, role)
VALUES (
  'admin', 
  '00e3bcd172820d16832b5039623de4977201c4bdf15c60af94eaafa7c584f7e0', 
  'admin'
)
ON CONFLICT (username) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;
