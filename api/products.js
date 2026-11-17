const { getDb } = require('../lib/db');

const DEFAULT_PRODUCTS = [
    { name: 'Rotavator', color: 'emerald', bg_color: '#ecfdf5', text_color: '#047857', border_color: '#a7f3d0' },
    { name: 'Tractor', color: 'blue', bg_color: '#eff6ff', text_color: '#1d4ed8', border_color: '#bfdbfe' },
    { name: 'Baler', color: 'amber', bg_color: '#fffbeb', text_color: '#b45309', border_color: '#fde68a' },
    { name: 'Power Tiller', color: 'purple', bg_color: '#faf5ff', text_color: '#7e22ce', border_color: '#e9d5ff' },
    { name: 'Online Course', color: 'indigo', bg_color: '#eef2ff', text_color: '#4338ca', border_color: '#c7d2fe' },
    { name: 'Service Plan', color: 'teal', bg_color: '#f0fdfa', text_color: '#0f766e', border_color: '#99f6e4' }
];

const COLOR_PALETTES = [
    { color: 'emerald', bg_color: '#ecfdf5', text_color: '#047857', border_color: '#a7f3d0' },
    { color: 'blue', bg_color: '#eff6ff', text_color: '#1d4ed8', border_color: '#bfdbfe' },
    { color: 'amber', bg_color: '#fffbeb', text_color: '#b45309', border_color: '#fde68a' },
    { color: 'purple', bg_color: '#faf5ff', text_color: '#7e22ce', border_color: '#e9d5ff' },
    { color: 'indigo', bg_color: '#eef2ff', text_color: '#4338ca', border_color: '#c7d2fe' },
    { color: 'teal', bg_color: '#f0fdfa', text_color: '#0f766e', border_color: '#99f6e4' },
    { color: 'pink', bg_color: '#fdf2f8', text_color: '#be185d', border_color: '#fbcfe8' },
    { color: 'orange', bg_color: '#fff7ed', text_color: '#c2410c', border_color: '#fed7aa' }
];

async function ensureProductsTable(sql) {
    await sql`
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            company_id VARCHAR(100),
            name VARCHAR(150) NOT NULL,
            description TEXT DEFAULT '',
            category VARCHAR(100) DEFAULT 'General',
            color VARCHAR(50) DEFAULT 'emerald',
            bg_color VARCHAR(50),
            text_color VARCHAR(50),
            border_color VARCHAR(50),
            is_default BOOLEAN DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `;
    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS product TEXT DEFAULT NULL;`;
}

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);
    const companyId = req.query.company_id || (req.headers && req.headers['x-company-id']) || (req.body && req.body.company_id) || '1';

    try {
        await ensureProductsTable(sql);

        if (req.method === 'GET') {
            const customProducts = await sql`
                SELECT * FROM products 
                WHERE company_id = ${companyId} OR company_id = 'default' OR company_id IS NULL 
                ORDER BY created_at ASC
            `;

            // Also retrieve any existing distinct product values currently assigned to customers of this company
            let customerAssignedProducts = [];
            try {
                const custRows = await sql`
                    SELECT DISTINCT product FROM customers 
                    WHERE (company_id = ${companyId} OR company_id IS NULL) 
                      AND product IS NOT NULL 
                      AND TRIM(product) != ''
                `;
                customerAssignedProducts = custRows.map(r => r.product.trim()).filter(Boolean);
            } catch(e) {}

            const existingNames = new Set(customProducts.map(p => p.name.toLowerCase()));
            
            // Auto-create entries for any customer product values that aren't yet in the products list
            customerAssignedProducts.forEach((pName, idx) => {
                if (!existingNames.has(pName.toLowerCase())) {
                    const pal = COLOR_PALETTES[idx % COLOR_PALETTES.length];
                    customProducts.push({
                        id: `cust_${idx + 1}`,
                        name: pName,
                        color: pal.color,
                        bg_color: pal.bg_color,
                        text_color: pal.text_color,
                        border_color: pal.border_color,
                        is_default: false
                    });
                    existingNames.add(pName.toLowerCase());
                }
            });

            const defaults = DEFAULT_PRODUCTS.filter(dp => !existingNames.has(dp.name.toLowerCase())).map((dp, idx) => ({
                id: `def_${idx + 1}`,
                name: dp.name,
                color: dp.color,
                bg_color: dp.bg_color,
                text_color: dp.text_color,
                border_color: dp.border_color,
                is_default: true
            }));

            return res.status(200).json({
                success: true,
                products: [...customProducts, ...defaults]
            });
        }

        if (req.method === 'POST') {
            const { name, color, bg_color, text_color, border_color, description } = req.body || {};
            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Product name is required' });
            }

            const cleanName = name.trim();

            const existing = await sql`
                SELECT * FROM products 
                WHERE LOWER(name) = LOWER(${cleanName}) 
                  AND (company_id = ${companyId} OR company_id = 'default' OR company_id IS NULL)
                LIMIT 1
            `;

            if (existing.length > 0) {
                return res.status(200).json({ success: true, product: existing[0], alreadyExists: true });
            }

            const pal = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];

            const result = await sql`
                INSERT INTO products (company_id, name, description, color, bg_color, text_color, border_color, is_default)
                VALUES (
                    ${companyId}, 
                    ${cleanName}, 
                    ${description || ''},
                    ${color || pal.color}, 
                    ${bg_color || pal.bg_color}, 
                    ${text_color || pal.text_color}, 
                    ${border_color || pal.border_color}, 
                    false
                )
                RETURNING *
            `;

            return res.status(200).json({ success: true, product: result[0] });
        }

        if (req.method === 'DELETE') {
            const productId = req.query.id;
            if (!productId) return res.status(400).json({ error: 'Product ID required' });

            await sql`DELETE FROM products WHERE id = ${productId} AND (company_id = ${companyId} OR company_id = 'default')`;
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error('Products API Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
