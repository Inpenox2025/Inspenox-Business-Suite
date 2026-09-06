const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    try {
        const sql = getDb();
        
        // Run queries concurrently
        const [customersResult, messagesResult, recentInbound] = await Promise.all([
            sql`SELECT COUNT(*) as count FROM customers`,
            sql`SELECT COUNT(*) as count FROM messages WHERE direction = 'outbound'`,
            sql`
                SELECT m.*, c.name, c.phone 
                FROM messages m
                JOIN customers c ON m.customer_id = c.id
                WHERE m.direction = 'inbound'
                ORDER BY m.created_at DESC
                LIMIT 5
            `
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
