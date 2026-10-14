const { getDb } = require('../lib/db');
const crypto = require('node:crypto');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password + '_inspenox_salt_2026').digest('hex');
}

function legacyHashPassword(password) {
    return crypto.createHash('sha256').update(password + '_induio_salt_2026').digest('hex');
}

async function ensureUsersTable(sql) {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                company_id INT REFERENCES companies(id) ON DELETE SET NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `;

        // Check if company_id, email, phone columns exist
        await sql`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
        `;
        await sql`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
        `;
        await sql`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
        `;

        // Create persistent login_attempts table for rate limiting across serverless instances
        await sql`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                ip_address TEXT NOT NULL,
                username TEXT NOT NULL,
                attempt_time TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
                success BOOLEAN DEFAULT FALSE
            );
        `;

        // Migrate existing UTC timestamps in login_attempts to IST (+5.5 hours) if inserted as UTC
        await sql`
            UPDATE login_attempts 
            SET attempt_time = attempt_time + INTERVAL '5 hours 30 minutes'
            WHERE attempt_time < '2026-10-09 12:00:00';
        `;

        // Automated retention cleanup: purge logs older than 90 days for scalability
        await sql`
            DELETE FROM login_attempts 
            WHERE attempt_time < (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '90 days';
        `;

        // Seed default admin user ONLY if users table is completely empty
        const countRes = await sql`SELECT COUNT(*)::int as count FROM users;`;
        if ((countRes[0]?.count || 0) === 0) {
            const defaultHash = hashPassword('admin123');
            await sql`
                INSERT INTO users (username, password_hash, role)
                VALUES ('admin', ${defaultHash}, 'admin')
                ON CONFLICT (username) DO NOTHING;
            `;
            console.log('Default admin user initialized (admin / admin123)');
        }

    } catch (e) {
        console.error('Error ensuring users table:', e);
    }
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

module.exports = async (req, res) => {
    // Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    const env = req.env || process.env || {};
    const sql = getDb(env);
    await ensureUsersTable(sql);

    const action = req.query.action || 'login';
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (req.method === 'GET') {
        try {
            if (action === 'security-logs') {
                const attempts = await sql`
                    SELECT id, ip_address, username, 
                           TO_CHAR(attempt_time, 'YYYY-MM-DD HH24:MI:SS') as attempt_time, 
                           success 
                    FROM login_attempts 
                    ORDER BY id DESC 
                    LIMIT 100;
                `;
                const stats = await sql`
                    SELECT 
                        COUNT(*)::int as total_attempts,
                        COUNT(CASE WHEN success = FALSE AND attempt_time > (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '15 minutes' THEN 1 END)::int as active_failed_15m,
                        COUNT(CASE WHEN success = TRUE THEN 1 END)::int as total_successful,
                        COUNT(DISTINCT CASE WHEN success = FALSE AND attempt_time > (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '15 minutes' THEN ip_address END)::int as locked_ips
                    FROM login_attempts;
                `;
                return res.status(200).json({
                    success: true,
                    attempts,
                    stats: stats[0] || { total_attempts: 0, active_failed_15m: 0, total_successful: 0, locked_ips: 0 }
                });
            }

            const companyFilter = req.query.company_id;
            let users;
            if (req.query.all !== 'true' && companyFilter && companyFilter !== 'default' && companyFilter !== 'null' && companyFilter !== 'all') {
                users = await sql`
                    SELECT u.id, u.username, u.email, u.phone, u.role, u.company_id, u.created_at, c.name as company_name 
                    FROM users u 
                    LEFT JOIN companies c ON u.company_id = c.id 
                    WHERE u.company_id = ${parseInt(companyFilter)}
                    ORDER BY u.id ASC
                `;
            } else {
                users = await sql`
                    SELECT u.id, u.username, u.email, u.phone, u.role, u.company_id, u.created_at, c.name as company_name 
                    FROM users u 
                    LEFT JOIN companies c ON u.company_id = c.id 
                    ORDER BY u.id ASC
                `;
            }
            return res.status(200).json(users);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'User ID is required' });
            await sql`DELETE FROM users WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'POST') {
        if (action === 'login') {
            try {
                const { username, password } = body;
                const cleanUser = String(username || '').trim().toLowerCase();

                if (!cleanUser || !password) {
                    return res.status(400).json({ error: 'Username or Email and password are required' });
                }

                if (cleanUser.length > 100 || String(password).length > 128) {
                    return res.status(400).json({ error: 'Input length exceeds security limit' });
                }

                const clientIp = getClientIp(req);

                // Rate Limiting Check: Max 5 failed attempts per 15 minutes per IP or per Username/Email
                const failCheck = await sql`
                    SELECT COUNT(*)::int as failures 
                    FROM login_attempts 
                    WHERE (ip_address = ${clientIp} OR username = ${cleanUser})
                      AND success = FALSE 
                      AND attempt_time > (NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '15 minutes';
                `;

                const failureCount = failCheck[0]?.failures || 0;
                if (failureCount >= 5) {
                    return res.status(429).json({ 
                        error: '⚠️ Too many failed login attempts. Access temporarily locked for 15 minutes for security.' 
                    });
                }

                const hash = hashPassword(password);
                const legacyHash = legacyHashPassword(password);

                // Support matching either username or email address
                const users = await sql`
                    SELECT id, username, email, phone, role, password_hash, company_id 
                    FROM users 
                    WHERE LOWER(username) = ${cleanUser} OR LOWER(COALESCE(email, '')) = ${cleanUser}
                    LIMIT 1
                `;

                const isAuthSuccess = users.length > 0 && (users[0].password_hash === hash || users[0].password_hash === legacyHash);

                // Record attempt in database using IST timestamp
                await sql`
                    INSERT INTO login_attempts (ip_address, username, attempt_time, success)
                    VALUES (${clientIp}, ${cleanUser}, NOW() AT TIME ZONE 'Asia/Kolkata', ${isAuthSuccess});
                `;

                if (!isAuthSuccess) {
                    // Artificial 500ms delay to thwart automated brute-force timing attacks
                    await new Promise(r => setTimeout(r, 500));
                    const remaining = 5 - (failureCount + 1);
                    const attemptWarning = remaining > 0 ? ` (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)` : '';
                    return res.status(401).json({ error: `Invalid username/email or password${attemptWarning}` });
                }

                const user = users[0];

                // On successful login, clear past failed attempts for this IP, username, and email
                await sql`
                    DELETE FROM login_attempts 
                    WHERE (ip_address = ${clientIp} OR username = ${cleanUser} OR username = ${user.username.toLowerCase()}) AND success = FALSE;
                `;

                const token = crypto.randomBytes(32).toString('hex');

                return res.status(200).json({
                    success: true,
                    user: { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role, company_id: user.company_id },
                    token
                });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'signup') {
            try {
                const { fullName, email, phone, password } = body;
                const cleanName = String(fullName || '').trim();
                const cleanEmail = String(email || '').trim().toLowerCase();
                const cleanPhone = String(phone || '').trim();

                if (!cleanName) {
                    return res.status(400).json({ error: 'Full name is required' });
                }
                if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
                    return res.status(400).json({ error: 'A valid email address is required' });
                }
                if (!password || String(password).length < 6) {
                    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
                }

                // Check if user with this email or username already exists
                const existing = await sql`
                    SELECT id FROM users 
                    WHERE LOWER(COALESCE(email, '')) = ${cleanEmail}
                    LIMIT 1
                `;
                if (existing.length > 0) {
                    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
                }

                // Generate new company workspace for this user
                const companyName = `${cleanName}'s Workspace`;
                let baseSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'workspace';
                const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;

                const compRes = await sql`
                    INSERT INTO companies (name, slug, email, phone, subscription_plan, subscription_status, is_active)
                    VALUES (${companyName}, ${uniqueSlug}, ${cleanEmail}, ${cleanPhone || null}, 'Starter (Free Forever)', 'active', true)
                    RETURNING id;
                `;
                const companyId = compRes[0]?.id || null;

                // Generate unique username
                let generatedUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '');
                if (!generatedUsername) generatedUsername = 'user';
                const userExists = await sql`SELECT id FROM users WHERE LOWER(username) = ${generatedUsername} LIMIT 1`;
                if (userExists.length > 0) {
                    generatedUsername = `${generatedUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
                }

                const newHash = hashPassword(password);
                const userRes = await sql`
                    INSERT INTO users (username, email, phone, password_hash, role, company_id)
                    VALUES (${generatedUsername}, ${cleanEmail}, ${cleanPhone || null}, ${newHash}, 'admin', ${companyId})
                    RETURNING id, username, email, phone, role, company_id;
                `;
                const newUser = userRes[0];
                const token = crypto.randomBytes(32).toString('hex');

                return res.status(201).json({
                    success: true,
                    user: newUser,
                    token,
                    message: 'Account created successfully!'
                });
            } catch (err) {
                console.error('Signup error:', err);
                return res.status(500).json({ error: err.message || 'Failed to create account' });
            }
        }

        if (action === 'google') {
            try {
                const { credential, email: directEmail, name: directName } = body;
                let email = directEmail;
                let name = directName;

                if (credential) {
                    try {
                        const parts = credential.split('.');
                        if (parts.length === 3) {
                            const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
                            const payload = JSON.parse(payloadJson);
                            if (payload.email) {
                                email = payload.email;
                                name = payload.name || payload.given_name || email.split('@')[0];
                            }
                        }
                    } catch (e) {
                        console.error('Failed to parse Google JWT payload:', e);
                    }
                }

                if (!email || !String(email).trim()) {
                    return res.status(400).json({ error: 'Valid Google email is required' });
                }

                const cleanEmail = String(email).trim().toLowerCase();

                // Look for existing user with this email
                let users = await sql`
                    SELECT id, username, email, phone, role, company_id 
                    FROM users 
                    WHERE LOWER(COALESCE(email, '')) = ${cleanEmail}
                    LIMIT 1
                `;

                let user;
                if (users.length > 0) {
                    user = users[0];
                } else {
                    // Auto-signup new user with Google OIDC
                    const cleanName = (name || cleanEmail.split('@')[0]).trim();
                    const companyName = `${cleanName}'s Workspace`;
                    const baseSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'workspace';
                    const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 7)}`;

                    const compRes = await sql`
                        INSERT INTO companies (name, slug, email, subscription_plan, subscription_status, is_active)
                        VALUES (${companyName}, ${uniqueSlug}, ${cleanEmail}, 'Starter (Free Forever)', 'active', true)
                        RETURNING id;
                    `;
                    const companyId = compRes[0]?.id || null;

                    let generatedUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '');
                    if (!generatedUsername) generatedUsername = 'user';
                    const userExists = await sql`SELECT id FROM users WHERE LOWER(username) = ${generatedUsername} LIMIT 1`;
                    if (userExists.length > 0) {
                        generatedUsername = `${generatedUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
                    }

                    const dummyPass = crypto.randomBytes(16).toString('hex');
                    const dummyHash = hashPassword(dummyPass);

                    const userRes = await sql`
                        INSERT INTO users (username, email, password_hash, role, company_id)
                        VALUES (${generatedUsername}, ${cleanEmail}, ${dummyHash}, 'admin', ${companyId})
                        RETURNING id, username, email, phone, role, company_id;
                    `;
                    user = userRes[0];
                }

                const token = crypto.randomBytes(32).toString('hex');
                return res.status(200).json({
                    success: true,
                    user: { id: user.id, username: user.username, email: user.email, phone: user.phone, role: user.role, company_id: user.company_id },
                    token
                });
            } catch (err) {
                console.error('Google auth error:', err);
                return res.status(500).json({ error: err.message || 'Google authentication failed' });
            }
        }

        if (action === 'admin-reset-password') {
            try {
                const { userId, username, newPassword } = body;
                if (!newPassword || newPassword.length < 6) {
                    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
                }

                const newHash = hashPassword(newPassword);

                if (userId) {
                    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${userId}`;
                } else if (username) {
                    await sql`UPDATE users SET password_hash = ${newHash} WHERE LOWER(username) = ${username.trim().toLowerCase()}`;
                } else {
                    return res.status(400).json({ error: 'User ID or Username is required' });
                }

                return res.status(200).json({ success: true, message: 'Password reset successfully' });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'save-user') {
            try {
                const { id, username, email, phone, company_id, password, role } = body;
                if (!username || !username.trim()) return res.status(400).json({ error: 'Username is required' });

                const cleanUser = username.trim().toLowerCase();
                const cleanEmail = email && String(email).trim() ? String(email).trim().toLowerCase() : null;
                const cleanPhone = phone && String(phone).trim() ? String(phone).trim() : null;
                const userRole = role || 'admin';
                const coId = (company_id && company_id !== 'default' && company_id !== 'parent' && String(company_id).trim() !== '' && String(company_id) !== 'null') ? parseInt(company_id) : null;
                const targetId = (id !== undefined && id !== null && String(id).trim() !== '' && String(id) !== '0' && String(id) !== 'null' && String(id) !== 'undefined') ? parseInt(id) : null;

                if (targetId) {
                    // Check limit if reassigning to a different company
                    if (coId) {
                        const oldUserRes = await sql`SELECT company_id FROM users WHERE id = ${targetId} LIMIT 1`;
                        const oldCoId = oldUserRes[0]?.company_id;
                        if (oldCoId !== coId) {
                            const compRows = await sql`
                                SELECT id, name, slug, subscription_plan, subscription_status 
                                FROM companies 
                                WHERE id = ${coId} 
                                LIMIT 1
                            `;
                            if (compRows.length > 0) {
                                const comp = compRows[0];
                                const isParent = (comp.slug && comp.slug.toLowerCase() === 'inspenox') || (comp.name && comp.name.toLowerCase() === 'inspenox');
                                if (!isParent) {
                                    const planStr = (comp.subscription_plan || '').toLowerCase();
                                    const isPaid = comp.subscription_status === 'active' && planStr && planStr !== 'none';
                                    let maxAllowedUsers = 1;
                                    if (isPaid) {
                                        if (planStr.includes('enterprise')) maxAllowedUsers = 999999;
                                        else if (planStr.includes('growth')) maxAllowedUsers = 5;
                                        else if (planStr.includes('starter')) maxAllowedUsers = 2;
                                    }
                                    const userCountRes = await sql`SELECT COUNT(*)::int as count FROM users WHERE company_id = ${coId}`;
                                    const currentCount = userCountRes[0]?.count || 0;
                                    if (currentCount >= maxAllowedUsers) {
                                        const planDisplayName = comp.subscription_plan || 'Unsubscribed (Free)';
                                        return res.status(403).json({
                                            error: `User creation limit reached (${currentCount}/${maxAllowedUsers} users for ${planDisplayName}). Cannot reassign user. Upgrade plan in Subscriptions & Billing.`
                                        });
                                    }
                                }
                            }
                        }
                    }

                    if (password && password.trim()) {
                        const newHash = hashPassword(password);
                        await sql`
                            UPDATE users 
                            SET username = ${cleanUser}, email = ${cleanEmail}, phone = ${cleanPhone}, company_id = ${coId}, role = ${userRole}, password_hash = ${newHash}
                            WHERE id = ${targetId}
                        `;
                    } else {
                        await sql`
                            UPDATE users 
                            SET username = ${cleanUser}, email = ${cleanEmail}, phone = ${cleanPhone}, company_id = ${coId}, role = ${userRole}
                            WHERE id = ${targetId}
                        `;
                    }
                } else {
                    if (!password || password.trim().length < 6) {
                        return res.status(400).json({ error: 'Password of min 6 characters is required for new users' });
                    }

                    // Enforce Plan Limits for User Creation
                    if (coId) {
                        const compRows = await sql`
                            SELECT id, name, slug, subscription_plan, subscription_status 
                            FROM companies 
                            WHERE id = ${coId} 
                            LIMIT 1
                        `;
                        if (compRows.length > 0) {
                            const comp = compRows[0];
                            const isParent = (comp.slug && comp.slug.toLowerCase() === 'inspenox') || (comp.name && comp.name.toLowerCase() === 'inspenox');

                            if (!isParent) {
                                const planStr = (comp.subscription_plan || '').toLowerCase();
                                const isPaid = comp.subscription_status === 'active' && planStr && planStr !== 'none';
                                let maxAllowedUsers = 1; // Default for unpaid / no plan: 1 user account

                                if (isPaid) {
                                    if (planStr.includes('enterprise')) {
                                        maxAllowedUsers = 999999;
                                    } else if (planStr.includes('growth')) {
                                        maxAllowedUsers = 5;
                                    } else if (planStr.includes('starter')) {
                                        maxAllowedUsers = 2;
                                    }
                                }

                                const userCountRes = await sql`
                                    SELECT COUNT(*)::int as count 
                                    FROM users 
                                    WHERE company_id = ${coId}
                                `;
                                const currentCount = userCountRes[0]?.count || 0;

                                if (currentCount >= maxAllowedUsers) {
                                    const planDisplayName = comp.subscription_plan || 'Unsubscribed (Free)';
                                    return res.status(403).json({
                                        error: `User creation limit reached (${currentCount}/${maxAllowedUsers} users for ${planDisplayName} plan). Please upgrade your subscription plan in Subscriptions & Billing to add more team members.`
                                    });
                                }
                            }
                        }
                    }

                    const newHash = hashPassword(password);
                    await sql`
                        INSERT INTO users (username, email, phone, password_hash, role, company_id)
                        VALUES (${cleanUser}, ${cleanEmail}, ${cleanPhone}, ${newHash}, ${userRole}, ${coId})
                    `;
                }

                return res.status(200).json({ success: true });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'change-password' || action === 'reset-password') {
            try {
                const { username, currentPassword, newPassword } = body;
                const targetUser = (username || 'admin').trim().toLowerCase();
                const passToSet = newPassword || currentPassword;

                if (!passToSet) {
                    return res.status(400).json({ error: 'New password is required' });
                }

                if (passToSet.length < 6) {
                    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
                }

                const newHash = hashPassword(passToSet);

                const users = await sql`
                    SELECT id, password_hash 
                    FROM users 
                    WHERE LOWER(username) = ${targetUser}
                `;

                if (users.length > 0) {
                    await sql`
                        UPDATE users 
                        SET password_hash = ${newHash} 
                        WHERE id = ${users[0].id}
                    `;
                } else {
                    return res.status(404).json({ error: 'User account not found' });
                }

                return res.status(200).json({
                    success: true,
                    message: 'Password updated successfully'
                });
            } catch (err) {
                console.error('Error updating password:', err);
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'clear-lockouts') {
            try {
                const { target } = body;
                if (target && target.trim()) {
                    const cleanTarget = target.trim().toLowerCase();
                    await sql`
                        DELETE FROM login_attempts 
                        WHERE (ip_address = ${cleanTarget} OR LOWER(username) = ${cleanTarget}) AND success = FALSE;
                    `;
                } else {
                    await sql`DELETE FROM login_attempts WHERE success = FALSE;`;
                }
                return res.status(200).json({ success: true, message: 'Rate limits & lockouts cleared successfully.' });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'delete-attempt') {
            try {
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'Attempt ID is required' });
                await sql`DELETE FROM login_attempts WHERE id = ${id}`;
                return res.status(200).json({ success: true });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'manual-lock') {
            try {
                const { target } = body;
                if (!target || !target.trim()) return res.status(400).json({ error: 'Target IP address or username is required' });
                const cleanTarget = target.trim().toLowerCase();
                for (let i = 0; i < 5; i++) {
                    await sql`
                        INSERT INTO login_attempts (ip_address, username, attempt_time, success)
                        VALUES (${cleanTarget}, ${cleanTarget}, NOW() AT TIME ZONE 'Asia/Kolkata', FALSE);
                    `;
                }
                return res.status(200).json({ success: true, message: `Locked out "${cleanTarget}" for 15 minutes.` });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        if (action === 'purge-old-logs') {
            try {
                const daysParam = parseInt(req.query.days || body.days || '30') || 30;
                await sql`
                    DELETE FROM login_attempts 
                    WHERE attempt_time < (NOW() AT TIME ZONE 'Asia/Kolkata') - (INTERVAL '1 day' * ${daysParam});
                `;
                return res.status(200).json({ 
                    success: true, 
                    message: `Successfully purged security attempt logs older than ${daysParam} days.` 
                });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
