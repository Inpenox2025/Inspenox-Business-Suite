const { getDb } = require('../lib/db');
const crypto = require('crypto');

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

        // Check if company_id column exists
        await sql`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
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
                    SELECT u.id, u.username, u.role, u.company_id, u.created_at, c.name as company_name 
                    FROM users u 
                    LEFT JOIN companies c ON u.company_id = c.id 
                    WHERE u.company_id = ${parseInt(companyFilter)}
                    ORDER BY u.id ASC
                `;
            } else {
                users = await sql`
                    SELECT u.id, u.username, u.role, u.company_id, u.created_at, c.name as company_name 
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
                    return res.status(400).json({ error: 'Username and password required' });
                }

                if (cleanUser.length > 100 || String(password).length > 128) {
                    return res.status(400).json({ error: 'Input length exceeds security limit' });
                }

                const clientIp = getClientIp(req);

                // Rate Limiting Check: Max 5 failed attempts per 15 minutes per IP or per Username
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

                const users = await sql`
                    SELECT id, username, role, password_hash, company_id 
                    FROM users 
                    WHERE LOWER(username) = ${cleanUser}
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
                    return res.status(401).json({ error: `Invalid username or password${attemptWarning}` });
                }

                // On successful login, clear past failed attempts for this IP and username
                await sql`
                    DELETE FROM login_attempts 
                    WHERE (ip_address = ${clientIp} OR username = ${cleanUser}) AND success = FALSE;
                `;

                const user = users[0];
                const token = crypto.randomBytes(32).toString('hex');

                return res.status(200).json({
                    success: true,
                    user: { id: user.id, username: user.username, role: user.role, company_id: user.company_id },
                    token
                });
            } catch (err) {
                return res.status(500).json({ error: err.message });
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
                const { id, username, company_id, password, role } = body;
                if (!username || !username.trim()) return res.status(400).json({ error: 'Username is required' });

                const cleanUser = username.trim().toLowerCase();
                const userRole = role || 'admin';
                const coId = (company_id && company_id !== 'default' && company_id !== 'parent' && String(company_id).trim() !== '' && String(company_id) !== 'null') ? parseInt(company_id) : null;
                const targetId = (id !== undefined && id !== null && String(id).trim() !== '' && String(id) !== '0' && String(id) !== 'null' && String(id) !== 'undefined') ? parseInt(id) : null;

                if (targetId) {
                    if (password && password.trim()) {
                        const newHash = hashPassword(password);
                        await sql`
                            UPDATE users 
                            SET username = ${cleanUser}, company_id = ${coId}, role = ${userRole}, password_hash = ${newHash}
                            WHERE id = ${targetId}
                        `;
                    } else {
                        await sql`
                            UPDATE users 
                            SET username = ${cleanUser}, company_id = ${coId}, role = ${userRole}
                            WHERE id = ${targetId}
                        `;
                    }
                } else {
                    if (!password || password.trim().length < 6) {
                        return res.status(400).json({ error: 'Password of min 6 characters is required for new users' });
                    }
                    const newHash = hashPassword(password);
                    await sql`
                        INSERT INTO users (username, password_hash, role, company_id)
                        VALUES (${cleanUser}, ${newHash}, ${userRole}, ${coId})
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
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
