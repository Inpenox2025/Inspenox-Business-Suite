const { getDb } = require('../lib/db');

function formatIndiaPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return '91' + digits;
    if (digits.length > 10) return '91' + digits.slice(-10);
    return digits;
}

async function ensureSupportTables(sql) {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id SERIAL PRIMARY KEY,
                ticket_number TEXT UNIQUE NOT NULL,
                company_id INT NOT NULL,
                company_name TEXT,
                user_name TEXT NOT NULL,
                user_email TEXT NOT NULL,
                user_phone TEXT,
                category TEXT NOT NULL,
                priority TEXT DEFAULT 'medium',
                subject TEXT NOT NULL,
                description TEXT NOT NULL,
                attachment_url TEXT,
                status TEXT DEFAULT 'OPEN',
                resolution_notes TEXT,
                resolved_by TEXT,
                resolved_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);`;
    } catch (e) {
        console.warn('ensureSupportTables warning:', e.message);
    }
}

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);
    await ensureSupportTables(sql);

    const query = req.query || {};
    const body = req.body || {};

    // Tenancy resolution
    const rawCompanyId = query.company_id || body.company_id || (req.headers && req.headers['x-company-id']) || null;
    let companyId = 1;
    let company = null;
    let isMaster = false;

    if (rawCompanyId && String(rawCompanyId).trim() !== '' && String(rawCompanyId).trim() !== 'default' && String(rawCompanyId).trim() !== 'parent') {
        const parsed = parseInt(rawCompanyId, 10);
        if (!isNaN(parsed)) companyId = parsed;
    }

    try {
        const cos = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
        if (cos.length > 0) {
            company = cos[0];
            isMaster = (company.slug && company.slug.toLowerCase() === 'inspenox') ||
                       (company.name && company.name.toLowerCase() === 'inspenox') ||
                       company.is_parent === true || company.is_master === true;
        } else {
            isMaster = (companyId === 1);
        }
    } catch (e) {
        console.warn('Company fetch error in support.js:', e.message);
    }

    // Role check from headers or body
    const userRole = (body.role || query.role || (req.headers && req.headers['x-user-role']) || '').toLowerCase();
    const isSuperadminUser = isMaster || userRole === 'superadmin';

    const action = query.action || body.action || 'list';

    // =========================================================================
    // 1. GET LIST: List Tickets
    // Superadmin: Can view tickets across all companies (or filter by company_id)
    // Regular Company: Strictly restricted to tickets belonging to their company_id
    // =========================================================================
    if (req.method === 'GET' && action === 'list') {
        try {
            const statusFilter = (query.status || 'ALL').toUpperCase();
            const targetCompany = query.filter_company_id ? parseInt(query.filter_company_id, 10) : null;

            let tickets = [];

            if (isSuperadminUser && !query.my_company_only) {
                // Superadmin: List all tickets across platform
                if (targetCompany && !isNaN(targetCompany) && statusFilter !== 'ALL') {
                    tickets = await sql`
                        SELECT t.*, c.name as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        WHERE t.company_id = ${targetCompany} AND t.status = ${statusFilter}
                        ORDER BY t.created_at DESC
                    `;
                } else if (targetCompany && !isNaN(targetCompany)) {
                    tickets = await sql`
                        SELECT t.*, c.name as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        WHERE t.company_id = ${targetCompany}
                        ORDER BY t.created_at DESC
                    `;
                } else if (statusFilter !== 'ALL') {
                    tickets = await sql`
                        SELECT t.*, c.name as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        WHERE t.status = ${statusFilter}
                        ORDER BY t.created_at DESC
                    `;
                } else {
                    tickets = await sql`
                        SELECT t.*, c.name as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        ORDER BY t.created_at DESC
                    `;
                }
            } else {
                // Regular Company: View ONLY their company's tickets
                if (statusFilter !== 'ALL') {
                    tickets = await sql`
                        SELECT * FROM support_tickets 
                        WHERE company_id = ${companyId} AND status = ${statusFilter}
                        ORDER BY created_at DESC
                    `;
                } else {
                    tickets = await sql`
                        SELECT * FROM support_tickets 
                        WHERE company_id = ${companyId}
                        ORDER BY created_at DESC
                    `;
                }
            }

            // Calculate metric summary counts
            let metrics = { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
            try {
                let countRows = [];
                if (isSuperadminUser && !query.my_company_only) {
                    countRows = await sql`
                        SELECT status, COUNT(*)::int as count 
                        FROM support_tickets 
                        GROUP BY status
                    `;
                } else {
                    countRows = await sql`
                        SELECT status, COUNT(*)::int as count 
                        FROM support_tickets 
                        WHERE company_id = ${companyId} 
                        GROUP BY status
                    `;
                }
                countRows.forEach(row => {
                    const st = (row.status || '').toUpperCase();
                    const cnt = parseInt(row.count, 10) || 0;
                    metrics.total += cnt;
                    if (st === 'OPEN') metrics.open = cnt;
                    else if (st === 'IN_PROGRESS') metrics.in_progress = cnt;
                    else if (st === 'RESOLVED') metrics.resolved = cnt;
                    else if (st === 'CLOSED') metrics.closed = cnt;
                });
            } catch (ce) {
                console.warn('Metrics count error:', ce.message);
            }

            return res.status(200).json({
                success: true,
                tickets: tickets,
                metrics: metrics,
                is_superadmin: isSuperadminUser
            });
        } catch (err) {
            console.error('Error listing support tickets:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 2. POST CREATE: Raise a New Support Ticket
    // Accessible by all companies
    // =========================================================================
    if (req.method === 'POST' && (action === 'create' || !body.action)) {
        try {
            const {
                user_name,
                user_email,
                user_phone,
                category,
                priority = 'medium',
                subject,
                description,
                attachment_url
            } = body;

            if (!user_name || !user_name.trim()) {
                return res.status(400).json({ error: 'Contact name is required.' });
            }
            if (!user_email || !user_email.trim()) {
                return res.status(400).json({ error: 'Contact email is required.' });
            }
            if (!subject || !subject.trim()) {
                return res.status(400).json({ error: 'Ticket subject is required.' });
            }
            if (!description || !description.trim()) {
                return res.status(400).json({ error: 'Problem description is required.' });
            }

            // Generate unique human-readable ticket number (e.g. TICK-58492)
            const randomCode = Math.floor(10000 + Math.random() * 90000);
            const ticketNumber = `TICK-${randomCode}`;
            const compName = company ? company.name : 'Unknown Company';
            const cleanPhone = user_phone ? formatIndiaPhone(user_phone) : (company ? company.phone : '');

            const inserted = await sql`
                INSERT INTO support_tickets (
                    ticket_number,
                    company_id,
                    company_name,
                    user_name,
                    user_email,
                    user_phone,
                    category,
                    priority,
                    subject,
                    description,
                    attachment_url,
                    status,
                    created_at,
                    updated_at
                ) VALUES (
                    ${ticketNumber},
                    ${companyId},
                    ${compName},
                    ${user_name.trim()},
                    ${user_email.trim().toLowerCase()},
                    ${cleanPhone},
                    ${category || 'General Inquiry'},
                    ${priority.toLowerCase()},
                    ${subject.trim()},
                    ${description.trim()},
                    ${attachment_url || null},
                    'OPEN',
                    NOW(),
                    NOW()
                )
                RETURNING *
            `;

            return res.status(200).json({
                success: true,
                message: 'Support ticket raised successfully.',
                ticket: inserted[0]
            });
        } catch (err) {
            console.error('Error creating support ticket:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 3. POST UPDATE_STATUS: Update Ticket Status & Resolution Notes
    // Restricted to Superadmin only
    // =========================================================================
    if (req.method === 'POST' && action === 'update_status') {
        try {
            if (!isSuperadminUser) {
                return res.status(403).json({ error: 'Permission denied. Only Superadmin can update ticket status.' });
            }

            const { id, status, resolution_notes, resolved_by } = body;
            if (!id) {
                return res.status(400).json({ error: 'Ticket ID is required.' });
            }

            const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
            const newStatus = (status || 'OPEN').toUpperCase();
            if (!validStatuses.includes(newStatus)) {
                return res.status(400).json({ error: 'Invalid status. Must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED.' });
            }

            const isResolvedNow = (newStatus === 'RESOLVED' || newStatus === 'CLOSED');

            const updated = await sql`
                UPDATE support_tickets
                SET 
                    status = ${newStatus},
                    resolution_notes = ${resolution_notes !== undefined ? resolution_notes : sql`resolution_notes`},
                    resolved_by = ${resolved_by || (isResolvedNow ? 'Superadmin' : sql`resolved_by`)},
                    resolved_at = ${isResolvedNow ? sql`NOW()` : sql`resolved_at`},
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *
            `;

            if (updated.length === 0) {
                return res.status(404).json({ error: 'Ticket not found.' });
            }

            return res.status(200).json({
                success: true,
                message: `Ticket #${updated[0].ticket_number} updated to ${newStatus}.`,
                ticket: updated[0]
            });
        } catch (err) {
            console.error('Error updating ticket status:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // Default 405 Method Not Allowed
    return res.status(405).json({ error: `Method ${req.method} not allowed on /api/support` });
};
