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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const env = req.env || process.env || {};
        const { customers, company_id } = req.body; // Array of {name, phone, email, company_name, city, tags}
        if (!customers || !Array.isArray(customers)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        const sql = getDb(env);
        const targetCompanyId = company_id || 1;
        let added = 0;

        for (const cust of customers) {
            if (!cust.phone) continue;
            const cleanPhone = formatIndiaPhone(cust.phone);
            const name = cust.name;
            const email = cust.email || null;
            const companyName = cust.company_name || cust.company || null;
            const city = cust.city || null;
            const tags = cust.tags || null;
            
            await sql`
                INSERT INTO customers (name, phone, email, company_name, city, tags, company_id, is_saved) 
                VALUES (${name}, ${cleanPhone}, ${email}, ${companyName}, ${city}, ${tags}, ${targetCompanyId}, true) 
                ON CONFLICT (phone) DO UPDATE SET 
                    name = EXCLUDED.name,
                    email = COALESCE(EXCLUDED.email, customers.email),
                    company_name = COALESCE(EXCLUDED.company_name, customers.company_name),
                    city = COALESCE(EXCLUDED.city, customers.city),
                    tags = COALESCE(EXCLUDED.tags, customers.tags),
                    company_id = EXCLUDED.company_id,
                    is_saved = true
            `;
            added++;
        }

        return res.status(200).json({ success: true, count: added });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
