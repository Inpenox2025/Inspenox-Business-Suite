const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);

    // Auto-create companies table if missing & migrate column if old schema
    try {
        await sql`
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
        `;
        await sql`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='companies' AND column_name='webhook_verify_token'
                ) THEN
                    ALTER TABLE companies RENAME COLUMN webhook_verify_token TO whatsapp_verify_token;
                END IF;
            END $$;
        `;
    } catch(e) {
        console.error("Table creation error for companies:", e);
    }

    if (req.method === 'GET') {
        try {
            const systemEnv = {
                whatsapp_phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || '',
                whatsapp_business_account_id: env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
                whatsapp_access_token: env.WHATSAPP_ACCESS_TOKEN || '',
                whatsapp_verify_token: env.WHATSAPP_VERIFY_TOKEN || 'manasageetha',
                has_access_token: !!(env.WHATSAPP_ACCESS_TOKEN)
            };

            let companies = await sql`
                SELECT id, name, slug, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_access_token, 
                       whatsapp_verify_token, is_active, created_at,
                       (SELECT COUNT(*) FROM customers c WHERE c.company_id = companies.id) as customer_count,
                       (SELECT COUNT(*) FROM messages m WHERE m.company_id = companies.id) as message_count
                FROM companies 
                ORDER BY id ASC
            `;

            // If no companies exist, seed default Inspenox parent company
            if (companies.length === 0) {
                const phoneId = env.WHATSAPP_PHONE_NUMBER_ID || null;
                const token = env.WHATSAPP_ACCESS_TOKEN || null;
                const wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID || null;
                const verifyToken = env.WHATSAPP_VERIFY_TOKEN || 'manasageetha';

                const defaultCo = await sql`
                    INSERT INTO companies (name, slug, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token)
                    VALUES ('Inspenox Business Suite', 'inspenox', ${phoneId}, ${token}, ${wabaId}, ${verifyToken})
                    RETURNING *
                `;
                companies = [defaultCo[0]];
            }

            // Hydrate environment variable fallbacks for empty fields
            let resolvedCompanies = companies.map(c => ({
                ...c,
                whatsapp_phone_number_id: c.whatsapp_phone_number_id || systemEnv.whatsapp_phone_number_id,
                whatsapp_business_account_id: c.whatsapp_business_account_id || systemEnv.whatsapp_business_account_id,
                whatsapp_access_token: c.whatsapp_access_token || systemEnv.whatsapp_access_token,
                whatsapp_verify_token: c.whatsapp_verify_token || systemEnv.whatsapp_verify_token
            }));

            const filterCoId = req.query.company_id;
            if (filterCoId && filterCoId !== 'default' && filterCoId !== 'parent' && filterCoId !== 'all') {
                resolvedCompanies = resolvedCompanies.filter(c => String(c.id) === String(filterCoId));
            }

            if (req.query.include_env === 'true') {
                return res.status(200).json({
                    companies: resolvedCompanies,
                    system_env: systemEnv
                });
            }

            return res.status(200).json(resolvedCompanies);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { name, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token } = req.body || {};

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Company name is required' });
            }

            const cleanName = name.trim();
            const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `co-${Date.now()}`;

            const result = await sql`
                INSERT INTO companies (name, slug, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token)
                VALUES (${cleanName}, ${slug}, ${whatsapp_phone_number_id || null}, ${whatsapp_access_token || null}, ${whatsapp_business_account_id || null}, ${whatsapp_verify_token || 'manasageetha'})
                RETURNING *
            `;

            return res.status(200).json({ success: true, company: result[0] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, name, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token, is_active } = req.body || {};

            if (!id) return res.status(400).json({ error: 'Company ID is required' });

            const existing = await sql`SELECT * FROM companies WHERE id = ${id} LIMIT 1`;
            if (existing.length === 0) return res.status(404).json({ error: 'Company not found' });

            const oldComp = existing[0];
            const updatedName = (name && name.trim()) ? name.trim() : oldComp.name;
            const updatedPhoneId = (whatsapp_phone_number_id !== undefined && whatsapp_phone_number_id !== null && String(whatsapp_phone_number_id).trim() !== '') ? String(whatsapp_phone_number_id).trim() : oldComp.whatsapp_phone_number_id;
            const updatedWabaId = (whatsapp_business_account_id !== undefined && whatsapp_business_account_id !== null && String(whatsapp_business_account_id).trim() !== '') ? String(whatsapp_business_account_id).trim() : oldComp.whatsapp_business_account_id;
            const updatedToken = (whatsapp_access_token && String(whatsapp_access_token).trim() !== '') ? String(whatsapp_access_token).trim() : oldComp.whatsapp_access_token;
            const updatedVerify = (whatsapp_verify_token && String(whatsapp_verify_token).trim() !== '') ? String(whatsapp_verify_token).trim() : oldComp.whatsapp_verify_token;
            const updatedActive = is_active !== undefined ? is_active : oldComp.is_active;

            const result = await sql`
                UPDATE companies 
                SET name = ${updatedName},
                    whatsapp_phone_number_id = ${updatedPhoneId},
                    whatsapp_business_account_id = ${updatedWabaId},
                    whatsapp_access_token = ${updatedToken},
                    whatsapp_verify_token = ${updatedVerify},
                    is_active = ${updatedActive}
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

            const targetComp = await sql`SELECT id, name, slug FROM companies WHERE id = ${id} LIMIT 1`;
            if (targetComp.length > 0) {
                const compName = (targetComp[0].name || '').toLowerCase();
                const compSlug = (targetComp[0].slug || '').toLowerCase();
                if (compName.includes('inspenox') || compSlug === 'inspenox' || String(targetComp[0].id) === 'default') {
                    return res.status(403).json({ error: 'Inspenox Business Suite is the primary parent organization and cannot be deleted.' });
                }
            }

            await sql`UPDATE companies SET is_active = false WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
