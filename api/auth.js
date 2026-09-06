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

        // Check if admin user exists, if not create 'admin' / 'admin123'
        const adminUsers = await sql`SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1;`;
        if (adminUsers.length === 0) {
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

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);
    await ensureUsersTable(sql);

    const action = req.query.action || 'login';
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (req.method === 'GET') {
        try {
            const users = await sql`
                SELECT u.id, u.username, u.role, u.company_id, u.created_at, c.name as company_name 
                FROM users u 
                LEFT JOIN companies c ON u.company_id = c.id 
                ORDER BY u.id ASC
            `;
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
                if (!username || !password) {
                    return res.status(400).json({ error: 'Username and password required' });
                }

                const cleanUser = username.trim().toLowerCase();
                const hash = hashPassword(password);
                const legacyHash = legacyHashPassword(password);

                const users = await sql`
                    SELECT id, username, role, password_hash, company_id 
                    FROM users 
                    WHERE LOWER(username) = ${cleanUser}
                `;

                if (users.length === 0 || (users[0].password_hash !== hash && users[0].password_hash !== legacyHash)) {
                    return res.status(401).json({ error: 'Invalid username or password' });
                }

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
                const coId = (company_id && company_id !== 'default' && String(company_id) !== '1') ? parseInt(company_id) : null;

                if (id) {
                    if (password && password.trim()) {
                        const newHash = hashPassword(password);
                        await sql`
                            UPDATE users 
                            SET username = ${cleanUser}, company_id = ${coId}, role = ${userRole}, password_hash = ${newHash}
                            WHERE id = ${id}
                        `;
                    } else {
                        await sql`
                            UPDATE users 
                            SET username = ${cleanUser}, company_id = ${coId}, role = ${userRole}
                            WHERE id = ${id}
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
                    await sql`
                        INSERT INTO users (username, password_hash, role)
                        VALUES (${targetUser}, ${newHash}, 'admin')
                    `;
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
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
