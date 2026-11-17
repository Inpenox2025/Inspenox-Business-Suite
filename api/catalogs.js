const { getDb } = require('../lib/db');

async function ensureCatalogTables(sql) {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS product_catalogs (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(100),
                name VARCHAR(255) NOT NULL,
                meta_catalog_id VARCHAR(100),
                description TEXT DEFAULT '',
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS catalog_items (
                id SERIAL PRIMARY KEY,
                catalog_id INT REFERENCES product_catalogs(id) ON DELETE CASCADE,
                company_id VARCHAR(100),
                retailer_id VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT DEFAULT '',
                price NUMERIC(10, 2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'INR',
                image_url TEXT DEFAULT '',
                url TEXT DEFAULT '',
                availability VARCHAR(50) DEFAULT 'in stock',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
    } catch(e) {
        console.warn('ensureCatalogTables error:', e.message);
    }
}

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const companyId = req.query.company_id || (req.body && req.body.company_id) || (req.headers && req.headers['x-company-id']) || '1';

    let isMaster = false;
    let company = null;
    const sql = getDb(env);
    await ensureCatalogTables(sql);

    if (companyId && companyId !== 'default' && companyId !== 'parent' && companyId !== 'all') {
        try {
            const cos = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
            if (cos.length > 0) {
                company = cos[0];
                isMaster = (company.slug && company.slug.toLowerCase() === 'inspenox') || (company.name && company.name.toLowerCase() === 'inspenox') || company.is_parent === true || company.is_master === true;
            }
        } catch(e) {}
    } else {
        isMaster = true;
    }

    let phoneId = null;
    let wabaId = null;
    let token = null;
    let verifyToken = null;
    let isConfigured = false;

    if (isMaster) {
        phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
        wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        token = env.WHATSAPP_ACCESS_TOKEN;
        verifyToken = env.WHATSAPP_VERIFY_TOKEN;
        isConfigured = !!(phoneId && wabaId && token && verifyToken);
    } else if (company) {
        phoneId = company.whatsapp_phone_number_id;
        wabaId = company.whatsapp_business_account_id;
        token = company.whatsapp_access_token;
        verifyToken = company.whatsapp_verify_token;
        isConfigured = !!(phoneId && wabaId && token && verifyToken);
    }

    // CSV Feed Export for Meta Commerce Manager
    if (req.method === 'GET' && req.query.action === 'export_csv') {
        try {
            const catId = req.query.catalog_id;
            let items = [];
            if (catId) {
                items = await sql`SELECT * FROM catalog_items WHERE catalog_id = ${catId} ORDER BY id ASC`;
            } else {
                items = await sql`SELECT * FROM catalog_items WHERE company_id = ${companyId} ORDER BY id ASC`;
            }

            let csv = 'id,title,description,availability,condition,price,link,image_link,brand\n';
            for (const item of items) {
                const id = `"${String(item.retailer_id || item.id).replace(/"/g, '""')}"`;
                const title = `"${String(item.name || '').replace(/"/g, '""')}"`;
                const desc = `"${String(item.description || item.name || '').replace(/"/g, '""')}"`;
                const avail = 'in stock';
                const cond = 'new';
                const price = `"${parseFloat(item.price || 0).toFixed(2)} ${item.currency || 'INR'}"`;
                const link = `"${item.url || 'https://inspenox.com'}"`;
                const img = `"${item.image_url || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800'}"`;
                const brand = '"Inspenox"';
                csv += `${id},${title},${desc},${avail},${cond},${price},${link},${img},${brand}\n`;
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="meta_catalog_${catId || 'export'}.csv"`);
            return res.status(200).send(csv);
        } catch(e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // GET /api/catalogs - Fetch connected product catalogs from Meta & In-App database
    if (req.method === 'GET') {
        try {
            let metaCatalogs = [];
            let metaError = null;

            if (isConfigured) {
                try {
                    const url = `https://graph.facebook.com/v19.0/${wabaId}/product_catalogs`;
                    const metaRes = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    const data = await metaRes.json();
                    if (!data.error && Array.isArray(data.data)) {
                        for (const cat of data.data) {
                            let catName = `Meta Catalog #${cat.id}`;
                            let productCount = null;
                            try {
                                const detailRes = await fetch(`https://graph.facebook.com/v19.0/${cat.id}?fields=name,product_count,vertical`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                const detailData = await detailRes.json();
                                if (detailData && detailData.name) {
                                    catName = detailData.name;
                                    productCount = detailData.product_count || null;
                                }
                            } catch(detailErr) {}

                            metaCatalogs.push({
                                id: cat.id,
                                name: catName,
                                product_count: productCount,
                                source: 'meta'
                            });
                        }
                    } else if (data.error) {
                        metaError = data.error.message;
                    }
                } catch(mErr) {
                    metaError = mErr.message;
                }
            }

            // Fetch In-App Catalogs
            let localCatalogs = [];
            try {
                localCatalogs = await sql`
                    SELECT c.*, 
                           COALESCE(COUNT(i.id), 0)::int as items_count 
                    FROM product_catalogs c
                    LEFT JOIN catalog_items i ON c.id = i.catalog_id
                    WHERE c.company_id = ${companyId} OR c.company_id = '1' OR c.company_id IS NULL
                    GROUP BY c.id
                    ORDER BY c.created_at DESC
                `;

                // If no local catalog exists yet, create default seed catalog
                if (localCatalogs.length === 0) {
                    const seedCat = await sql`
                        INSERT INTO product_catalogs (company_id, name, description)
                        VALUES (${companyId}, 'Main Equipment & Services Catalog', 'Official agricultural machinery, power equipment & digital services inventory')
                        RETURNING *
                    `;
                    if (seedCat.length > 0) {
                        const newCatId = seedCat[0].id;
                        await sql`
                            INSERT INTO catalog_items (catalog_id, company_id, retailer_id, name, description, price, currency, image_url)
                            VALUES 
                            (${newCatId}, ${companyId}, 'SKU_ROTA_01', 'Rotavator 6ft Shaktiman Heavy Duty', 'High performance tractor rotavator for wet and dry soil preparation.', 85000, 'INR', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800'),
                            (${newCatId}, ${companyId}, 'SKU_TRAC_02', 'Mini Tractor 4WD 25HP', 'Compact fuel efficient tractor with multi-speed PTO.', 320000, 'INR', 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?w=800'),
                            (${newCatId}, ${companyId}, 'SKU_BALER_03', 'Round Straw Baler Machine', 'Automatic twine binding baler for wheat and paddy straw collection.', 145000, 'INR', 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=800')
                        `;
                        localCatalogs = await sql`
                            SELECT c.*, 
                                   COALESCE(COUNT(i.id), 0)::int as items_count 
                            FROM product_catalogs c
                            LEFT JOIN catalog_items i ON c.id = i.catalog_id
                            WHERE c.id = ${newCatId}
                            GROUP BY c.id
                        `;
                    }
                }
            } catch(dbErr) {
                console.warn('Local catalog query error:', dbErr.message);
            }

            const isConnected = metaCatalogs.length > 0;

            return res.status(200).json({
                success: true,
                is_configured: isConfigured,
                connected: isConnected,
                catalogs: metaCatalogs.length > 0 ? metaCatalogs : localCatalogs.map(lc => ({
                    id: lc.meta_catalog_id || `local_${lc.id}`,
                    name: lc.name,
                    product_count: lc.items_count,
                    local_id: lc.id,
                    source: 'inapp'
                })),
                meta_catalogs: metaCatalogs,
                local_catalogs: localCatalogs,
                waba_id: wabaId,
                meta_error: metaError
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: err.message,
                connected: false,
                catalogs: []
            });
        }
    }

    // POST /api/catalogs
    if (req.method === 'POST') {
        const { action, catalog_id, name, description, products } = req.body || {};

        // In-App Catalog Creation
        if (action === 'create_inapp_catalog' || (name && !catalog_id)) {
            try {
                if (!name || !String(name).trim()) {
                    return res.status(400).json({ error: 'Catalog name is required' });
                }

                const catName = String(name).trim();
                const catDesc = description ? String(description).trim() : '';

                const created = await sql`
                    INSERT INTO product_catalogs (company_id, name, description)
                    VALUES (${companyId}, ${catName}, ${catDesc})
                    RETURNING *
                `;

                const newCat = created[0];
                let insertedProducts = 0;

                if (Array.isArray(products) && products.length > 0) {
                    for (const p of products) {
                        if (p.name && String(p.name).trim()) {
                            const pName = String(p.name).trim();
                            const pPrice = parseFloat(p.price || 0) || 0;
                            const pCurr = p.currency || 'INR';
                            const pDesc = p.description || '';
                            const pImg = p.image_url || '';
                            const pSku = p.retailer_id || `SKU_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                            await sql`
                                INSERT INTO catalog_items (catalog_id, company_id, retailer_id, name, description, price, currency, image_url)
                                VALUES (${newCat.id}, ${companyId}, ${pSku}, ${pName}, ${pDesc}, ${pPrice}, ${pCurr}, ${pImg})
                            `;
                            insertedProducts++;
                        }
                    }
                }

                return res.status(200).json({
                    success: true,
                    message: `Catalog "${catName}" created successfully with ${insertedProducts} product(s)!`,
                    catalog: newCat,
                    products_count: insertedProducts
                });
            } catch(e) {
                return res.status(500).json({ success: false, error: e.message });
            }
        }

        // Add Product Item to Catalog
        if (action === 'add_product') {
            try {
                const { catalog_id: targetCatId, product_name, price, currency, description: pDesc, image_url, retailer_id } = req.body || {};
                if (!targetCatId) return res.status(400).json({ error: 'Catalog ID is required' });
                if (!product_name) return res.status(400).json({ error: 'Product name is required' });

                const pSku = retailer_id || `SKU_${Date.now()}`;
                const inserted = await sql`
                    INSERT INTO catalog_items (catalog_id, company_id, retailer_id, name, description, price, currency, image_url)
                    VALUES (${targetCatId}, ${companyId}, ${pSku}, ${product_name}, ${pDesc || ''}, ${parseFloat(price || 0) || 0}, ${currency || 'INR'}, ${image_url || ''})
                    RETURNING *
                `;

                return res.status(200).json({
                    success: true,
                    message: `Product "${product_name}" added to catalog!`,
                    product: inserted[0]
                });
            } catch(e) {
                return res.status(500).json({ success: false, error: e.message });
            }
        }

        // Link Meta Commerce Manager Catalog to WhatsApp
        if (catalog_id || action === 'link_catalog') {
            try {
                const cleanCatalogId = String(catalog_id).trim();
                if (!cleanCatalogId) {
                    return res.status(400).json({ error: 'Catalog ID is required' });
                }

                if (!isConfigured) {
                    // Save locally for records
                    await sql`
                        INSERT INTO product_catalogs (company_id, name, meta_catalog_id, description)
                        VALUES (${companyId}, ${'Linked Meta Catalog #' + cleanCatalogId}, ${cleanCatalogId}, 'Connected Meta Commerce Manager catalog')
                    `;
                    return res.status(200).json({
                        success: true,
                        message: `Catalog #${cleanCatalogId} saved. Configure Meta credentials in Settings to link live.`,
                        catalog_id: cleanCatalogId
                    });
                }

                const url = `https://graph.facebook.com/v19.0/${wabaId}/product_catalogs`;
                const formData = new URLSearchParams();
                formData.append('catalog_id', cleanCatalogId);

                const metaRes = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: formData.toString()
                });

                const data = await metaRes.json();

                if (data.error) {
                    const errMsg = data.error.error_user_msg || data.error.error_data?.details || data.error.message || JSON.stringify(data.error);
                    return res.status(400).json({ success: false, error: errMsg });
                }

                // Update in local DB
                try {
                    await sql`
                        INSERT INTO product_catalogs (company_id, name, meta_catalog_id, description)
                        VALUES (${companyId}, ${'Meta Catalog #' + cleanCatalogId}, ${cleanCatalogId}, 'Connected Meta Commerce Manager catalog')
                    `;
                } catch(e) {}

                return res.status(200).json({
                    success: true,
                    message: `Catalog #${cleanCatalogId} successfully connected to WhatsApp!`,
                    catalog_id: cleanCatalogId
                });
            } catch(err) {
                return res.status(500).json({ success: false, error: err.message });
            }
        }

        return res.status(400).json({ error: 'Invalid catalog action.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
