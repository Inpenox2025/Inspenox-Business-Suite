const { getDb } = require('../lib/db');

function formatIndiaPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) {
        return '91' + digits;
    } else if (digits.length > 10) {
        return '91' + digits.slice(-10);
    }
    return digits;
}

module.exports = async (req, res) => {
    const sql = getDb();

    try {
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT true;`;
    } catch(e) {
        // Table/column might already exist
    }

    if (req.method === 'GET') {
        try {
            const customers = await sql`
                SELECT c.*, 
                       (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id) as message_count,
                       (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound' AND m.status = 'delivered') as unread_count,
                       (SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as last_inbound_at,
                       (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as inbound_count,
                       (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'outbound') as outbound_count,
                       (SELECT m.direction FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at ASC LIMIT 1) as first_message_direction
                FROM customers c 
                ORDER BY c.created_at DESC
            `;
            return res.status(200).json(customers);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } 
    
    if (req.method === 'POST') {
        try {
            const { name, phone } = req.body;
            if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
            
            // Clean & format phone number (91 + 10 digits, handling double 91)
            const cleanPhone = formatIndiaPhone(phone);
            
            const result = await sql`
                INSERT INTO customers (name, phone, is_saved) 
                VALUES (${name}, ${cleanPhone}, true) 
                ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, is_saved = true
                RETURNING *
            `;
            return res.status(200).json({ success: true, customer: result[0] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Customer ID required' });
            
            // Delete messages first
            await sql`DELETE FROM messages WHERE customer_id = ${id}`;
            await sql`DELETE FROM customers WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).send('Method Not Allowed');
};
