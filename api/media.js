const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    const sql = getDb();

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

            /* 
            // --- OPTIONAL: GitHub Repository Sync (Commented out to show Cloud DB Media only) ---
            const owner = process.env.GITHUB_OWNER || 'Sai2507';
            const repo = process.env.GITHUB_REPO || 'Induio';
            
            let ghFiles = [];
            try {
                const headers = { 'User-Agent': 'Induio-App' };
                if (process.env.GITHUB_TOKEN) {
                    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
                }
                const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/uploads`, { headers });
                if (ghRes.ok) {
                    const files = await ghRes.json();
                    if (Array.isArray(files)) {
                        ghFiles = files.filter(f => f.type === 'file').map(f => ({
                            id: `gh_${f.sha}`,
                            name: f.name,
                            type: f.name.endsWith('.mp4') ? 'video' : 'image',
                            file_url: f.download_url,
                            meta_media_id: null,
                            source: 'github'
                        }));
                    }
                }
            } catch(e) {
                console.error("GitHub fetch error:", e);
            }

            const combined = [...dbMedia];
            const existingNames = new Set(dbMedia.map(m => m.name));
            ghFiles.forEach(f => {
                if (!existingNames.has(f.name)) {
                    combined.push(f);
                }
            });
            return res.status(200).json(combined);
            */

            // Show Cloud Database Media Only
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

            // If ID is string starting with gh_, it's a GitHub file, else DB integer id
            if (typeof id === 'string' && id.startsWith('gh_')) {
                // Delete from GitHub if token present
                const owner = process.env.GITHUB_OWNER || 'Sai2507';
                const repo = process.env.GITHUB_REPO || 'Induio';
                if (process.env.GITHUB_TOKEN) {
                    const sha = id.replace('gh_', '');
                    // Delete file from GitHub
                    try {
                        const fileInfo = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/uploads`, {
                            headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'Induio-App' }
                        });
                        const files = await fileInfo.json();
                        const targetFile = files.find(f => f.sha === sha);
                        if (targetFile) {
                            await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${targetFile.path}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'Induio-App' },
                                body: JSON.stringify({ message: `Delete ${targetFile.name}`, sha: sha, branch: "main" })
                            });
                        }
                    } catch(e) {}
                }
                return res.status(200).json({ success: true });
            }

            await sql`DELETE FROM media_library WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).send('Method Not Allowed');
};
