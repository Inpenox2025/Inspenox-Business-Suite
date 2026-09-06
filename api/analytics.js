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

        const [customersResult, messagesResult, recentInbound] = await Promise.all([
            customersQuery,
            messagesQuery,
            recentInboundQuery
        ]);

        const analytics = {
            total_customers: parseInt(customersResult[0]?.count || 0),
            messages_sent: parseInt(messagesResult[0]?.count || 0),
            recent_inbound: recentInbound || []
        };

        return res.status(200).json(analytics);
    } catch (error) {
        console.error('Analytics fetch error:', error);
        return res.status(500).json({ error: error.message });
    }
};
