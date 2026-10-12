const { getDb } = require('../lib/db');

const DEFAULT_TAGS = [
    { name: 'Repeat Buyers', color: 'pink', bg_color: '#fdf2f8', text_color: '#be185d', border_color: '#fbcfe8' },
    { name: 'Recovered', color: 'gray', bg_color: '#f3f4f6', text_color: '#4b5563', border_color: '#e5e7eb' },
    { name: 'Order Placed(Prepaid)', color: 'pink', bg_color: '#fdf2f8', text_color: '#db2777', border_color: '#fbcfe8' },
    { name: 'Order Placed(CoD)', color: 'purple', bg_color: '#ede9fe', text_color: '#7c3aed', border_color: '#ddd6fe' },
    { name: 'Loyal', color: 'green', bg_color: '#dcfce7', text_color: '#15803d', border_color: '#bbf7d0' },
    { name: 'Lost', color: 'blue', bg_color: '#e0f2fe', text_color: '#0284c7', border_color: '#bae6fd' },
    { name: 'High Spenders', color: 'purple', bg_color: '#ede9fe', text_color: '#7c3aed', border_color: '#ddd6fe' },
    { name: 'Curious Browsers', color: 'mint', bg_color: '#d1fae5', text_color: '#047857', border_color: '#a7f3d0' },
    { name: 'At Risk', color: 'lime', bg_color: '#ecfccb', text_color: '#65a30d', border_color: '#d9f99d' },
    { name: 'Abandoned Cart', color: 'lime', bg_color: '#ecfccb', text_color: '#65a30d', border_color: '#d9f99d' }
];

async function ensureTagsTable(sql) {
    await sql`
        CREATE TABLE IF NOT EXISTS tags (
            id SERIAL PRIMARY KEY,
            company_id VARCHAR(100),
            name VARCHAR(150) NOT NULL,
            color VARCHAR(50) DEFAULT 'indigo',
            bg_color VARCHAR(50),
            text_color VARCHAR(50),
            border_color VARCHAR(50),
            is_default BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `;
}

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);
    const companyId = req.query.company_id || (req.headers && req.headers['x-company-id']) || (req.body && req.body.company_id) || '1';

    try {
        await ensureTagsTable(sql);

        if (req.method === 'GET') {
            const customTags = await sql`
                SELECT * FROM tags 
                WHERE company_id = ${companyId} OR company_id = 'default' OR company_id IS NULL 
                ORDER BY created_at ASC
            `;

            // Merge default tags with custom tags, avoiding duplicate names
            const existingNames = new Set(customTags.map(t => t.name.toLowerCase()));
            const defaults = DEFAULT_TAGS.filter(dt => !existingNames.has(dt.name.toLowerCase())).map((dt, idx) => ({
                id: `def_${idx + 1}`,
                name: dt.name,
                color: dt.color,
                bg_color: dt.bg_color,
                text_color: dt.text_color,
                border_color: dt.border_color,
                is_default: true
            }));

            return res.status(200).json({
                success: true,
                tags: [...defaults, ...customTags]
            });
        }

        if (req.method === 'POST') {
            const { name, color, bg_color, text_color, border_color } = req.body || {};
            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Tag name is required' });
            }

            const cleanName = name.trim();
            
            // Check if tag already exists in custom tags or defaults
            const existing = await sql`
                SELECT * FROM tags 
                WHERE LOWER(name) = LOWER(${cleanName}) 
                  AND (company_id = ${companyId} OR company_id = 'default' OR company_id IS NULL)
                LIMIT 1
            `;

            if (existing.length > 0) {
                return res.status(200).json({ success: true, tag: existing[0], alreadyExists: true });
            }

            // Assign color palette if not provided
            const colorPalettes = [
                { color: 'pink', bg_color: '#fdf2f8', text_color: '#be185d', border_color: '#fbcfe8' },
                { color: 'purple', bg_color: '#ede9fe', text_color: '#7c3aed', border_color: '#ddd6fe' },
                { color: 'green', bg_color: '#dcfce7', text_color: '#15803d', border_color: '#bbf7d0' },
                { color: 'blue', bg_color: '#e0f2fe', text_color: '#0284c7', border_color: '#bae6fd' },
                { color: 'mint', bg_color: '#d1fae5', text_color: '#047857', border_color: '#a7f3d0' },
                { color: 'lime', bg_color: '#ecfccb', text_color: '#65a30d', border_color: '#d9f99d' },
                { color: 'amber', bg_color: '#fef3c7', text_color: '#b45309', border_color: '#fde68a' },
                { color: 'cyan', bg_color: '#cffafe', text_color: '#0e7490', border_color: '#a5f3fc' }
            ];

            const defaultPalette = colorPalettes[Math.floor(Math.random() * colorPalettes.length)];

            const result = await sql`
                INSERT INTO tags (company_id, name, color, bg_color, text_color, border_color, is_default)
                VALUES (
                    ${companyId}, 
                    ${cleanName}, 
                    ${color || defaultPalette.color}, 
                    ${bg_color || defaultPalette.bg_color}, 
                    ${text_color || defaultPalette.text_color}, 
                    ${border_color || defaultPalette.border_color}, 
                    false
                )
                RETURNING *
            `;

            return res.status(200).json({ success: true, tag: result[0] });
        }

        if (req.method === 'DELETE') {
            const tagId = req.query.id;
            if (!tagId) return res.status(400).json({ error: 'Tag ID required' });

            await sql`DELETE FROM tags WHERE id = ${tagId} AND (company_id = ${companyId} OR company_id = 'default')`;
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error('Tags API Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
