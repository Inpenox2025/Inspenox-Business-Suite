const { getDb } = require('../lib/db');

function formatMetaMediaObject(media_id, req) {
    if (!media_id) return null;
    const str = String(media_id).trim();
    if (!str) return null;

    // 1. Numeric Meta Media ID
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (!isNaN(num) && num < Number.MAX_SAFE_INTEGER) {
            return { id: num };
        }
        return { id: str };
    }

    // 2. Meta Resumable Upload handle (e.g. "4::aW1hZ2UvanBlZw==...") or internal Meta handle
    if (str.startsWith('4::') || str.includes('::') || (!str.includes('/') && !str.includes('.'))) {
        return { id: str };
    }

    // 3. Absolute URL (e.g. from Meta CDN / scontent / lookaside)
    if (str.startsWith('http://') || str.startsWith('https://')) {
        return { link: str };
    }

    // 4. Local relative media path hosted on the platform
    const host = (req && req.headers && req.headers['host']) || 'marketing.inspenox.in';
    const proto = (req && req.headers && req.headers['x-forwarded-proto']) || 'https';
    const cleanPath = str.startsWith('/') ? str : '/' + str;
    return { link: `${proto}://${host}${cleanPath}` };
}

// In-memory cache for resolved native Meta Media IDs: key -> { id, time }
const metaMediaIdCache = new Map();

async function resolveNativeMetaMediaId(source, phoneId, token, format = 'image') {
    if (!source || !phoneId || !token) return null;
    const str = String(source).trim();
    if (!str) return null;

    // 1. Numeric Meta Media ID or Meta Resumable Upload handle
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        return (!isNaN(num) && num < Number.MAX_SAFE_INTEGER) ? { id: num } : { id: str };
    }
    if (str.startsWith('4::') || str.includes('::') || (!str.includes('/') && !str.includes('.'))) {
        return { id: str };
    }

    // 2. URL (scontent.whatsapp.net, fbcdn.net, or external URL)
    if (str.startsWith('http://') || str.startsWith('https://')) {
        const cacheKey = `${phoneId}:${str}`;
        const cached = metaMediaIdCache.get(cacheKey);
        if (cached && (Date.now() - cached.time < 24 * 60 * 60 * 1000)) {
            return { id: cached.id };
        }

        try {
            const resp = await fetch(str);
            if (resp.ok) {
                const buffer = await resp.arrayBuffer();
                const contentType = resp.headers.get('content-type') || (format === 'video' ? 'video/mp4' : (format === 'document' ? 'application/pdf' : 'image/png'));
                const ext = format === 'video' ? 'mp4' : (format === 'document' ? 'pdf' : 'png');
                const filename = `template_asset_${Date.now()}.${ext}`;

                const formData = new FormData();
                formData.append('messaging_product', 'whatsapp');
                formData.append('type', contentType);
                formData.append('file', new Blob([buffer], { type: contentType }), filename);

                const uploadResp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/media`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const uploadJson = await uploadResp.json();
                if (uploadJson && uploadJson.id) {
                    metaMediaIdCache.set(cacheKey, { id: uploadJson.id, time: Date.now() });
                    return { id: uploadJson.id };
                }
            }
        } catch (e) {
            console.error('Error auto-uploading media URL to Meta Media API:', e);
        }

        return { link: str };
    }

    return null;
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const env = req.env || process.env || {};
        const { customer_id, type, content, media_id, media_type, template_name, template_language, company_id } = req.body;

        if (!customer_id || !type) {
            return res.status(400).json({ error: 'Missing customer_id or type' });
        }

        const sql = getDb(env);

        // Fetch customer details
        const customers = await sql`SELECT * FROM customers WHERE id = ${customer_id} LIMIT 1`;
        if (customers.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        const customer = customers[0];
        const cleanPhone = customer.phone ? customer.phone.replace(/[^0-9]/g, '') : '';

        if (!cleanPhone) {
            return res.status(400).json({ error: 'Invalid customer phone number format' });
        }

        const companyId = company_id || customer.company_id || 'default';

        let phoneId = null;
        let token = null;

        let isMaster = false;
        if (!companyId || String(companyId) === 'default' || String(companyId) === 'parent') {
            isMaster = true;
        } else {
            try {
                const cos = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
                if (cos.length > 0) {
                    isMaster = (cos[0].slug || '').toLowerCase() === 'inspenox' || (cos[0].name || '').toLowerCase() === 'inspenox';
                    const isPaid = cos[0].subscription_status === 'active' && cos[0].subscription_plan && cos[0].subscription_plan.toLowerCase() !== 'none';

                    if (!isMaster && !isPaid) {
                        return res.status(403).json({ error: 'Subscription Required: You must have an active paid subscription to send WhatsApp messages. Please subscribe in Subscriptions & Billing.' });
                    }

                    const requestedPhoneId = req.body && (req.body.phone_number_id || req.body.phone_id);
                    if (requestedPhoneId && cos[0].whatsapp_access_token) {
                        phoneId = requestedPhoneId;
                        token = cos[0].whatsapp_access_token;
                    } else if (cos[0].whatsapp_phone_number_id && cos[0].whatsapp_access_token) {
                        phoneId = cos[0].whatsapp_phone_number_id;
                        token = cos[0].whatsapp_access_token;
                    } else if (isMaster) {
                        phoneId = requestedPhoneId || env.WHATSAPP_PHONE_NUMBER_ID;
                        token = env.WHATSAPP_ACCESS_TOKEN;
                    } else {
                        return res.status(400).json({ error: 'Meta WhatsApp credentials are not configured for your workspace. Please configure Phone ID and Access Token in Meta Credentials.' });
                    }
                }
            } catch(e) {}
        }

        if (isMaster) {
            const requestedPhoneId = req.body && (req.body.phone_number_id || req.body.phone_id);
            phoneId = requestedPhoneId || env.WHATSAPP_PHONE_NUMBER_ID;
            token = env.WHATSAPP_ACCESS_TOKEN;
        }

        if (!phoneId || !token) {
            return res.status(400).json({ error: 'Meta WhatsApp credentials not configured for this company.' });
        }

        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

        let payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: type
        };

        const mediaObjFormatted = formatMetaMediaObject(media_id, req);

        if (type === 'text') {
            payload.text = { body: content };
        } else if (type === 'image') {
            payload.image = mediaObjFormatted ? { ...mediaObjFormatted, caption: content } : { caption: content };
        } else if (type === 'video') {
            payload.video = mediaObjFormatted ? { ...mediaObjFormatted, caption: content } : { caption: content };
        } else if (type === 'document') {
            payload.document = mediaObjFormatted ? { ...mediaObjFormatted, caption: content, filename: req.body.filename || 'Document' } : { caption: content };
        } else if (type === 'audio') {
            payload.audio = mediaObjFormatted || {};
        }

        let responseData = null;

        if (type === 'template') {
            const custName = (customer.name && customer.name.trim()) ? customer.name.trim() : 'Customer';
            let wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
            const targetCoId = companyId || customer.company_id;
            if (targetCoId) {
                try {
                    const cos = await sql`SELECT * FROM companies WHERE id = ${targetCoId} LIMIT 1`;
                    if (cos.length > 0 && cos[0].whatsapp_business_account_id) {
                        wabaId = cos[0].whatsapp_business_account_id;
                    }
                } catch(e) {}
            }

            // Fetch template metadata once from Meta WABA API if available
            let templateMeta = null;
            if (wabaId && token && template_name) {
                try {
                    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(template_name)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const metaData = await metaRes.json();
                    if (metaData.data && metaData.data.length > 0) {
                        templateMeta = metaData.data[0];
                    }
                } catch (e) {
                    console.error('Failed to fetch template metadata:', e);
                }

                if (templateMeta && templateMeta.status && templateMeta.status.toUpperCase() !== 'APPROVED') {
                    return res.status(400).json({
                        error: `Template "${template_name}" is currently "${templateMeta.status}". Only approved Meta message templates can be sent.`
                    });
                }
            }
            

            // Pre-resolve default media for templates if header requires media and media_id not explicitly given
            let templateDefaultMediaObj = null;
            if (templateMeta) {
                const headerComp = (templateMeta.components || []).find(c => c.type === 'HEADER');
                if (headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                    const format = headerComp.format.toLowerCase();
                    let defaultSource = media_id;
                    if (!defaultSource && headerComp.example) {
                        const handle = Array.isArray(headerComp.example.header_handle) ? headerComp.example.header_handle[0] : headerComp.example.header_handle;
                        const url = Array.isArray(headerComp.example.header_url) ? headerComp.example.header_url[0] : headerComp.example.header_url;
                        defaultSource = handle || url;
                    }
                    if (!defaultSource) {
                        try {
                            const fallbackMedia = await sql`SELECT meta_media_id, file_url FROM media_library WHERE type = ${format} ORDER BY id DESC LIMIT 1`;
                            if (fallbackMedia && fallbackMedia.length > 0) {
                                defaultSource = fallbackMedia[0].meta_media_id || fallbackMedia[0].file_url;
                            }
                        } catch (e) {}
                    }
                    if (defaultSource) {
                        templateDefaultMediaObj = await resolveNativeMetaMediaId(defaultSource, phoneId, token, format) || formatMetaMediaObject(defaultSource, req);
                    }
                }
            }

            const primaryLang = template_language || (templateMeta ? templateMeta.language : 'en');
            const langCodes = [primaryLang];
            if (primaryLang === 'en') langCodes.push('en_US');
            else if (primaryLang === 'en_US') langCodes.push('en');

            let lastErr = null;

            // Build template payload dynamically based on Meta template definition
            const buildPayloadObj = (langCode) => {
                const componentsPayload = [];
                const tmplComponents = templateMeta ? (templateMeta.components || []) : [];

                // 1. HEADER component (IMAGE, VIDEO, DOCUMENT)
                const headerComp = tmplComponents.find(c => c.type === 'HEADER');
                if (headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                    const format = headerComp.format.toLowerCase();
                    let mediaObj = templateDefaultMediaObj || (media_id ? formatMetaMediaObject(media_id, req) : null);
                    if (!mediaObj && headerComp.example) {
                        const handle = Array.isArray(headerComp.example.header_handle) ? headerComp.example.header_handle[0] : headerComp.example.header_handle;
                        const url = Array.isArray(headerComp.example.header_url) ? headerComp.example.header_url[0] : headerComp.example.header_url;
                        if (handle) mediaObj = formatMetaMediaObject(handle, req);
                        else if (url) mediaObj = formatMetaMediaObject(url, req);
                    }

                    if (mediaObj) {
                        componentsPayload.push({
                            type: "header",
                            parameters: [{
                                type: format,
                                [format]: mediaObj
                            }]
                        });
                    }
                }

                // 2. BODY component (NAMED vs POSITIONAL)
                const bodyComp = tmplComponents.find(c => c.type === 'BODY');
                if (bodyComp) {
                    const bodyParams = [];
                    const isNamed = (templateMeta && templateMeta.parameter_format === 'NAMED') ||
                                    (bodyComp.example && bodyComp.example.body_text_named_params);

                    if (isNamed) {
                        const namedParams = (bodyComp.example && bodyComp.example.body_text_named_params) || [];
                        if (namedParams.length > 0) {
                            namedParams.forEach(p => {
                                bodyParams.push({
                                    type: "text",
                                    parameter_name: p.param_name || "customer_name",
                                    text: custName
                                });
                            });
                        } else if (bodyComp.text) {
                            const matches = bodyComp.text.match(/\{\{([^}]+)\}\}/g);
                            if (matches) {
                                matches.forEach(m => {
                                    const pName = m.replace(/[\{\}]/g, '').trim();
                                    bodyParams.push({
                                        type: "text",
                                        parameter_name: pName,
                                        text: custName
                                    });
                                });
                            }
                        }
                    } else if (bodyComp.text) {
                        const matches = bodyComp.text.match(/\{\{\d+\}\}/g);
                        if (matches) {
                            matches.forEach(() => {
                                bodyParams.push({ type: "text", text: custName });
                            });
                        }
                    }

                    if (bodyParams.length > 0) {
                        componentsPayload.push({
                            type: "body",
                            parameters: bodyParams
                        });
                    }
                }

                return {
                    name: template_name,
                    language: { code: langCode },
                    ...(componentsPayload.length > 0 ? { components: componentsPayload } : {})
                };
            };

            // Strategy 1: Attempt payload constructed directly from Meta metadata
            if (templateMeta) {
                for (const langCode of langCodes) {
                    payload.template = buildPayloadObj(langCode);
                    try {
                        const r = await fetch(url, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const d = await r.json();
                        if (!d.error) {
                            responseData = d;
                            break;
                        } else {
                            lastErr = d.error;
                        }
                    } catch (e) {
                        lastErr = { message: e.message };
                    }
                }
            }

            // Strategy 2: Fallback variation trials if template metadata was unavailable or failed
            if (!responseData) {
                const baseHeaderComp = [];
                if (media_id) {
                    const mType = (req.body.media_type || 'image').toLowerCase();
                    const isVid = (mType === 'video');
                    const isDoc = (mType === 'document');
                    const mediaFormat = isVid ? 'video' : (isDoc ? 'document' : 'image');
                    const mediaObj = formatMetaMediaObject(media_id, req);
                    if (mediaObj) {
                        baseHeaderComp.push({
                            type: "header",
                            parameters: [{
                                type: mediaFormat,
                                [mediaFormat]: mediaObj
                            }]
                        });
                    }
                }

                for (const langCode of langCodes) {
                    const variations = [
                        // Variation 1: Clean static template (e.g. hello_world or no-var templates)
                        {
                            name: template_name,
                            language: { code: langCode },
                            ...(baseHeaderComp.length > 0 ? { components: baseHeaderComp } : {})
                        },
                        // Variation 2: Named Body parameter (Meta NAMED parameter_format)
                        {
                            name: template_name,
                            language: { code: langCode },
                            components: [
                                ...baseHeaderComp,
                                { type: "body", parameters: [{ type: "text", parameter_name: "customer_name", text: custName }] }
                            ]
                        },
                        // Variation 3: Positional Body parameter (Meta POSITIONAL parameter_format)
                        {
                            name: template_name,
                            language: { code: langCode },
                            components: [
                                ...baseHeaderComp,
                                { type: "body", parameters: [{ type: "text", text: custName }] }
                            ]
                        }
                    ];

                    for (const v of variations) {
                        payload.template = v;
                        try {
                            const r = await fetch(url, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            const d = await r.json();
                            if (!d.error) {
                                responseData = d;
                                break;
                            } else {
                                lastErr = d.error;
                            }
                        } catch (e) {
                            lastErr = { message: e.message };
                        }
                    }
                    if (responseData) break;
                }
            }

            if (!responseData) {
                responseData = { error: lastErr };
            }
        } else {
            try {
                const r = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                responseData = await r.json();
            } catch (e) {
                responseData = { error: { message: e.message } };
            }
        }

        const data = responseData;

        if (data.error) {
            let errMsg = data.error.message || `Meta API Error (${data.error.code})`;
            if (data.error.code === 100 && (cleanPhone === '917981656294' || cleanPhone === '7981656294')) {
                errMsg = `Cannot send to WhatsApp Business account's own registered number (${cleanPhone})`;
            }
            return res.status(400).json({ error: errMsg });
        }

        const wa_message_id = (data.messages && data.messages[0]) ? data.messages[0].id : 'sent_' + Date.now();

        // Insert into messages table
        const saveContent = type === 'template' ? `[Template] ${template_name}` : content;
        const msgCompanyId = companyId || customer.company_id || 1;
        let outMediaUrl = null;
        if (media_id) {
            if (mediaObjFormatted && mediaObjFormatted.link) {
                outMediaUrl = mediaObjFormatted.link;
            } else {
                outMediaUrl = `/api/media-proxy?media_id=${encodeURIComponent(media_id)}&company_id=${msgCompanyId}`;
            }
        }
        await sql`
            INSERT INTO messages (company_id, customer_id, direction, type, content, media_url, wa_message_id, status) 
            VALUES (${msgCompanyId}, ${customer_id}, 'outbound', ${type}, ${saveContent}, ${outMediaUrl}, ${wa_message_id}, 'sent')
        `;

        return res.status(200).json({ success: true, message_id: wa_message_id });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
