module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    const env = req.env || process.env || {};
    const companyId = req.query.company_id || (req.headers && req.headers['x-company-id']);

    if (companyId && companyId !== 'default') {
        try {
            const { getDb } = require('../lib/db');
            const sql = getDb(env);
            const companies = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
            if (companies.length > 0) {
                const c = companies[0];
                const isMaster = (c.name || '').toLowerCase().trim() === 'inspenox' || (c.slug && c.slug.toLowerCase() === 'inspenox') || c.is_parent === true || c.is_master === true;
                const isPaid = (c.subscription_status === 'active' && c.subscription_plan && c.subscription_plan.toLowerCase() !== 'none');

                if (isMaster) {
                    return res.status(200).json({
                        meta_phone_id: c.whatsapp_phone_number_id || env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733',
                        meta_token: c.whatsapp_access_token || env.WHATSAPP_ACCESS_TOKEN,
                        waba_id: c.whatsapp_business_account_id || env.WHATSAPP_BUSINESS_ACCOUNT_ID,
                        verify_token: c.whatsapp_verify_token || env.WHATSAPP_VERIFY_TOKEN,
                        app_id: c.whatsapp_app_id || env.WHATSAPP_APP_ID || 'app',
                        phone_numbers: c.whatsapp_phone_numbers || [],
                        is_paid: true
                    });
                }

                // Never set or expose ENV defaults to other companies or unpaid accounts
                return res.status(200).json({
                    meta_phone_id: isPaid ? (c.whatsapp_phone_number_id || null) : null,
                    meta_token: isPaid ? (c.whatsapp_access_token || null) : null,
                    waba_id: isPaid ? (c.whatsapp_business_account_id || null) : null,
                    verify_token: isPaid ? (c.whatsapp_verify_token || null) : null,
                    app_id: isPaid ? (c.whatsapp_app_id || env.WHATSAPP_APP_ID || 'app') : null,
                    phone_numbers: isPaid ? (c.whatsapp_phone_numbers || []) : [],
                    is_paid: isPaid
                });
            }
        } catch(e) {}
    }

    const isMasterEnv = companyId === 'default' || !companyId;
    res.status(200).json({
        meta_phone_id: isMasterEnv ? (env.WHATSAPP_PHONE_NUMBER_ID || '1196613980211733') : null,
        meta_token: isMasterEnv ? env.WHATSAPP_ACCESS_TOKEN : null,
        waba_id: isMasterEnv ? env.WHATSAPP_BUSINESS_ACCOUNT_ID : null,
        verify_token: isMasterEnv ? env.WHATSAPP_VERIFY_TOKEN : null,
        app_id: isMasterEnv ? (env.WHATSAPP_APP_ID || 'app') : null,
        is_paid: isMasterEnv
    });
};
