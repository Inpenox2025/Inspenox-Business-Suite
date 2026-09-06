const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);
    const companyId = req.query.company_id || (req.body && req.body.company_id) || null;

    if (req.method === 'GET') {
        try {
            let dbMedia;
            if (companyId) {
                dbMedia = await sql`
                    SELECT * FROM media_library 
                    WHERE company_id = ${companyId} OR company_id IS NULL
                    ORDER BY created_at DESC
                `;
            } else {
                dbMedia = await sql`
                    SELECT * FROM media_library ORDER BY created_at DESC
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

            const targetCompanyId = company_id || companyId || 1;

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
