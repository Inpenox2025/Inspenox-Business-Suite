const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    try {
        const { customer_id } = req.query;
        if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });

        const sql = getDb();
        
        // 1. Fetch messages for customer
        const messages = await sql`
            SELECT * FROM messages 
            WHERE customer_id = ${customer_id} 
            ORDER BY created_at ASC
        `;

        // 2. Mark unread inbound messages as read
        await sql`
            UPDATE messages 
            SET status = 'read' 
            WHERE customer_id = ${customer_id} AND direction = 'inbound' AND status = 'delivered'
        `;

        return res.status(200).json(messages);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

