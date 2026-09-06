const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const env = req.env || process.env || {};
        const { target, type, content, media_id, template_name, template_language } = req.body;

        const sql = getDb(env);
        let customersToMessage = [];
        
        if (target === 'all') {
            customersToMessage = await sql`SELECT id, name, phone FROM customers`;
        } else if (Array.isArray(target)) {
            customersToMessage = await sql`SELECT id, name, phone FROM customers WHERE id = ANY(${target})`;
        } else {
            return res.status(400).json({ error: 'Invalid target' });
        }

        const phoneId = env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733';
        const token = env.WHATSAPP_ACCESS_TOKEN;
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
                const primaryLang = template_language || 'en';
                const langCodes = [primaryLang];
                if (primaryLang === 'en') langCodes.push('en_US');
                else if (primaryLang === 'en_US') langCodes.push('en');

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

                let lastErr = null;

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
                    INSERT INTO messages (customer_id, direction, type, content, wa_message_id, status) 
                    VALUES (${cust.id}, 'outbound', ${type}, ${saveContent}, ${wa_message_id}, 'sent')
                `;
            }

            // Small delay to prevent rate limits
            await new Promise(r => setTimeout(r, 100));
        }

        // Log campaign
        const campaignContent = type === 'template' ? `Template: ${template_name}` : content;
        await sql`
            INSERT INTO campaigns (name, message_type, content, sent_count, failed_count) 
            VALUES (${'Broadcast ' + new Date().toISOString()}, ${type}, ${campaignContent}, ${sent}, ${failed})
        `;

        return res.status(200).json({ success: true, sent, failed, errors });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
