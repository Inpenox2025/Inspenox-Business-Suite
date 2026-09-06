const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);

    // Auto-create media_library table if not exists
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS media_library (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) DEFAULT 'image',
                meta_media_id VARCHAR(255),
                file_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
    } catch (e) {
        console.error("Table creation error:", e);
    }

    if (req.method === 'GET') {
        try {
            const dbMedia = await sql`
                SELECT * FROM media_library ORDER BY created_at DESC
            `;
            return res.status(200).json(dbMedia);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { name, type, meta_media_id, file_url } = req.body;
            if (!name) return res.status(400).json({ error: 'Media name required' });

            const result = await sql`
                INSERT INTO media_library (name, type, meta_media_id, file_url)
                VALUES (${name}, ${type || 'image'}, ${meta_media_id || null}, ${file_url || null})
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

    res.status(405).send('Method Not Allowed');
};

