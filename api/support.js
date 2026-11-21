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
                user_feedback TEXT,
                feedback_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(LOWER(user_email));`;

        // Ensure user_feedback and feedback_at columns exist if table was previously created
        await sql`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS user_feedback TEXT;`;
        await sql`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;`;

        // Migration Fix: Ensure tickets raised by Manaswini or sairajeev36 are correctly assigned to Manaswini Enterprises (company_id = 2)
        await sql`
            UPDATE support_tickets 
            SET company_id = 2, company_name = 'Manaswini Enterprises'
            WHERE (LOWER(user_email) = 'sairajeev36@gmail.com' OR LOWER(user_name) LIKE '%manaswini%')
              AND (company_id = 1 OR company_name = 'Inspenox' OR company_name IS NULL OR company_name = 'Unknown Company');
        `;
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

    // Secondary email-based company lookup to ensure child company users (e.g. Manaswini) are strictly isolated
    const checkEmail = (body.user_email || query.user_email || '').trim().toLowerCase();
    if (checkEmail) {
        try {
            const uRows = await sql`
                SELECT u.company_id, c.name as company_name 
                FROM users u
                LEFT JOIN companies c ON u.company_id = c.id
                WHERE LOWER(u.email) = ${checkEmail} OR LOWER(u.username) = ${checkEmail}
                LIMIT 1
            `;
            if (uRows.length > 0 && uRows[0].company_id) {
                companyId = uRows[0].company_id;
            }
        } catch (e) {
            console.warn('User email company lookup error:', e.message);
        }
    }

    // Fallback: If body.company_name matches a registered company and companyId is still 1
    if (body.company_name && companyId === 1 && String(body.company_name).toLowerCase() !== 'inspenox') {
        try {
            const cRows = await sql`
                SELECT id, name FROM companies 
                WHERE LOWER(name) = ${String(body.company_name).trim().toLowerCase()}
                LIMIT 1
            `;
            if (cRows.length > 0) {
                companyId = cRows[0].id;
            }
        } catch (e) {
            console.warn('Company name lookup error:', e.message);
        }
    }

    try {
        const cos = await sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`;
        if (cos.length > 0) {
            company = cos[0];
            isMaster = (company.slug && company.slug.toLowerCase() === 'inspenox') ||
                       (company.name && company.name.toLowerCase() === 'inspenox') ||
                       companyId === 5;
        } else {
            isMaster = (companyId === 5);
        }
    } catch (e) {
        console.warn('Company fetch error in support.js:', e.message);
        isMaster = (companyId === 5);
    }

    // Role check from headers, body, query, or master organization
    const userRole = (body.role || query.role || (req.headers && req.headers['x-user-role']) || '').toLowerCase();
    const isSuperadminUser = isMaster || userRole === 'superadmin' || query.role === 'superadmin';

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

            // If superadmin viewing global desk (not explicitly restricted to my_company_only)
            const isGlobalDesk = (isSuperadminUser || query.role === 'superadmin') && !query.my_company_only;

            if (isGlobalDesk) {
                // Superadmin Global View: List all tickets across platform
                if (targetCompany && !isNaN(targetCompany) && statusFilter !== 'ALL') {
                    tickets = await sql`
                        SELECT t.*, COALESCE(c.name, t.company_name, 'Company #' || t.company_id) as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        WHERE t.company_id = ${targetCompany} AND t.status = ${statusFilter}
                        ORDER BY t.created_at DESC
                    `;
                } else if (targetCompany && !isNaN(targetCompany)) {
                    tickets = await sql`
                        SELECT t.*, COALESCE(c.name, t.company_name, 'Company #' || t.company_id) as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        WHERE t.company_id = ${targetCompany}
                        ORDER BY t.created_at DESC
                    `;
                } else if (statusFilter !== 'ALL') {
                    tickets = await sql`
                        SELECT t.*, COALESCE(c.name, t.company_name, 'Company #' || t.company_id) as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        WHERE t.status = ${statusFilter}
                        ORDER BY t.created_at DESC
                    `;
                } else {
                    tickets = await sql`
                        SELECT t.*, COALESCE(c.name, t.company_name, 'Company #' || t.company_id) as current_company_name 
                        FROM support_tickets t
                        LEFT JOIN companies c ON t.company_id = c.id
                        ORDER BY t.created_at DESC
                    `;
                }
            } else {
                // Regular Company View (or Superadmin viewing their own internal company tickets):
                // Strictly filtered by companyId
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
                if (isGlobalDesk) {
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
                is_superadmin: isSuperadminUser,
                company_id: companyId
            });
        } catch (err) {
            console.error('Error listing support tickets:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 2. POST CREATE: Raise a New Support Ticket
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
                attachment_url,
                company_name,
                close_previous = false
            } = body;

            if (!user_name || !user_name.trim()) {
                return res.status(400).json({ error: 'Contact name is required.' });
            }
            if (!user_email || !user_email.trim() || !user_email.includes('@')) {
                return res.status(400).json({ error: 'Valid contact email is required.' });
            }
            if (!subject || !subject.trim()) {
                return res.status(400).json({ error: 'Ticket subject is required.' });
            }
            if (!description || !description.trim()) {
                return res.status(400).json({ error: 'Problem description is required.' });
            }

            const cleanEmail = user_email.trim().toLowerCase();

            // Check if there is an active ticket (OPEN or IN_PROGRESS)
            const activeTickets = await sql`
                SELECT id, ticket_number, status, subject, created_at 
                FROM support_tickets 
                WHERE (company_id = ${companyId} OR LOWER(user_email) = ${cleanEmail})
                  AND status IN ('OPEN', 'IN_PROGRESS')
                ORDER BY created_at DESC
                LIMIT 1
            `;

            if (activeTickets.length > 0) {
                const act = activeTickets[0];

                // If user requested to close previous ticket to proceed with new one
                if (close_previous === true || close_previous === 'true') {
                    await sql`
                        UPDATE support_tickets 
                        SET status = 'CLOSED',
                            resolution_notes = COALESCE(resolution_notes, 'Closed by user to submit a new support ticket.'),
                            resolved_at = NOW(),
                            updated_at = NOW()
                        WHERE id = ${act.id}
                    `;
                } else {
                    return res.status(400).json({
                        error: `You already have an active ticket in progress (#${act.ticket_number}: "${act.subject}"). Please close your existing ticket or click 'Close Previous & Submit' to proceed.`,
                        active_ticket: act,
                        can_close_previous: true
                    });
                }
            }

            // Anti-Spam / Abuse Protection (Cap at 10 tickets per 24 hours per company/email)
            const recentCount = await sql`
                SELECT COUNT(*)::int as count 
                FROM support_tickets 
                WHERE (company_id = ${companyId} OR LOWER(user_email) = ${cleanEmail})
                  AND created_at >= NOW() - INTERVAL '24 HOURS'
            `;

            if (recentCount.length > 0 && recentCount[0].count >= 10) {
                return res.status(429).json({
                    error: `Daily ticket submission limit reached (maximum 10 tickets per 24 hours). Please contact support directly if urgent.`,
                    rate_limited: true
                });
            }

            // Generate unique human-readable ticket number (e.g. TICK-58492)
            const randomCode = Math.floor(10000 + Math.random() * 90000);
            const ticketNumber = `TICK-${randomCode}`;
            const compName = company_name || (company ? company.name : (companyId === 1 ? 'Inspenox' : `Company #${companyId}`));
            const cleanPhone = user_phone ? formatIndiaPhone(user_phone) : (company ? company.phone : '');

            const validPriorities = ['low', 'medium', 'high', 'urgent'];
            const normalizedPriority = validPriorities.includes(String(priority).toLowerCase()) ? String(priority).toLowerCase() : 'medium';

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
                    ${cleanEmail},
                    ${cleanPhone},
                    ${category || 'General Inquiry'},
                    ${normalizedPriority},
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
                message: 'Support ticket raised successfully. Superadmin notified.',
                ticket: inserted[0]
            });
        } catch (err) {
            console.error('Error creating support ticket:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 3. POST UPDATE_STATUS: Superadmin Manage Ticket
    // Superadmin can:
    //  - Change Status (OPEN, IN_PROGRESS, RESOLVED, CLOSED)
    //  - Change Issue Priority (low, medium, high, urgent)
    //  - Change Problem Category
    //  - Add/Update Superadmin Resolution / Official Response Message
    // =========================================================================
    if (req.method === 'POST' && action === 'update_status') {
        try {
            if (!isSuperadminUser && userRole !== 'superadmin' && query.role !== 'superadmin') {
                return res.status(403).json({ error: 'Permission denied. Only Superadmin can manage ticket status, priority, and category.' });
            }

            const { id, status, category, priority, resolution_notes, resolved_by } = body;
            if (!id) {
                return res.status(400).json({ error: 'Ticket ID is required.' });
            }

            const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
            const newStatus = status ? status.toUpperCase() : 'OPEN';
            if (!validStatuses.includes(newStatus)) {
                return res.status(400).json({ error: 'Invalid status. Must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED.' });
            }

            const validPriorities = ['low', 'medium', 'high', 'urgent'];
            const newPriority = priority ? priority.toLowerCase() : null;

            const isResolvedNow = (newStatus === 'RESOLVED' || newStatus === 'CLOSED');

            const updated = await sql`
                UPDATE support_tickets
                SET 
                    status = ${newStatus},
                    category = COALESCE(${category || null}, category),
                    priority = COALESCE(${newPriority && validPriorities.includes(newPriority) ? newPriority : null}, priority),
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
                message: `Ticket #${updated[0].ticket_number} updated successfully.`,
                ticket: updated[0]
            });
        } catch (err) {
            console.error('Error updating ticket status:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 4. POST FEEDBACK: User submits feedback if ticket is not resolved
    // Updates status to IN_PROGRESS so Superadmin can follow up
    // =========================================================================
    if (req.method === 'POST' && action === 'feedback') {
        try {
            const { id, feedback } = body;
            if (!id) {
                return res.status(400).json({ error: 'Ticket ID is required.' });
            }
            if (!feedback || !feedback.trim()) {
                return res.status(400).json({ error: 'Feedback message cannot be empty.' });
            }

            const updated = await sql`
                UPDATE support_tickets
                SET 
                    user_feedback = ${feedback.trim()},
                    feedback_at = NOW(),
                    status = 'IN_PROGRESS',
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *
            `;

            if (updated.length === 0) {
                return res.status(404).json({ error: 'Ticket not found.' });
            }

            return res.status(200).json({
                success: true,
                message: 'Your feedback has been submitted. Superadmin has been notified to follow up.',
                ticket: updated[0]
            });
        } catch (err) {
            console.error('Error submitting feedback:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 5. POST CLOSE_TICKET: User or Superadmin marks ticket as CLOSED
    // Clears active ticket constraint so new ticket can be raised
    // =========================================================================
    if (req.method === 'POST' && action === 'close_ticket') {
        try {
            const { id } = body;
            if (!id) {
                return res.status(400).json({ error: 'Ticket ID is required.' });
            }

            const updated = await sql`
                UPDATE support_tickets
                SET 
                    status = 'CLOSED',
                    resolved_at = COALESCE(resolved_at, NOW()),
                    updated_at = NOW()
                WHERE id = ${id}
                RETURNING *
            `;

            if (updated.length === 0) {
                return res.status(404).json({ error: 'Ticket not found.' });
            }

            return res.status(200).json({
                success: true,
                message: `Ticket #${updated[0].ticket_number} marked as closed.`,
                ticket: updated[0]
            });
        } catch (err) {
            console.error('Error closing ticket:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // Default 405 Method Not Allowed
    return res.status(405).json({ error: `Method ${req.method} not allowed on /api/support` });
};
