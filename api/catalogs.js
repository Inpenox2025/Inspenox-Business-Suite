const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const companyId = req.query.company_id || (req.body && req.body.company_id) || (req.headers && req.headers['x-company-id']);

    let isMaster = false;
    let company = null;

    if (companyId && companyId !== 'default' && companyId !== 'parent' && companyId !== 'all') {
        try {
            const sql = getDb(env);
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

    if (!isConfigured) {
        return res.status(200).json({
            success: true,
            is_configured: false,
            connected: false,
            catalogs: [],
            message: 'WhatsApp Business credentials not configured for this account.'
        });
    }

    // GET /api/catalogs - Fetch connected product catalogs from Meta Graph API
    if (req.method === 'GET') {
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

            if (data.error) {
                console.warn('Meta product_catalogs fetch error:', data.error);
                return res.status(200).json({
                    success: false,
                    is_configured: true,
                    connected: false,
                    catalogs: [],
                    error: data.error.message || 'Failed to fetch catalogs from Meta'
                });
            }

            const rawCatalogs = Array.isArray(data.data) ? data.data : [];
            const catalogsWithDetails = [];

            for (const cat of rawCatalogs) {
                let catName = `Catalog #${cat.id}`;
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

                catalogsWithDetails.push({
                    id: cat.id,
                    name: catName,
                    product_count: productCount
                });
            }

            return res.status(200).json({
                success: true,
                is_configured: true,
                connected: catalogsWithDetails.length > 0,
                catalogs: catalogsWithDetails,
                waba_id: wabaId
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

    // POST /api/catalogs - Link an existing Meta Commerce Manager Catalog ID to this WABA
    if (req.method === 'POST') {
        try {
            const { catalog_id } = req.body || {};
            if (!catalog_id || !String(catalog_id).trim()) {
                return res.status(400).json({ error: 'Catalog ID is required (found in Meta Commerce Manager Settings).' });
            }

            const cleanCatalogId = String(catalog_id).trim();

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
                return res.status(400).json({
                    success: false,
                    error: errMsg
                });
            }

            return res.status(200).json({
                success: true,
                message: `Catalog #${cleanCatalogId} successfully connected to WhatsApp!`,
                catalog_id: cleanCatalogId
            });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
