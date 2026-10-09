module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const env = req.env || process.env || {};
        const { base64Data, fileName, mimeType } = req.body || {};
        if (!base64Data || !fileName || !mimeType) {
            return res.status(400).json({ error: 'Missing required fields (base64Data, fileName, mimeType)' });
        }

        let phoneId = env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
        let token = env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
        let appId = env.WHATSAPP_APP_ID || process.env.WHATSAPP_APP_ID || 'app';

        const companyId = req.query.company_id || (req.body && req.body.company_id);
        if (companyId) {
            try {
                const { getDb } = require('../lib/db');
                const sql = getDb(env);
                const cos = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
                if (cos.length > 0) {
                    if (cos[0].whatsapp_phone_number_id) phoneId = cos[0].whatsapp_phone_number_id;
                    if (cos[0].whatsapp_access_token) token = cos[0].whatsapp_access_token;
                    if (cos[0].whatsapp_app_id) appId = cos[0].whatsapp_app_id;
                }
            } catch(e) {
                console.error("DB company lookup error in upload-media:", e);
            }
        }

        if (!token) {
            return res.status(400).json({ error: 'WhatsApp Access Token is not configured for this company.' });
        }

        const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(cleanBase64, 'base64');

        let handle = null;
        let mediaId = null;
        let lastMetaError = null;

        // Step A: Attempt Resumable Upload Session API to get handle 'h' for template headers
        try {
            const sessionUrl = `https://graph.facebook.com/v19.0/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${token}`;
            const sessionRes = await fetch(sessionUrl, { method: 'POST' });
            const sessionData = await sessionRes.json();

            if (sessionData && sessionData.id) {
                const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${sessionData.id}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `OAuth ${token}`,
                        'file_offset': '0',
                        'Content-Type': mimeType
                    },
                    body: buffer
                });
                const uploadData = await uploadRes.json();
                if (uploadData && uploadData.h) {
                    handle = uploadData.h;
                } else if (uploadData && uploadData.error) {
                    lastMetaError = uploadData.error.message || JSON.stringify(uploadData.error);
                }
            } else if (sessionData && sessionData.error) {
                lastMetaError = sessionData.error.message || JSON.stringify(sessionData.error);
            }
        } catch (err) {
            console.error("Server-side Meta Resumable Upload Session error:", err);
        }

        // Step B: Standard WhatsApp Media API upload (/{phone_id}/media)
        if (phoneId) {
            try {
                const formData = new FormData();
                formData.append('messaging_product', 'whatsapp');
                formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

                const metaRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/media`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });
                const metaData = await metaRes.json();
                if (metaData && metaData.id) {
                    mediaId = metaData.id;
                    if (!handle) handle = metaData.id;
                } else if (metaData && metaData.error) {
                    if (!lastMetaError) lastMetaError = metaData.error.message || JSON.stringify(metaData.error);
                }
            } catch (err) {
                console.error("Meta media upload error:", err);
            }
        }

        if (!handle && !mediaId) {
            return res.status(400).json({
                error: `Meta Media Upload Failed: ${lastMetaError || 'Could not generate upload handle or media ID from Meta API.'}`
            });
        }

        return res.status(200).json({
            success: true,
            handle: handle,
            media_id: mediaId
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};

