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
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    try {
        const env = req.env || process.env || {};
        const { customer_id } = req.query;
        if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });

        const sql = getDb(env);
        
        // Lookup target customer's phone number to aggregate messages across any duplicate IDs
        const targetCust = await sql`SELECT id, phone FROM customers WHERE id = ${customer_id} LIMIT 1`;
        let messages = [];

        if (targetCust.length > 0 && targetCust[0].phone) {
            const cleanPhone = formatIndiaPhone(targetCust[0].phone);
            const tenDigits = cleanPhone.slice(-10);

            // Get all matching customer IDs with same phone number
            const matchingCusts = await sql`
                SELECT id FROM customers 
                WHERE phone = ${cleanPhone} OR phone = ${tenDigits} OR phone LIKE ${'%' + tenDigits}
            `;
            const custIds = matchingCusts.map(c => c.id);

            messages = await sql`
                SELECT * FROM messages 
                WHERE customer_id = ANY(${custIds}) 
                ORDER BY created_at ASC
            `;

            // Mark unread inbound messages as read across matching IDs
            await sql`
                UPDATE messages 
                SET status = 'read' 
                WHERE customer_id = ANY(${custIds}) AND direction = 'inbound' AND status = 'delivered'
            `;
        } else {
            messages = await sql`
                SELECT * FROM messages 
                WHERE customer_id = ${customer_id} 
                ORDER BY created_at ASC
            `;

            await sql`
                UPDATE messages 
                SET status = 'read' 
                WHERE customer_id = ${customer_id} AND direction = 'inbound' AND status = 'delivered'
            `;
        }

        return res.status(200).json(messages);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

