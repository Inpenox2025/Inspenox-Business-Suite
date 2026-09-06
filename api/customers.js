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
    const env = req.env || process.env || {};
    const sql = getDb(env);
    const companyId = req.query.company_id || (req.body && req.body.company_id) || null;

    if (req.method === 'GET') {
        try {
            let customers;
            if (companyId) {
                customers = await sql`
                    SELECT c.*, 
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id) as message_count,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound' AND m.status = 'delivered') as unread_count,
                           (SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as last_inbound_at,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as inbound_count,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'outbound') as outbound_count,
                           (SELECT m.direction FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at ASC LIMIT 1) as first_message_direction
                    FROM customers c 
                    WHERE c.company_id = ${companyId} OR c.company_id IS NULL
                    ORDER BY c.created_at DESC
                `;
            } else {
                customers = await sql`
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
            }
            return res.status(200).json(customers);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } 
    
    if (req.method === 'POST' || req.method === 'PUT') {
        try {
            const { 
                id, name, phone, email, company_name, address, city, state, pincode, country, tags, notes, custom_fields, company_id 
            } = req.body || {};

            if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
            
            const cleanPhone = formatIndiaPhone(phone);
            const targetCompanyId = company_id || companyId || 1;
            const customJson = typeof custom_fields === 'object' ? JSON.stringify(custom_fields) : (custom_fields || '{}');

            if (id) {
                // Update existing customer by ID
                const updated = await sql`
                    UPDATE customers 
                    SET name = ${name},
                        phone = ${cleanPhone},
                        email = ${email || null},
                        company_name = ${company_name || null},
                        address = ${address || null},
                        city = ${city || null},
                        state = ${state || null},
                        pincode = ${pincode || null},
                        country = ${country || 'India'},
                        tags = ${tags || null},
                        notes = ${notes || null},
                        custom_fields = ${customJson}::jsonb,
                        company_id = ${targetCompanyId},
                        is_saved = true
                    WHERE id = ${id}
                    RETURNING *
                `;
                return res.status(200).json({ success: true, customer: updated[0] });
            } else {
                // Upsert customer by phone
                const result = await sql`
                    INSERT INTO customers (
                        name, phone, email, company_name, address, city, state, pincode, country, tags, notes, custom_fields, company_id, is_saved
                    ) VALUES (
                        ${name}, ${cleanPhone}, ${email || null}, ${company_name || null}, ${address || null}, ${city || null}, ${state || null}, ${pincode || null}, ${country || 'India'}, ${tags || null}, ${notes || null}, ${customJson}::jsonb, ${targetCompanyId}, true
                    ) 
                    ON CONFLICT (phone) DO UPDATE SET 
                        name = EXCLUDED.name,
                        email = COALESCE(EXCLUDED.email, customers.email),
                        company_name = COALESCE(EXCLUDED.company_name, customers.company_name),
                        address = COALESCE(EXCLUDED.address, customers.address),
                        city = COALESCE(EXCLUDED.city, customers.city),
                        state = COALESCE(EXCLUDED.state, customers.state),
                        pincode = COALESCE(EXCLUDED.pincode, customers.pincode),
                        tags = COALESCE(EXCLUDED.tags, customers.tags),
                        notes = COALESCE(EXCLUDED.notes, customers.notes),
                        custom_fields = COALESCE(EXCLUDED.custom_fields, customers.custom_fields),
                        company_id = EXCLUDED.company_id,
                        is_saved = true
                    RETURNING *
                `;
                return res.status(200).json({ success: true, customer: result[0] });
            }
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Customer ID required' });
            
            await sql`DELETE FROM messages WHERE customer_id = ${id}`;
            await sql`DELETE FROM customers WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
