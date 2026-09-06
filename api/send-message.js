const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { customer_id, type, content, media_id, template_name, template_language } = req.body;
        if (!customer_id || !type) return res.status(400).json({ error: 'customer_id and type are required' });

        const sql = getDb();
        const customers = await sql`SELECT * FROM customers WHERE id = ${customer_id}`;
        if (customers.length === 0) return res.status(404).json({ error: 'Customer not found' });
        
        const customer = customers[0];
        const phone = customer.phone ? customer.phone.replace(/[^0-9]/g, '') : '';
        if (!phone) return res.status(400).json({ error: 'Customer has an invalid phone number' });

        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733';
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

        let payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
            type: type
        };

        if (type === 'text') {
            payload.text = { preview_url: false, body: content };
        } else if (type === 'image') {
            payload.image = { id: media_id };
            if (content) payload.image.caption = content;
        } else if (type === 'video') {
            payload.video = { id: media_id };
            if (content) payload.video.caption = content;
        }

        let responseData = null;

        if (type === 'template') {
            const custName = (customer.name && customer.name.trim()) ? customer.name.trim() : 'Customer';
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
            let errMsg = data.error.message || `Meta API Error (${data.error.code})`;
            if (data.error.code === 100 && (phone === '917981656294' || phone === '7981656294')) {
                errMsg = "Meta API Error: Cannot send WhatsApp messages to the business's own registered phone number (+91 79816 56294). Please send to a different customer phone number.";
            }
            return res.status(500).json({ error: errMsg });
        }

        const wa_message_id = (data.messages && data.messages[0]) ? data.messages[0].id : 'sent_' + Date.now();

        // Insert into messages table
        const saveContent = type === 'template' ? `[Template] ${template_name}` : content;
        await sql`
            INSERT INTO messages (customer_id, direction, type, content, wa_message_id, status) 
            VALUES (${customer_id}, 'outbound', ${type}, ${saveContent}, ${wa_message_id}, 'sent')
        `;

        return res.status(200).json({ success: true, message_id: wa_message_id });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
