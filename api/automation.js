const { getDb } = require('../lib/db');

async function ensureAutomationTable(sql) {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS automations (
                id SERIAL PRIMARY KEY,
                company_id INT,
                name TEXT DEFAULT 'Auto-Reply Rule',
                trigger_type TEXT DEFAULT 'new_customer',
                trigger_value TEXT DEFAULT '',
                response_type TEXT DEFAULT 'template',
                template_name TEXT,
                template_language TEXT DEFAULT 'en_US',
                template_components JSONB DEFAULT '[]',
                response_text TEXT DEFAULT '',
                header_media_url TEXT DEFAULT NULL,
                cooldown_hours INT DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                trigger_count INT DEFAULT 0,
                last_triggered_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `;
        // Safe schema migrations for existing tables
        await sql`ALTER TABLE automations ADD COLUMN IF NOT EXISTS trigger_value TEXT DEFAULT '';`;
        await sql`ALTER TABLE automations ADD COLUMN IF NOT EXISTS response_type TEXT DEFAULT 'template';`;
        await sql`ALTER TABLE automations ADD COLUMN IF NOT EXISTS response_text TEXT DEFAULT '';`;
    } catch (e) {
        console.error('Error ensuring automations table exists:', e);
    }
}

async function verifyEnterpriseTier(sql, companyId) {
    let targetId = companyId;
    if (!targetId || targetId === 'default' || targetId === 'parent' || targetId === 'all') {
        targetId = 1;
    }

    try {
        const cos = await sql`
            SELECT id, name, slug, subscription_plan, subscription_status 
            FROM companies 
            WHERE id = ${targetId} 
            LIMIT 1
        `;
        if (cos.length === 0) {
            return { isEnterprise: false, error: 'Company not found' };
        }
        const c = cos[0];
        const isMaster = (c.slug || '').toLowerCase() === 'inspenox' || 
                         (c.name || '').toLowerCase() === 'inspenox';
        const plan = (c.subscription_plan || '').toLowerCase();
        const isActive = c.subscription_status === 'active';
        const isEnterprise = isMaster || (isActive && plan.includes('enterprise'));

        return {
            isEnterprise,
            isMaster,
            company: c,
            planName: c.subscription_plan || 'No Active Plan'
        };
    } catch (e) {
        console.error('Error verifying enterprise tier:', e);
        return { isEnterprise: false, error: e.message };
    }
}

module.exports = async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    const env = req.env || process.env || {};
    const sql = getDb(env);
    await ensureAutomationTable(sql);

    const queryCompanyId = req.query.company_id || (req.headers && req.headers['x-company-id']);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const companyId = queryCompanyId || body.company_id || 1;

    // Strict Enterprise Plan check
    const entCheck = await verifyEnterpriseTier(sql, companyId);
    if (!entCheck.isEnterprise) {
        return res.status(403).json({
            success: false,
            is_enterprise: false,
            current_plan: entCheck.planName,
            error: 'Enterprise Plan Required: Automated replies are exclusively available for Enterprise tier workspaces.'
        });
    }

    const targetCompanyId = entCheck.company ? entCheck.company.id : 1;

    // GET /api/automation
    if (req.method === 'GET') {
        try {
            const rules = await sql`
                SELECT * FROM automations 
                WHERE company_id = ${targetCompanyId} 
                ORDER BY id ASC
            `;

            // Recent automated reply logs from messages
            const recentLogs = await sql`
                SELECT m.id, m.customer_id, m.template_name, m.content, m.status, m.created_at, c.name as customer_name, c.phone as customer_phone
                FROM messages m
                LEFT JOIN customers c ON m.customer_id = c.id
                WHERE m.company_id = ${targetCompanyId} 
                  AND m.direction = 'outbound' 
                  AND m.content ILIKE '%[Auto-Reply%'
                ORDER BY m.id DESC 
                LIMIT 20
            `;

            return res.status(200).json({
                success: true,
                is_enterprise: true,
                automations: rules,
                recent_logs: recentLogs
            });
        } catch (e) {
            console.error('Error fetching automations:', e);
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // POST /api/automation (Create or Update Rule)
    if (req.method === 'POST') {
        const {
            id,
            name = 'New Auto-Reply Rule',
            trigger_type = 'new_customer', // 'new_customer', 'button_reply', 'keyword'
            trigger_value = '',            // Button label or keyword (e.g. 'India', 'Place an Order')
            response_type = 'template',    // 'template' or 'text'
            template_name = null,
            template_language = 'en_US',
            template_components = [],
            response_text = '',
            header_media_url = null,
            cooldown_hours = 0,
            is_active = true
        } = body;

        if (response_type === 'template' && !template_name) {
            return res.status(400).json({ success: false, error: 'template_name is required when response_type is template' });
        }
        if (response_type === 'text' && !response_text?.trim()) {
            return res.status(400).json({ success: false, error: 'response_text is required when response_type is text' });
        }
        if ((trigger_type === 'button_reply' || trigger_type === 'keyword') && !trigger_value?.trim()) {
            return res.status(400).json({ success: false, error: 'trigger_value (button text or keyword) is required' });
        }

        try {
            let saved;
            if (id) {
                // Update specific rule by ID
                saved = await sql`
                    UPDATE automations 
                    SET name = ${name},
                        trigger_type = ${trigger_type},
                        trigger_value = ${trigger_value.trim()},
                        response_type = ${response_type},
                        template_name = ${template_name},
                        template_language = ${template_language},
                        template_components = ${JSON.stringify(template_components)}::jsonb,
                        response_text = ${response_text},
                        header_media_url = ${header_media_url},
                        cooldown_hours = ${parseInt(cooldown_hours, 10) || 0},
                        is_active = ${Boolean(is_active)},
                        updated_at = NOW()
                    WHERE id = ${id} AND company_id = ${targetCompanyId}
                    RETURNING *
                `;
            } else {
                // Insert new automation rule
                saved = await sql`
                    INSERT INTO automations (
                        company_id, name, trigger_type, trigger_value, response_type,
                        template_name, template_language, template_components, response_text,
                        header_media_url, cooldown_hours, is_active, trigger_count
                    ) VALUES (
                        ${targetCompanyId}, ${name}, ${trigger_type}, ${trigger_value.trim()}, ${response_type},
                        ${template_name}, ${template_language}, ${JSON.stringify(template_components)}::jsonb, ${response_text},
                        ${header_media_url}, ${parseInt(cooldown_hours, 10) || 0}, ${Boolean(is_active)}, 0
                    )
                    RETURNING *
                `;
            }

            return res.status(200).json({
                success: true,
                is_enterprise: true,
                automation: saved[0],
                message: 'Automation rule saved successfully.'
            });
        } catch (e) {
            console.error('Error saving automation:', e);
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // PUT /api/automation (Quick toggle active status)
    if (req.method === 'PUT') {
        const { id, is_active } = body;
        try {
            const updated = await sql`
                UPDATE automations 
                SET is_active = ${Boolean(is_active)}, updated_at = NOW()
                WHERE id = ${id} AND company_id = ${targetCompanyId}
                RETURNING *
            `;
            return res.status(200).json({
                success: true,
                automation: updated[0]
            });
        } catch (e) {
            console.error('Error toggling automation:', e);
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    // DELETE /api/automation (Delete Rule)
    if (req.method === 'DELETE') {
        const ruleId = req.query.id || body.id;
        if (!ruleId) {
            return res.status(400).json({ success: false, error: 'Rule ID is required' });
        }
        try {
            await sql`
                DELETE FROM automations 
                WHERE id = ${ruleId} AND company_id = ${targetCompanyId}
            `;
            return res.status(200).json({ success: true, message: 'Automation rule deleted.' });
        } catch (e) {
            console.error('Error deleting automation:', e);
            return res.status(500).json({ success: false, error: e.message });
        }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
};
