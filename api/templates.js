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
        // Parent company Inspenox credentials strictly come from ENV
        phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
        wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        token = env.WHATSAPP_ACCESS_TOKEN;
        verifyToken = env.WHATSAPP_VERIFY_TOKEN;
        isConfigured = !!(phoneId && wabaId && token && verifyToken);
    } else if (company) {
        // Child companies credentials strictly come from DB
        phoneId = company.whatsapp_phone_number_id;
        wabaId = company.whatsapp_business_account_id;
        token = company.whatsapp_access_token;
        verifyToken = company.whatsapp_verify_token;
        isConfigured = !!(phoneId && wabaId && token && verifyToken);
    }

    const isViewOnly = !isConfigured;

    // Mutating actions (Create, Edit, Delete) are strictly disallowed if not configured
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        if (isViewOnly) {
            return res.status(403).json({
                error: 'Templates are in view-only access. Configure Meta app details in Settings to create or manage templates for other companies.'
            });
        }
    }

    if (req.method === 'GET') {
        try {
            // For companies without configured Meta credentials, return view-only mode with empty list.
            // NEVER fall back to expired system ENV token!
            if (!isConfigured) {
                return res.status(200).json({
                    is_view_only: true,
                    is_configured: false,
                    message: isMaster 
                        ? 'Meta WhatsApp credentials are not configured in system environment.' 
                        : 'Configure Meta WhatsApp credentials in Settings to create or manage templates for this company.',
                    data: []
                });
            }

            const activeWabaId = wabaId;
            const activeToken = token;

            const url = `https://graph.facebook.com/v19.0/${activeWabaId}/message_templates?limit=100`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${activeToken}` }
            });

            const data = await response.json();
            if (data.error) {
                const errMsg = data.error.message || JSON.stringify(data.error);
                const isTokenExpired = data.error.code === 190 || errMsg.toLowerCase().includes('session has expired') || errMsg.toLowerCase().includes('access token');
                return res.status(200).json({
                    is_view_only: true,
                    is_configured: false,
                    is_token_expired: isTokenExpired,
                    error: isTokenExpired 
                        ? 'Meta WhatsApp Access Token has expired. Please update or refresh your Access Token in Settings -> Meta Credentials.'
                        : errMsg,
                    data: []
                });
            }

            let libraryMedia = [];
            let cachedMediaMap = new Map();
            try {
                const sql = getDb(env);
                libraryMedia = await sql`SELECT id, name, type, meta_media_id, file_url FROM media_library ORDER BY id DESC LIMIT 20`;
                
                await sql`
                    CREATE TABLE IF NOT EXISTS template_media_cache (
                        id SERIAL PRIMARY KEY,
                        company_id INT,
                        phone_number_id TEXT,
                        template_name TEXT,
                        source_url TEXT,
                        meta_media_id TEXT,
                        media_type TEXT DEFAULT 'image',
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    );
                `;

                const cachedRows = await sql`
                    SELECT template_name, meta_media_id, source_url 
                    FROM template_media_cache 
                    WHERE (phone_number_id = ${phoneId || ''} OR company_id = ${company ? company.id : 0})
                `;
                cachedRows.forEach(row => {
                    if (row.template_name) cachedMediaMap.set(row.template_name.toLowerCase(), row.meta_media_id);
                    if (row.source_url) cachedMediaMap.set(row.source_url, row.meta_media_id);
                });
            } catch (e) {
                console.error('Error fetching template_media_cache:', e);
            }

            const templates = (data.data || []).map(t => {
                const headerComp = (t.components || []).find(c => c.type === 'HEADER');
                let headerMedia = null;
                if (headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                    let url = null;
                    let handle = null;
                    if (headerComp.example) {
                        if (Array.isArray(headerComp.example.header_url) && headerComp.example.header_url[0]) {
                            url = headerComp.example.header_url[0];
                        } else if (typeof headerComp.example.header_url === 'string') {
                            url = headerComp.example.header_url;
                        }

                        if (Array.isArray(headerComp.example.header_handle) && headerComp.example.header_handle[0]) {
                            const h = headerComp.example.header_handle[0];
                            if (h.startsWith('http://') || h.startsWith('https://')) {
                                url = h;
                            } else {
                                handle = h;
                            }
                        } else if (typeof headerComp.example.header_handle === 'string') {
                            const h = headerComp.example.header_handle;
                            if (h.startsWith('http://') || h.startsWith('https://')) {
                                url = h;
                            } else {
                                handle = h;
                            }
                        }
                    }

                    const tNameLower = (t.name || '').toLowerCase();
                    const cachedMediaId = cachedMediaMap.get(tNameLower) || (url ? cachedMediaMap.get(url) : null);

                    const formatLower = headerComp.format.toLowerCase();
                    const fallbackLib = (!url && !handle && !cachedMediaId) ? libraryMedia.find(m => m.type === formatLower) : null;
                    const fallbackMediaId = fallbackLib ? (fallbackLib.meta_media_id || fallbackLib.file_url) : null;

                    // Prefer verified native Meta Media ID over temporary scontent.whatsapp.net CDN URLs
                    let effectiveMediaId = cachedMediaId || handle;
                    if (!effectiveMediaId) {
                        if (url && !url.includes('scontent.whatsapp.net') && !url.includes('lookaside.fbsbx.com') && !url.includes('fbcdn.net')) {
                            effectiveMediaId = url;
                        } else {
                            effectiveMediaId = fallbackMediaId || url || null;
                        }
                    }

                    headerMedia = {
                        format: formatLower,
                        formatUpper: headerComp.format,
                        url: url,
                        handle: handle,
                        media_id: effectiveMediaId,
                        cached_meta_media_id: cachedMediaId || null,
                        has_meta_media: !!(url || handle || cachedMediaId),
                        has_fallback_media: !!fallbackMediaId,
                        fallback_name: fallbackLib ? fallbackLib.name : null
                    };
                }

                return {
                    ...t,
                    header_media: headerMedia,
                    is_view_only: isViewOnly
                };
            });

            return res.status(200).json({
                is_view_only: isViewOnly,
                is_configured: isConfigured,
                message: isViewOnly ? 'Configure Meta app details in Settings to create or manage templates for other companies.' : null,
                data: templates
            });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Edit Template Endpoint (PUT or POST with action=edit / id)
    if (req.method === 'PUT' || (req.method === 'POST' && (req.query.action === 'edit' || req.query.id || (req.body && req.body.id && req.body.is_edit)))) {
        try {
            const { id, category, components } = req.body || {};
            const rawTemplateId = req.query.id || id;

            if (!rawTemplateId) {
                return res.status(400).json({ error: 'Template ID is required for editing.' });
            }

            let targetId = rawTemplateId;

            // If rawTemplateId is a template name slug (non-numeric), lookup numeric Meta template ID from WABA list
            if (isNaN(rawTemplateId)) {
                try {
                    const listRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(rawTemplateId)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const listData = await listRes.json();
                    if (listData.data && listData.data.length > 0 && listData.data[0].id) {
                        targetId = listData.data[0].id;
                    }
                } catch (e) {
                    console.error('Template ID lookup error:', e);
                }
            }

            const url = `https://graph.facebook.com/v19.0/${targetId}`;
            const bodyPayload = {};
            if (category) bodyPayload.category = category.toUpperCase();
            if (components && Array.isArray(components)) bodyPayload.components = components;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyPayload)
            });

            const data = await response.json();
            if (data.error) {
                const errorMsg = data.error.error_user_msg || data.error.error_data?.details || data.error.message || JSON.stringify(data.error);
                return res.status(400).json({ error: errorMsg });
            }

            return res.status(200).json({ success: true, template: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Create Template Endpoint (POST)
    if (req.method === 'POST') {
        try {
            const { name, category, language, components, parameter_format } = req.body || {};

            if (!name || !category || !language || !components || !Array.isArray(components)) {
                return res.status(400).json({ error: 'Missing required template parameters (name, category, language, components array).' });
            }

            const formattedName = name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

            // Validate media header components require example.header_handle
            const headerComp = components.find(c => c.type === 'HEADER');
            if (headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                if (!headerComp.example || (!headerComp.example.header_handle && !headerComp.example.header_url)) {
                    return res.status(400).json({
                        error: `Header component of type ${headerComp.format} is missing expected field(s) (example). Please upload a sample ${headerComp.format.toLowerCase()} file.`
                    });
                }
            }

            const payloadToMeta = {
                name: formattedName,
                category: category.toUpperCase(),
                language: language,
                components: components
            };
            if (parameter_format) {
                payloadToMeta.parameter_format = parameter_format;
            }

            const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payloadToMeta)
            });

            const data = await response.json();
            if (data.error) {
                const errorMsg = data.error.error_user_msg || data.error.error_data?.details || data.error.message || JSON.stringify(data.error);
                return res.status(400).json({ error: errorMsg });
            }

            return res.status(200).json({ success: true, template: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Delete Template Endpoint (DELETE)
    if (req.method === 'DELETE') {
        try {
            const name = req.query.name || (req.body && req.body.name);
            const templateId = req.query.id || (req.body && req.body.id);

            if (!name && !templateId) {
                return res.status(400).json({ error: 'Template name or ID required for deletion.' });
            }

            // Fallback strategy list for Meta Cloud API deletion
            const urlsToTry = [];

            if (name) {
                let urlWithName = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;
                if (templateId && !isNaN(templateId)) {
                    urlWithName += `&hsm_id=${templateId}`;
                }
                urlsToTry.push(urlWithName);
            }

            if (templateId && !isNaN(templateId)) {
                urlsToTry.push(`https://graph.facebook.com/v19.0/${templateId}`);
            }

            if (name) {
                urlsToTry.push(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(name)}`);
            }

            let lastError = null;
            for (const targetUrl of urlsToTry) {
                try {
                    const response = await fetch(targetUrl, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    const data = await response.json();
                    if (!data.error && (data.success || data.result)) {
                        return res.status(200).json({ success: true, result: data });
                    }
                    if (data.error) {
                        lastError = data.error;
                    }
                } catch (err) {
                    console.error('Fetch error during template delete try:', err);
                }
            }

            // Format Meta response error clearly
            let errorMsg = lastError ? (lastError.message || JSON.stringify(lastError)) : 'Meta API failed to delete template.';
            if (errorMsg.includes('Invalid parameter') || (name && name.toLowerCase().startsWith('hello_world'))) {
                errorMsg = `Meta Cloud API Notice: Default system sample templates (such as "hello_world") are pre-provisioned and locked by Meta, so they cannot be deleted. Any custom templates created by your account can be deleted freely.`;
            }

            return res.status(200).json({ error: errorMsg });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).send('Method Not Allowed');
};
