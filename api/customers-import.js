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
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { customers } = req.body; // Array of {name, phone}
        if (!customers || !Array.isArray(customers)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        const sql = getDb();
        let added = 0;

        for (const cust of customers) {
            if (!cust.phone) continue;
            const cleanPhone = formatIndiaPhone(cust.phone);
            const name = cust.name || 'Customer';
            
            await sql`
                INSERT INTO customers (name, phone, is_saved) 
                VALUES (${name}, ${cleanPhone}, true) 
                ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, is_saved = true
            `;
            added++;
        }

        return res.status(200).json({ success: true, count: added });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
