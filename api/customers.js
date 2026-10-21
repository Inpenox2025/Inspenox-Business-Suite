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

    try {
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Open - Not Contacted';`;
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';`;
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT true;`;
    } catch (e) {}

    const rawCompanyId = req.query.company_id || (req.body && req.body.company_id) || (req.headers && req.headers['x-company-id']) || null;
    let companyId = null;
    if (rawCompanyId && String(rawCompanyId).trim() !== '' && String(rawCompanyId).trim() !== 'default' && String(rawCompanyId).trim() !== 'parent') {
        const parsed = parseInt(rawCompanyId, 10);
        if (!isNaN(parsed)) {
            companyId = parsed;
        }
    }

    if (req.method === 'GET') {
        try {
            let customers;
            if (companyId) {
                customers = await sql`
                    SELECT c.*, 
                           COALESCE(c.status, 'Open - Not Contacted') as status,
                           COALESCE(c.description, '') as description,
                           COALESCE(c.is_saved, true) as is_saved,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id) as message_count,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound' AND m.status = 'delivered') as unread_count,
                           (SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as last_inbound_at,
                           (SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id) as last_message_at,
                           (SELECT content FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_content,
                           (SELECT direction FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_direction,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as inbound_count,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'outbound') as outbound_count,
                           (SELECT m.direction FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at ASC LIMIT 1) as first_message_direction
                    FROM customers c 
                    WHERE c.company_id = ${companyId}
                    ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id), c.created_at) DESC
                `;
            } else {
                customers = await sql`
                    SELECT c.*, 
                           COALESCE(c.status, 'Open - Not Contacted') as status,
                           COALESCE(c.description, '') as description,
                           COALESCE(c.is_saved, true) as is_saved,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id) as message_count,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound' AND m.status = 'delivered') as unread_count,
                           (SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as last_inbound_at,
                           (SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id) as last_message_at,
                           (SELECT content FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_content,
                           (SELECT direction FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_direction,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'inbound') as inbound_count,
                           (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.direction = 'outbound') as outbound_count,
                           (SELECT m.direction FROM messages m WHERE m.customer_id = c.id ORDER BY m.created_at ASC LIMIT 1) as first_message_direction
                    FROM customers c 
                    WHERE c.company_id IS NULL OR c.company_id = (SELECT id FROM companies WHERE slug = 'inspenox' OR LOWER(name) = 'inspenox' LIMIT 1)
                    ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.customer_id = c.id), c.created_at) DESC
                `;
            }
            return res.status(200).json(customers);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } 

    if (req.method === 'PATCH') {
        try {
            const { id, status, description, name, phone, tags } = req.body || {};
            if (!id) return res.status(400).json({ error: 'Customer ID required' });
            const targetId = parseInt(id, 10);
            const cleanPhone = phone ? formatIndiaPhone(phone) : null;

            const updated = isNaN(targetId)
                ? await sql`
                    UPDATE customers 
                    SET status = COALESCE(${status !== undefined ? status : null}, status),
                        description = COALESCE(${description !== undefined ? description : null}, description),
                        tags = COALESCE(${tags !== undefined ? tags : null}, tags),
                        name = COALESCE(${name !== undefined ? name : null}, name),
                        phone = COALESCE(${cleanPhone !== null ? cleanPhone : null}, phone)
                    WHERE id = ${id}
                    RETURNING *
                `
                : await sql`
                    UPDATE customers 
                    SET status = COALESCE(${status !== undefined ? status : null}, status),
                        description = COALESCE(${description !== undefined ? description : null}, description),
                        tags = COALESCE(${tags !== undefined ? tags : null}, tags),
                        name = COALESCE(${name !== undefined ? name : null}, name),
                        phone = COALESCE(${cleanPhone !== null ? cleanPhone : null}, phone)
                    WHERE id = ${targetId}
                    RETURNING *
                `;

            if (!updated || updated.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }

            return res.status(200).json({ success: true, customer: updated[0] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } 
    
    if (req.method === 'POST' || req.method === 'PUT') {
        try {
            const { 
                id, name, phone, email, company_name, address, city, state, pincode, country, tags, status, description, notes, custom_fields, company_id 
            } = req.body || {};

            if (id && (!name || !phone) && (tags !== undefined || status !== undefined || description !== undefined)) {
                const targetId = parseInt(id, 10);
                const updated = isNaN(targetId)
                    ? await sql`
                        UPDATE customers 
                        SET tags = COALESCE(${tags !== undefined ? tags : null}, tags),
                            status = COALESCE(${status !== undefined ? status : null}, status),
                            description = COALESCE(${description !== undefined ? description : null}, description)
                        WHERE id = ${id}
                        RETURNING *
                    `
                    : await sql`
                        UPDATE customers 
                        SET tags = COALESCE(${tags !== undefined ? tags : null}, tags),
                            status = COALESCE(${status !== undefined ? status : null}, status),
                            description = COALESCE(${description !== undefined ? description : null}, description)
                        WHERE id = ${targetId}
                        RETURNING *
                    `;
                if (updated.length > 0) {
                    return res.status(200).json({ success: true, customer: updated[0] });
                }
                return res.status(404).json({ error: 'Customer not found' });
            }

            if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
            
            const cleanPhone = formatIndiaPhone(phone);
            const custStatus = status || 'Open - Not Contacted';
            const custDesc = description !== undefined ? description : (notes || '');
            let targetCompanyId = null;
            const rawTarget = company_id || companyId;
            if (rawTarget && String(rawTarget).trim() !== '' && String(rawTarget).trim() !== 'default' && String(rawTarget).trim() !== 'parent') {
                const p = parseInt(rawTarget, 10);
                if (!isNaN(p)) targetCompanyId = p;
            }
            if (!targetCompanyId) {
                try {
                    const parentRow = await sql`SELECT id FROM companies WHERE slug = 'inspenox' OR LOWER(name) = 'inspenox' OR is_parent = true LIMIT 1`;
                    if (parentRow.length > 0) {
                        targetCompanyId = parentRow[0].id;
                    }
                } catch(e) {}
            }
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
                        status = COALESCE(${status !== undefined ? status : null}, status),
                        description = COALESCE(${description !== undefined ? description : null}, description),
                        notes = ${notes || null},
                        custom_fields = ${customJson}::jsonb,
                        company_id = ${targetCompanyId},
                        is_saved = true
                    WHERE id = ${id}
                    RETURNING *
                `;
                return res.status(200).json({ success: true, customer: updated[0] });
            } else {
                const tenDigits = cleanPhone.slice(-10);
                // Check if customer with cleanPhone or 10-digit phone already exists
                const existing = await sql`
                    SELECT id FROM customers 
                    WHERE phone = ${cleanPhone} OR phone = ${tenDigits} 
                    ORDER BY is_saved DESC, id ASC 
                    LIMIT 1
                `;

                if (existing.length > 0) {
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
                            status = COALESCE(${status !== undefined ? status : null}, status),
                            description = COALESCE(${description !== undefined ? description : null}, description),
                            notes = ${notes || null},
                            custom_fields = ${customJson}::jsonb,
                            company_id = ${targetCompanyId},
                            is_saved = true
                        WHERE id = ${existing[0].id}
                        RETURNING *
                    `;
                    return res.status(200).json({ success: true, customer: updated[0] });
                } else {
                    const result = await sql`
                        INSERT INTO customers (
                            name, phone, email, company_name, address, city, state, pincode, country, tags, status, description, notes, custom_fields, company_id, is_saved
                        ) VALUES (
                            ${name}, ${cleanPhone}, ${email || null}, ${company_name || null}, ${address || null}, ${city || null}, ${state || null}, ${pincode || null}, ${country || 'India'}, ${tags || null}, ${custStatus}, ${custDesc}, ${notes || null}, ${customJson}::jsonb, ${targetCompanyId}, true
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
                            status = COALESCE(customers.status, EXCLUDED.status),
                            description = CASE 
                                WHEN EXCLUDED.description IS NOT NULL AND EXCLUDED.description != '' THEN EXCLUDED.description 
                                ELSE customers.description 
                            END,
                            notes = COALESCE(EXCLUDED.notes, customers.notes),
                            custom_fields = COALESCE(EXCLUDED.custom_fields, customers.custom_fields),
                            company_id = EXCLUDED.company_id,
                            is_saved = true
                        RETURNING *
                    `;
                    return res.status(200).json({ success: true, customer: result[0] });
                }
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
