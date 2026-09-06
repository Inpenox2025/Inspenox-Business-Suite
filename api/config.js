module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const env = req.env || process.env || {};
    const companyId = req.query.company_id;

    if (companyId) {
        try {
            const { getDb } = require('../lib/db');
            const sql = getDb(env);
            const companies = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
            if (companies.length > 0) {
                const c = companies[0];
                return res.status(200).json({
                    meta_phone_id: c.whatsapp_phone_number_id || env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733',
                    meta_token: c.whatsapp_access_token || env.WHATSAPP_ACCESS_TOKEN,
                    waba_id: c.whatsapp_business_account_id || env.WHATSAPP_BUSINESS_ACCOUNT_ID,
                    verify_token: c.whatsapp_verify_token || env.WHATSAPP_VERIFY_TOKEN
                });
            }
        } catch(e) {}
    }

    res.status(200).json({
        meta_phone_id: env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733',
        meta_token: env.WHATSAPP_ACCESS_TOKEN,
        waba_id: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
        verify_token: env.WHATSAPP_VERIFY_TOKEN
    });
};
