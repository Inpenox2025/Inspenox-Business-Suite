const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const env = req.env || process.env || {};
        const { target, type, content, media_id, template_name, template_language, company_id } = req.body;

        const sql = getDb(env);
        let customersToMessage = [];
        const targetCompanyId = company_id || 1;

        if (target === 'all') {
            customersToMessage = await sql`SELECT id, name, phone FROM customers WHERE company_id = ${targetCompanyId} OR company_id IS NULL`;
        } else if (Array.isArray(target)) {
            customersToMessage = await sql`SELECT id, name, phone FROM customers WHERE id = ANY(${target})`;
        } else {
            return res.status(400).json({ error: 'Invalid target' });
        }

        let phoneId = env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733';
        let token = env.WHATSAPP_ACCESS_TOKEN;

        if (company_id) {
            try {
                const cos = await sql`SELECT * FROM companies WHERE id = ${company_id} LIMIT 1`;
                if (cos.length > 0 && cos[0].whatsapp_phone_number_id && cos[0].whatsapp_access_token) {
                    phoneId = cos[0].whatsapp_phone_number_id;
                    token = cos[0].whatsapp_access_token;
                }
            } catch(e) {}
        }

        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

        let sent = 0;
        let failed = 0;
        let errors = [];

        for (const cust of customersToMessage) {
            const cleanPhone = cust.phone ? cust.phone.replace(/[^0-9]/g, '') : '';
            if (!cleanPhone) {
                failed++;
                errors.push(`Invalid phone format for customer ID ${cust.id}`);
                continue;
            }

            let payload = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: cleanPhone,
                type: type
            };

            if (type === 'text') {
                payload.text = { body: content };
            } else if (type === 'image') {
                payload.image = (media_id && media_id.startsWith('http')) ? { link: media_id, caption: content } : { id: media_id, caption: content };
            } else if (type === 'video') {
                payload.video = (media_id && media_id.startsWith('http')) ? { link: media_id, caption: content } : { id: media_id, caption: content };
            }

            let responseData = null;

            if (type === 'template') {
                const custName = (cust.name && cust.name.trim()) ? cust.name.trim() : 'Customer';
                let wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
                if (company_id) {
                    try {
                        const cos = await sql`SELECT * FROM companies WHERE id = ${company_id} LIMIT 1`;
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
                        let mediaObj = null;

                        if (media_id) {
                            mediaObj = (typeof media_id === 'string' && media_id.startsWith('http')) ? { link: media_id } : { id: media_id };
                        } else if (headerComp.example) {
                            if (headerComp.example.header_handle && headerComp.example.header_handle[0]) {
                                mediaObj = { id: headerComp.example.header_handle[0] };
                            } else if (headerComp.example.header_url && headerComp.example.header_url[0]) {
                                mediaObj = { link: headerComp.example.header_url[0] };
                            }
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
                        const isVid = (req.body.media_type === 'video');
                        baseHeaderComp.push({
                            type: "header",
                            parameters: [{
                                type: isVid ? "video" : "image",
                                [isVid ? "video" : "image"]: (typeof media_id === 'string' && media_id.startsWith('http')) ? { link: media_id } : { id: media_id }
                            }]
                        });
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
                failed++;
                let errMsg = data.error.message || `Meta API Error (${data.error.code})`;
                if (data.error.code === 100 && (cleanPhone === '917981656294' || cleanPhone === '7981656294')) {
                    errMsg = `Cannot send to WhatsApp Business account's own registered number (${cleanPhone})`;
                }
                errors.push(errMsg);
            } else {
                sent++;
                const wa_message_id = (data.messages && data.messages[0]) ? data.messages[0].id : 'sent_' + Date.now();
                const saveContent = type === 'template' ? `[Template] ${template_name}` : content;
                await sql`
                    INSERT INTO messages (company_id, customer_id, direction, type, content, wa_message_id, status) 
                    VALUES (${targetCompanyId}, ${cust.id}, 'outbound', ${type}, ${saveContent}, ${wa_message_id}, 'sent')
                `;
            }

            // Small delay to prevent rate limits
            await new Promise(r => setTimeout(r, 100));
        }

        // Log campaign
        const campaignContent = type === 'template' ? `Template: ${template_name}` : content;
        await sql`
            INSERT INTO campaigns (company_id, name, message_type, content, sent_count, failed_count) 
            VALUES (${targetCompanyId}, ${'Broadcast ' + new Date().toISOString()}, ${type}, ${campaignContent}, ${sent}, ${failed})
        `;

        return res.status(200).json({ success: true, sent, failed, errors });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
