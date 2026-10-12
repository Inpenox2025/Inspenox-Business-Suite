const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);
    // Auto-migrate company_id column on media_library if not exists
    try {
        await sql`ALTER TABLE media_library ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;`;
    } catch(e) {}

    const rawCompanyId = req.query.company_id || (req.body && req.body.company_id) || (req.headers && req.headers['x-company-id']) || null;
    let companyId = null;
    if (rawCompanyId && String(rawCompanyId).trim() !== '' && String(rawCompanyId).trim() !== 'default' && String(rawCompanyId).trim() !== 'parent') {
        const parsed = parseInt(rawCompanyId, 10);
        if (!isNaN(parsed)) {
            companyId = parsed;
        }
    }

    if (req.method === 'GET') {
        try {
            let dbMedia;
            if (companyId) {
                dbMedia = await sql`
                    SELECT * FROM media_library 
                    WHERE company_id = ${companyId}
                    ORDER BY created_at DESC
                `;
            } else {
                dbMedia = await sql`
                    SELECT * FROM media_library 
                    WHERE company_id IS NULL OR company_id = (SELECT id FROM companies WHERE slug = 'inspenox' OR LOWER(name) = 'inspenox' LIMIT 1)
                    ORDER BY created_at DESC
                `;
            }
            return res.status(200).json(dbMedia);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { name, type, meta_media_id, file_url, company_id } = req.body || {};
            if (!name) return res.status(400).json({ error: 'Media name required' });

            let targetCompanyId = companyId;
            if (company_id && String(company_id).trim() !== '' && String(company_id).trim() !== 'default' && String(company_id).trim() !== 'parent') {
                const parsed = parseInt(company_id, 10);
                if (!isNaN(parsed)) targetCompanyId = parsed;
            }
            if (!targetCompanyId) {
                try {
                    const parentRow = await sql`SELECT id FROM companies WHERE slug = 'inspenox' OR LOWER(name) = 'inspenox' OR is_parent = true LIMIT 1`;
                    if (parentRow.length > 0) {
                        targetCompanyId = parentRow[0].id;
                    }
                } catch(e) {}
            }

            const result = await sql`
                INSERT INTO media_library (name, type, meta_media_id, file_url, company_id)
                VALUES (${name}, ${type || 'image'}, ${meta_media_id || null}, ${file_url || null}, ${targetCompanyId})
                RETURNING *
            `;
            return res.status(200).json({ success: true, media: result[0] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Media ID required' });

            await sql`DELETE FROM media_library WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
