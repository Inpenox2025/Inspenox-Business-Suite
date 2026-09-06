const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);

    // Auto-create companies table if missing
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                whatsapp_phone_number_id TEXT,
                whatsapp_access_token TEXT,
                whatsapp_business_account_id TEXT,
                webhook_verify_token TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `;
    } catch(e) {
        console.error("Table creation error for companies:", e);
    }

    if (req.method === 'GET') {
        try {
            const companies = await sql`
                SELECT id, name, slug, whatsapp_phone_number_id, whatsapp_business_account_id, 
                       webhook_verify_token, is_active, created_at,
                       (SELECT COUNT(*) FROM customers c WHERE c.company_id = companies.id) as customer_count,
                       (SELECT COUNT(*) FROM messages m WHERE m.company_id = companies.id) as message_count
                FROM companies 
                ORDER BY id ASC
            `;

            // If no companies exist, seed default
            if (companies.length === 0) {
                const phoneId = env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733';
                const token = env.WHATSAPP_ACCESS_TOKEN || '';
                const wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1561463645723530';
                const verifyToken = env.WHATSAPP_VERIFY_TOKEN || 'manasageetha';

                const defaultCo = await sql`
                    INSERT INTO companies (name, slug, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, webhook_verify_token)
                    VALUES ('Manaswini Enterprises', 'manaswini-enterprises', ${phoneId}, ${token}, ${wabaId}, ${verifyToken})
                    RETURNING *
                `;
                return res.status(200).json([defaultCo[0]]);
            }

            return res.status(200).json(companies);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { name, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, webhook_verify_token } = req.body || {};

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Company name is required' });
            }

            const cleanName = name.trim();
            const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `co-${Date.now()}`;

            const result = await sql`
                INSERT INTO companies (name, slug, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, webhook_verify_token)
                VALUES (${cleanName}, ${slug}, ${whatsapp_phone_number_id || null}, ${whatsapp_access_token || null}, ${whatsapp_business_account_id || null}, ${webhook_verify_token || 'manasageetha'})
                RETURNING *
            `;

            return res.status(200).json({ success: true, company: result[0] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, name, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, webhook_verify_token, is_active } = req.body || {};

            if (!id) return res.status(400).json({ error: 'Company ID is required' });

            const result = await sql`
                UPDATE companies 
                SET name = COALESCE(${name}, name),
                    whatsapp_phone_number_id = COALESCE(${whatsapp_phone_number_id}, whatsapp_phone_number_id),
                    whatsapp_access_token = COALESCE(${whatsapp_access_token}, whatsapp_access_token),
                    whatsapp_business_account_id = COALESCE(${whatsapp_business_account_id}, whatsapp_business_account_id),
                    webhook_verify_token = COALESCE(${webhook_verify_token}, webhook_verify_token),
                    is_active = COALESCE(${is_active}, is_active)
                WHERE id = ${id}
                RETURNING *
            `;

            if (result.length === 0) return res.status(404).json({ error: 'Company not found' });

            return res.status(200).json({ success: true, company: result[0] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Company ID is required' });

            await sql`UPDATE companies SET is_active = false WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
