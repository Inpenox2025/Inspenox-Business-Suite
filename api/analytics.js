const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const env = req.env || process.env || {};
        const sql = getDb(env);
        const companyId = req.query.company_id || null;

        let wabaId = env.WHATSAPP_BUSINESS_ACCOUNT_ID || null;
        let token = env.WHATSAPP_ACCESS_TOKEN || null;

        if (companyId && companyId !== 'default') {
            try {
                const cos = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
                if (cos.length > 0) {
                    if (cos[0].whatsapp_business_account_id) wabaId = cos[0].whatsapp_business_account_id;
                    if (cos[0].whatsapp_access_token) token = cos[0].whatsapp_access_token;
                }
            } catch (e) {}
        } else if (!wabaId || !token) {
            try {
                const cos = await sql`SELECT * FROM companies ORDER BY id ASC LIMIT 1`;
                if (cos.length > 0) {
                    if (!wabaId && cos[0].whatsapp_business_account_id) wabaId = cos[0].whatsapp_business_account_id;
                    if (!token && cos[0].whatsapp_access_token) token = cos[0].whatsapp_access_token;
                }
            } catch (e) {}
        }

        let customersQuery = companyId && companyId !== 'default' ? 
            sql`SELECT COUNT(*) as count FROM customers WHERE company_id = ${companyId} OR company_id IS NULL` : 
            sql`SELECT COUNT(*) as count FROM customers`;

        let messagesQuery = companyId && companyId !== 'default' ? 
            sql`SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound' AND (company_id = ${companyId} OR company_id IS NULL)` : 
            sql`SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound'`;

        let channelBreakdownQuery = companyId && companyId !== 'default' ?
            sql`SELECT COALESCE(channel, 'whatsapp') as channel, COUNT(*) as count FROM messages WHERE direction = 'outbound' AND (company_id = ${companyId} OR company_id IS NULL) GROUP BY COALESCE(channel, 'whatsapp')` :
            sql`SELECT COALESCE(channel, 'whatsapp') as channel, COUNT(*) as count FROM messages WHERE direction = 'outbound' GROUP BY COALESCE(channel, 'whatsapp')`;

        let categoryBreakdownQuery = companyId && companyId !== 'default' ?
            sql`SELECT COALESCE(type, 'marketing') as type, COUNT(*) as count FROM messages WHERE direction = 'outbound' AND (company_id = ${companyId} OR company_id IS NULL) GROUP BY COALESCE(type, 'marketing')` :
            sql`SELECT COALESCE(type, 'marketing') as type, COUNT(*) as count FROM messages WHERE direction = 'outbound' GROUP BY COALESCE(type, 'marketing')`;

        try {
            await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS template_name TEXT;`;
        } catch (e) {}

        let templateStatsQuery = companyId && companyId !== 'default' ?
            sql`
                SELECT 
                    COALESCE(m.template_name, m.type, 'marketing') as template_name,
                    COUNT(*) as sent_count,
                    COUNT(CASE WHEN m.status = 'delivered' OR m.status = 'read' THEN 1 END) as delivered_count,
                    COUNT(CASE WHEN m.status = 'read' THEN 1 END) as read_count
                FROM messages m
                WHERE m.direction = 'outbound' AND (m.company_id = ${companyId} OR m.company_id IS NULL)
                GROUP BY COALESCE(m.template_name, m.type, 'marketing')
            ` :
            sql`
                SELECT 
                    COALESCE(m.template_name, m.type, 'marketing') as template_name,
                    COUNT(*) as sent_count,
                    COUNT(CASE WHEN m.status = 'delivered' OR m.status = 'read' THEN 1 END) as delivered_count,
                    COUNT(CASE WHEN m.status = 'read' THEN 1 END) as read_count
                FROM messages m
                WHERE m.direction = 'outbound'
                GROUP BY COALESCE(m.template_name, m.type, 'marketing')
            `;

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

        let recentInboundQuery = companyId && companyId !== 'default' ? 
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

        let uniqueInboundRepliesQuery = companyId && companyId !== 'default' ?
            sql`SELECT COUNT(DISTINCT customer_id) as count FROM messages WHERE direction = 'inbound' AND (company_id = ${companyId} OR company_id IS NULL)` :
            sql`SELECT COUNT(DISTINCT customer_id) as count FROM messages WHERE direction = 'inbound'`;

        const [customersResult, messagesResult, channelBreakdown, categoryBreakdown, templateStats, companyUsage, recentInbound, inboundRepliesResult] = await Promise.all([
            customersQuery,
            messagesQuery,
            channelBreakdownQuery,
            categoryBreakdownQuery,
            templateStatsQuery,
            companyUsageQuery,
            recentInboundQuery,
            uniqueInboundRepliesQuery
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

        // Fetch Live Direct Meta Graph API Template List & Direct WABA Analytics if credentials exist
        let metaConnected = false;
        let metaTemplates = [];
        let metaError = null;
        let metaDataPoints = [];

        if (wabaId && token) {
            try {
                const nowTs = Math.floor(Date.now() / 1000);
                const startTs = nowTs - (90 * 86400); // 90 days lookback

                const [metaRes, metaAnalyticsRes] = await Promise.all([
                    fetch(`https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=100`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`https://graph.facebook.com/v20.0/${wabaId}?fields=analytics.start(${startTs}).end(${nowTs}).granularity(DAY).metric_types(['SENT','DELIVERED','RECEIVED','COST'])`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                ]);

                const metaData = await metaRes.json();
                if (metaData.data && Array.isArray(metaData.data)) {
                    metaConnected = true;
                    metaTemplates = metaData.data;
                } else if (metaData.error) {
                    metaError = metaData.error.message || JSON.stringify(metaData.error);
                }

                const metaAnalyticsData = await metaAnalyticsRes.json();
                if (metaAnalyticsData.analytics && Array.isArray(metaAnalyticsData.analytics.data_points)) {
                    metaDataPoints = metaAnalyticsData.analytics.data_points;
                }
            } catch (err) {
                metaError = err.message;
            }
        }

        // Aggregate direct Meta WABA analytics metrics
        let metaDirectSent = 0;
        let metaDirectDelivered = 0;
        metaDataPoints.forEach(dp => {
            metaDirectSent += (dp.sent || 0);
            metaDirectDelivered += (dp.delivered || 0);
        });

        // Map template stats from DB & Meta templates
        const dbTemplateMap = {};
        (templateStats || []).forEach(ts => {
            const tKey = (ts.template_name || '').toLowerCase().trim();
            if (tKey) {
                dbTemplateMap[tKey] = {
                    sent: parseInt(ts.sent_count || 0),
                    delivered: parseInt(ts.delivered_count || ts.sent_count || 0),
                    read: parseInt(ts.read_count || 0)
                };
            }
        });

        const templateInsightsList = [];
        let totalMetaSpent = 0;
        let totalMetaSent = 0;
        let totalMetaDelivered = 0;
        let totalMetaRead = 0;

        if (metaTemplates.length > 0) {
            // Find total DB sent msgs across mapped templates
            let totalDbMappedSent = 0;
            metaTemplates.forEach(t => {
                const tNameLower = t.name.toLowerCase().trim();
                if (dbTemplateMap[tNameLower] || dbTemplateMap[t.name]) {
                    totalDbMappedSent += (dbTemplateMap[tNameLower] || dbTemplateMap[t.name]).sent;
                }
            });

            metaTemplates.forEach((t, idx) => {
                const tName = t.name;
                const tNameLower = tName.toLowerCase().trim();
                const dbStat = dbTemplateMap[tNameLower] || dbTemplateMap[tName] || { sent: 0, delivered: 0, read: 0 };

                let sent = dbStat.sent || 0;
                let delivered = dbStat.delivered || 0;
                let read = dbStat.read || 0;
                const replies = 0;

                // If DB logs don't have per-template breakdown, but Meta direct total sent > 0, reflect Meta direct stats on active templates
                if (totalDbMappedSent === 0 && metaDirectSent > 0) {
                    if (tNameLower.includes('welcome') || idx === 0) {
                        sent = metaDirectSent;
                        delivered = metaDirectDelivered;
                    }
                }

                const category = (t.category || 'MARKETING').toUpperCase();
                const rate = category === 'UTILITY' ? RATES.whatsapp_utility : (category === 'AUTHENTICATION' ? RATES.whatsapp_authentication : (category === 'SERVICE' ? RATES.whatsapp_service : RATES.whatsapp_marketing));
                const amountSpent = parseFloat((delivered * rate).toFixed(2));
                const readPercent = delivered > 0 ? Math.round((read / delivered) * 100) : 0;

                totalMetaSpent += amountSpent;
                totalMetaSent += sent;
                totalMetaDelivered += delivered;
                totalMetaRead += read;

                templateInsightsList.push({
                    id: t.id || tName,
                    name: tName,
                    category: category,
                    status: (t.status || 'APPROVED').toUpperCase(),
                    language: t.language || (t.language_code || 'en'),
                    quality_score: t.quality_score?.score || 'HIGH',
                    sent: sent,
                    delivered: delivered,
                    read: read,
                    read_percent: readPercent,
                    replies: replies,
                    cost_per_delivered: rate,
                    amount_spent: amountSpent
                });
            });
        }

        // If no templates from Meta, construct template metrics from database
        if (templateInsightsList.length === 0) {
            (templateStats || []).forEach((ts, idx) => {
                const sent = parseInt(ts.sent_count || 0);
                const delivered = parseInt(ts.delivered_count || ts.sent_count || 0);
                const read = parseInt(ts.read_count || 0);
                const amountSpent = parseFloat((delivered * RATES.whatsapp_marketing).toFixed(2));
                const readPercent = delivered > 0 ? Math.round((read / delivered) * 100) : 0;

                totalMetaSpent += amountSpent;
                totalMetaSent += sent;
                totalMetaDelivered += delivered;
                totalMetaRead += read;

                templateInsightsList.push({
                    id: `tpl_${idx + 1}`,
                    name: ts.template_name,
                    category: 'MARKETING',
                    status: 'APPROVED',
                    language: 'en',
                    quality_score: 'HIGH',
                    sent: sent,
                    delivered: delivered,
                    read: read,
                    read_percent: readPercent,
                    replies: 0,
                    cost_per_delivered: 0.8631,
                    amount_spent: amountSpent
                });
            });
        }

        const totalReplies = parseInt(inboundRepliesResult[0]?.count || 0);

        const company_usage_list = (companyUsage || []).map(cu => {
            const m_cnt = parseInt(cu.wa_marketing_count || 0);
            const u_cnt = parseInt(cu.wa_utility_count || 0);
            const a_cnt = parseInt(cu.wa_auth_count || 0);
            const e_cnt = parseInt(cu.email_count || 0);
            const s_cnt = parseInt(cu.sms_count || 0);
            const total_out = m_cnt + u_cnt + a_cnt + e_cnt + s_cnt;
            const c_cost = (m_cnt * RATES.whatsapp_marketing) + (u_cnt * RATES.whatsapp_utility) + (a_cnt * RATES.whatsapp_authentication) + (e_cnt * RATES.email) + (s_cnt * RATES.sms);
            return {
                id: cu.id,
                name: cu.name,
                wa_marketing_count: m_cnt,
                wa_utility_count: u_cnt,
                wa_auth_count: a_cnt,
                email_count: e_cnt,
                sms_count: s_cnt,
                total_outbound: total_out,
                est_cost: parseFloat(c_cost.toFixed(4))
            };
        });

        const analytics = {
            meta_connected: metaConnected,
            meta_error: metaError,
            waba_id: wabaId || null,
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
            meta_direct_insights: {
                total_amount_spent: parseFloat(totalMetaSpent.toFixed(2)) || parseFloat(est_wa_cost.toFixed(2)),
                total_sent: metaDirectSent || totalMetaSent || parseInt(messagesResult[0]?.count || 0),
                total_delivered: metaDirectDelivered || totalMetaDelivered || parseInt(messagesResult[0]?.count || 0),
                total_read: totalMetaRead,
                total_read_percent: (metaDirectDelivered || totalMetaDelivered) > 0 ? Math.round((totalMetaRead / (metaDirectDelivered || totalMetaDelivered)) * 100) : 0,
                unique_replies: totalReplies,
                templates: templateInsightsList
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

