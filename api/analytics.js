const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const env = req.env || process.env || {};
        const sql = getDb(env);
        const companyId = req.query.company_id || null;

        let customersQuery = companyId ? 
            sql`SELECT COUNT(*) as count FROM customers WHERE company_id = ${companyId} OR company_id IS NULL` : 
            sql`SELECT COUNT(*) as count FROM customers`;

        let messagesQuery = companyId ? 
            sql`SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound' AND (company_id = ${companyId} OR company_id IS NULL)` : 
            sql`SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound'`;

        let channelBreakdownQuery = companyId ?
            sql`SELECT COALESCE(channel, 'whatsapp') as channel, COUNT(*) as count FROM messages WHERE direction = 'outbound' AND (company_id = ${companyId} OR company_id IS NULL) GROUP BY COALESCE(channel, 'whatsapp')` :
            sql`SELECT COALESCE(channel, 'whatsapp') as channel, COUNT(*) as count FROM messages WHERE direction = 'outbound' GROUP BY COALESCE(channel, 'whatsapp')`;

        let categoryBreakdownQuery = companyId ?
            sql`SELECT COALESCE(type, 'marketing') as type, COUNT(*) as count FROM messages WHERE direction = 'outbound' AND (company_id = ${companyId} OR company_id IS NULL) GROUP BY COALESCE(type, 'marketing')` :
            sql`SELECT COALESCE(type, 'marketing') as type, COUNT(*) as count FROM messages WHERE direction = 'outbound' GROUP BY COALESCE(type, 'marketing')`;

        let companyUsageQuery = sql`
            SELECT 
                c.id, c.name,
                COUNT(CASE WHEN m.direction = 'outbound' AND (m.channel = 'whatsapp' OR m.channel IS NULL) AND (m.type = 'marketing' OR m.type = 'text' OR m.type = 'image' OR m.type = 'template') THEN 1 END) as wa_marketing_count,
                COUNT(CASE WHEN m.direction = 'outbound' AND (m.channel = 'whatsapp' OR m.channel IS NULL) AND m.type = 'utility' THEN 1 END) as wa_utility_count,
                COUNT(CASE WHEN m.direction = 'outbound' AND (m.channel = 'whatsapp' OR m.channel IS NULL) AND m.type = 'authentication' THEN 1 END) as wa_auth_count,
                COUNT(CASE WHEN m.direction = 'outbound' AND m.channel = 'email' THEN 1 END) as email_count,
                COUNT(CASE WHEN m.direction = 'outbound' AND m.channel = 'sms' THEN 1 END) as sms_count,
                COUNT(CASE WHEN m.direction = 'outbound' THEN 1 END) as total_outbound
            FROM companies c
            LEFT JOIN messages m ON m.company_id = c.id
            GROUP BY c.id, c.name
            ORDER BY c.id ASC
        `;

        let recentInboundQuery = companyId ? 
            sql`
                SELECT m.*, c.name, c.phone 
                FROM messages m
                JOIN customers c ON m.customer_id = c.id
                WHERE m.direction = 'inbound' AND (m.company_id = ${companyId} OR m.company_id IS NULL)
                ORDER BY m.created_at DESC
                LIMIT 5
            ` : 
            sql`
                SELECT m.*, c.name, c.phone 
                FROM messages m
                JOIN customers c ON m.customer_id = c.id
                WHERE m.direction = 'inbound'
                ORDER BY m.created_at DESC
                LIMIT 5
            `;

        const [customersResult, messagesResult, channelBreakdown, categoryBreakdown, companyUsage, recentInbound] = await Promise.all([
            customersQuery,
            messagesQuery,
            channelBreakdownQuery,
            categoryBreakdownQuery,
            companyUsageQuery,
            recentInboundQuery
        ]);

        // Official Meta WhatsApp Pricing Rates in INR (₹) effective July 1, 2026
        const RATES = {
            whatsapp_marketing: 0.8631,
            whatsapp_utility: 0.1150,
            whatsapp_authentication: 0.1150,
            whatsapp_service: 0.0000,
            email: 0.05,
            sms: 0.25
        };

        const channels = {};
        (channelBreakdown || []).forEach(r => { channels[r.channel] = parseInt(r.count || 0); });

        const categories = {};
        (categoryBreakdown || []).forEach(r => { categories[r.type] = parseInt(r.count || 0); });

        const wa_marketing = (categories['marketing'] || 0) + (categories['text'] || 0) + (categories['image'] || 0) + (categories['template'] || 0) || parseInt(messagesResult[0]?.count || 0);
        const wa_utility = categories['utility'] || 0;
        const wa_auth = categories['authentication'] || 0;
        const email_sent = channels['email'] || 0;
        const sms_sent = channels['sms'] || 0;

        const est_wa_cost = (wa_marketing * RATES.whatsapp_marketing) + (wa_utility * RATES.whatsapp_utility) + (wa_auth * RATES.whatsapp_authentication);
        const est_email_cost = email_sent * RATES.email;
        const est_sms_cost = sms_sent * RATES.sms;
        const total_est_cost = est_wa_cost + est_email_cost + est_sms_cost;

        const company_usage_list = (companyUsage || []).map(cu => {
            const m_cnt = parseInt(cu.wa_marketing_count || 0);
            const u_cnt = parseInt(cu.wa_utility_count || 0);
            const a_cnt = parseInt(cu.wa_auth_count || 0);
            const e_cnt = parseInt(cu.email_count || 0);
            const s_cnt = parseInt(cu.sms_count || 0);
            const c_cost = (m_cnt * RATES.whatsapp_marketing) + (u_cnt * RATES.whatsapp_utility) + (a_cnt * RATES.whatsapp_authentication) + (e_cnt * RATES.email) + (s_cnt * RATES.sms);
            return {
                id: cu.id,
                name: cu.name,
                wa_marketing_count: m_cnt,
                wa_utility_count: u_cnt,
                wa_auth_count: a_cnt,
                email_count: e_cnt,
                sms_count: s_cnt,
                total_outbound: parseInt(cu.total_outbound || 0),
                est_cost: parseFloat(c_cost.toFixed(4))
            };
        });

        const analytics = {
            total_customers: parseInt(customersResult[0]?.count || 0),
            messages_sent: parseInt(messagesResult[0]?.count || 0),
            channels: {
                whatsapp: channels['whatsapp'] || parseInt(messagesResult[0]?.count || 0),
                email: email_sent,
                sms: sms_sent
            },
            categories: {
                marketing: wa_marketing,
                utility: wa_utility,
                authentication: wa_auth
            },
            pricing_rates: RATES,
            estimated_costs: {
                whatsapp: parseFloat(est_wa_cost.toFixed(4)),
                email: parseFloat(est_email_cost.toFixed(4)),
                sms: parseFloat(est_sms_cost.toFixed(4)),
                total: parseFloat(total_est_cost.toFixed(4))
            },
            company_usage: company_usage_list,
            recent_inbound: recentInbound || []
        };

        return res.status(200).json(analytics);
    } catch (error) {
        console.error('Analytics fetch error:', error);
        return res.status(500).json({ error: error.message });
    }
};
