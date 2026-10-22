const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const env = req.env || process.env || {};
        const { file_length, file_type, mime_type, file_name, company_id } = req.body || {};

        const length = file_length || 0;
        const type = mime_type || file_type || 'video/mp4';

        if (!length) {
            return res.status(400).json({ error: 'Missing file_length parameter' });
        }

        // Hard validation: Meta allows videos up to 16 MB (16,777,216 bytes)
        const MAX_BYTES = 16 * 1024 * 1024;
        if (length > MAX_BYTES) {
            const sizeMb = (length / (1024 * 1024)).toFixed(1);
            return res.status(400).json({
                error: `File size (${sizeMb} MB) exceeds Meta's maximum allowed limit of 16 MB. Please select or compress your file to under 16 MB.`
            });
        }

        let phoneId = null;
        let token = null;
        let appId = 'app';

        const companyIdParam = company_id || (req.query && req.query.company_id) || (req.headers && req.headers['x-company-id']);
        if (String(companyIdParam) === 'default' || String(companyIdParam) === 'parent' || !companyIdParam) {
            phoneId = env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
            token = env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
            appId = env.WHATSAPP_APP_ID || process.env.WHATSAPP_APP_ID || 'app';
        } else {
            try {
                const sql = getDb(env);
                const cos = await sql`SELECT * FROM companies WHERE id = ${companyIdParam} LIMIT 1`;
                if (cos.length > 0) {
                    const isMaster = (cos[0].name || '').toLowerCase().trim() === 'inspenox' || (cos[0].slug || '').toLowerCase() === 'inspenox' || cos[0].is_parent === true;
                    const isPaid = cos[0].subscription_status === 'active' && cos[0].subscription_plan && cos[0].subscription_plan.toLowerCase() !== 'none';

                    if (!isMaster && !isPaid) {
                        return res.status(403).json({ error: 'Subscription Required: You must have an active paid subscription to upload media.' });
                    }

                    if (cos[0].whatsapp_access_token) {
                        token = cos[0].whatsapp_access_token;
                        phoneId = cos[0].whatsapp_phone_number_id;
                        if (cos[0].whatsapp_app_id) appId = cos[0].whatsapp_app_id;
                    } else if (isMaster) {
                        phoneId = env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
                        token = env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
                    } else {
                        return res.status(400).json({ error: 'Meta WhatsApp credentials are not configured for this company.' });
                    }
                }
            } catch (e) {
                console.error("DB lookup error in upload-session:", e);
            }
        }

        if (!token) {
            return res.status(400).json({ error: 'WhatsApp Access Token is not configured for this company.' });
        }

        const sessionUrl = `https://graph.facebook.com/v21.0/${appId}/uploads?file_length=${length}&file_type=${encodeURIComponent(type)}&access_token=${token}`;
        const sessionRes = await fetch(sessionUrl, { method: 'POST' });
        const sessionData = await sessionRes.json();

        if (sessionData && sessionData.id) {
            return res.status(200).json({
                success: true,
                upload_session_id: sessionData.id,
                token: token
            });
        }

        const errMsg = sessionData?.error?.message || 'Failed to create Meta upload session';
        return res.status(400).json({ error: `Meta Upload Session Error: ${errMsg}` });

    } catch (err) {
        console.error("upload-session endpoint exception:", err);
        return res.status(500).json({ error: err.message });
    }
};
