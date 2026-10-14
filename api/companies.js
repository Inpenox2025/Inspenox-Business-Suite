const { getDb } = require('../lib/db');

function getCompanyPhoneLimit(planName, isMaster) {
    if (isMaster) return 20;
    if (!planName) return 0;
    const lower = String(planName).toLowerCase().trim();
    if (lower.includes('enterprise')) return 20;
    if (lower.includes('growth')) return 3;
    if (lower.includes('starter')) return 1;
    return 1;
}

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);

    // Auto-create companies table if missing & migrate column if old schema
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                whatsapp_phone_number_id TEXT,
                whatsapp_access_token TEXT,
                whatsapp_business_account_id TEXT,
                whatsapp_verify_token TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `;
        await sql`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='companies' AND column_name='webhook_verify_token'
                ) THEN
                    ALTER TABLE companies RENAME COLUMN webhook_verify_token TO whatsapp_verify_token;
                END IF;
            END $$;
        `;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT;`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT;`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT NULL;`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT NULL;`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_billing_cycle TEXT DEFAULT 'monthly';`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_phone_numbers JSONB DEFAULT '[]'::jsonb;`;

        // Auto-ensure default parent company Inspenox exists in DB with NULL DB credentials (loaded from ENV only)
        try {
            const inspenoxRow = await sql`SELECT id FROM companies WHERE slug = 'inspenox' OR LOWER(name) = 'inspenox' LIMIT 1`;
            if (inspenoxRow.length === 0) {
                await sql`
                    INSERT INTO companies (name, slug, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token, is_active)
                    VALUES ('Inspenox', 'inspenox', NULL, NULL, NULL, NULL, true);
                `;
            } else {
                // Keep credentials strictly NULL in DB for Inspenox parent company
                await sql`
                    UPDATE companies 
                    SET whatsapp_phone_number_id = NULL, whatsapp_access_token = NULL, whatsapp_business_account_id = NULL, whatsapp_verify_token = NULL
                    WHERE slug = 'inspenox' OR LOWER(name) = 'inspenox';
                `;
            }
        } catch(e) {}

        // Reset any child companies that inadvertently received 'Starter' plan default without payment
        try {
            await sql`
                UPDATE companies 
                SET subscription_plan = NULL, subscription_status = 'inactive'
                WHERE (subscription_plan = 'Starter' OR subscription_plan = 'Starter Tier')
                  AND (subscription_status = 'inactive' OR subscription_status IS NULL)
                  AND name NOT ILIKE '%inspenox%' AND slug NOT ILIKE '%inspenox%';
            `;
        } catch(e) {}
    } catch(e) {
        console.error("Table creation error for companies:", e);
    }

    if (req.method === 'GET') {
        try {
            const systemEnv = {
                whatsapp_phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || '',
                whatsapp_business_account_id: env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
                whatsapp_access_token: env.WHATSAPP_ACCESS_TOKEN || '',
                whatsapp_verify_token: env.WHATSAPP_VERIFY_TOKEN || 'marketinginspenox',
                has_access_token: !!(env.WHATSAPP_ACCESS_TOKEN)
            };

            let companies = await sql`
                SELECT id, name, slug, email, phone, subscription_plan, subscription_status,
                       subscription_expires_at, subscription_billing_cycle,
                       TO_CHAR(subscription_expires_at, 'YYYY-MM-DD HH24:MI:SS') as subscription_expires_at_formatted,
                       whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_access_token, 
                       whatsapp_verify_token, whatsapp_phone_numbers, is_active, created_at,
                       (SELECT COUNT(*) FROM customers c WHERE c.company_id = companies.id) as customer_count,
                       (SELECT COUNT(*) FROM messages m WHERE m.company_id = companies.id) as message_count
                FROM companies 
                ORDER BY id ASC
            `;

            // If no companies exist, seed default Inspenox parent company without credentials in DB
            if (companies.length === 0) {
                const defaultCo = await sql`
                    INSERT INTO companies (name, slug, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token, is_active)
                    VALUES ('Inspenox', 'inspenox', NULL, NULL, NULL, NULL, true)
                    RETURNING *
                `;
                companies = [defaultCo[0]];
            }

            // Hydrate environment variable fallbacks ONLY for primary parent Inspenox master company
            let resolvedCompanies = companies.map(c => {
                const isMaster = (c.slug && c.slug.toLowerCase() === 'inspenox') || (c.name && c.name.toLowerCase() === 'inspenox');
                const isExpired = !isMaster && c.subscription_expires_at && (new Date(c.subscription_expires_at) < new Date());
                const isPaid = isMaster || (!isExpired && c.subscription_status === 'active' && c.subscription_plan && c.subscription_plan.toLowerCase() !== 'none');
                const effectiveStatus = isExpired ? 'expired' : (c.subscription_status || 'inactive');

                if (isMaster) {
                    let masterPhoneNumbers = Array.isArray(c.whatsapp_phone_numbers) && c.whatsapp_phone_numbers.length > 0 
                        ? c.whatsapp_phone_numbers 
                        : [];
                    if (masterPhoneNumbers.length === 0 && systemEnv.whatsapp_phone_number_id) {
                        masterPhoneNumbers = [{
                            phone: c.phone || '+91 79816 56294',
                            phone_number_id: systemEnv.whatsapp_phone_number_id,
                            verified_name: 'Inspenox Parent',
                            status: 'Registered',
                            is_default: true
                        }];
                    }

                    return {
                        ...c,
                        name: 'Inspenox',
                        slug: 'inspenox',
                        subscription_status: 'active',
                        is_expired: false,
                        subscription_expires_at: null,
                        subscription_billing_cycle: c.subscription_billing_cycle || 'monthly',
                        whatsapp_phone_number_id: systemEnv.whatsapp_phone_number_id,
                        whatsapp_business_account_id: systemEnv.whatsapp_business_account_id,
                        whatsapp_access_token: systemEnv.whatsapp_access_token,
                        whatsapp_verify_token: systemEnv.whatsapp_verify_token,
                        whatsapp_phone_numbers: masterPhoneNumbers,
                        phone_limit: 20,
                        is_parent: true,
                        is_master: true,
                        is_env_loaded: true
                    };
                }

                // For other companies: NEVER fall back to system ENV defaults for unpaid or child accounts!
                const planLimit = getCompanyPhoneLimit(c.subscription_plan, false);
                let childPhoneNumbers = [];
                if (isPaid) {
                    if (Array.isArray(c.whatsapp_phone_numbers) && c.whatsapp_phone_numbers.length > 0) {
                        childPhoneNumbers = c.whatsapp_phone_numbers;
                    } else if (c.whatsapp_phone_number_id) {
                        childPhoneNumbers = [{
                            phone: c.phone || '',
                            phone_number_id: c.whatsapp_phone_number_id,
                            verified_name: c.name || '',
                            status: 'Registered',
                            is_default: true
                        }];
                    }
                }

                const primaryPhoneId = isPaid 
                    ? (c.whatsapp_phone_number_id || (childPhoneNumbers.find(p => p.is_default)?.phone_number_id || (childPhoneNumbers[0] ? childPhoneNumbers[0].phone_number_id : null)))
                    : null;

                return {
                    ...c,
                    subscription_status: effectiveStatus,
                    is_expired: isExpired,
                    subscription_expires_at: c.subscription_expires_at,
                    subscription_billing_cycle: c.subscription_billing_cycle || 'monthly',
                    subscription_expires_at_formatted: c.subscription_expires_at_formatted,
                    is_parent: false,
                    is_master: false,
                    phone_limit: isPaid ? planLimit : 0,
                    whatsapp_phone_numbers: childPhoneNumbers,
                    whatsapp_phone_number_id: primaryPhoneId,
                    whatsapp_business_account_id: isPaid ? (c.whatsapp_business_account_id || null) : null,
                    whatsapp_access_token: isPaid ? (c.whatsapp_access_token || null) : null,
                    whatsapp_verify_token: isPaid ? (c.whatsapp_verify_token || null) : null
                };
            });

            const filterCoId = req.query.company_id;
            if (req.query.all !== 'true' && filterCoId && filterCoId !== 'default' && filterCoId !== 'parent' && filterCoId !== 'all') {
                resolvedCompanies = resolvedCompanies.filter(c => String(c.id) === String(filterCoId));
            }

            if (req.query.include_env === 'true') {
                return res.status(200).json({
                    companies: resolvedCompanies,
                    system_env: req.query.is_parent === 'true' ? systemEnv : {}
                });
            }

            return res.status(200).json(resolvedCompanies);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { name, email, phone, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token } = req.body || {};

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Company name is required' });
            }

            const cleanName = name.trim();
            const cleanEmail = email && String(email).trim() ? String(email).trim().toLowerCase() : null;
            const cleanPhone = phone && String(phone).trim() ? String(phone).trim() : null;
            const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `co-${Date.now()}`;

            try {
                await sql`SELECT setval(pg_get_serial_sequence('companies', 'id'), COALESCE((SELECT MAX(id) FROM companies), 1));`;
            } catch(e) {}

            // Newly created companies must NOT be assigned any subscription plan or Meta credentials until subscribed!
            const result = await sql`
                INSERT INTO companies (name, slug, email, phone, whatsapp_phone_number_id, whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token, subscription_plan, subscription_status)
                VALUES (${cleanName}, ${slug}, ${cleanEmail}, ${cleanPhone}, NULL, NULL, NULL, ${whatsapp_verify_token || 'manasageetha'}, NULL, 'inactive')
                RETURNING *
            `;

            return res.status(200).json({ success: true, company: result[0] });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { 
                id, name, email, phone, subscription_plan, subscription_expires_at, subscription_billing_cycle,
                whatsapp_phone_number_id, whatsapp_phone_numbers,
                whatsapp_access_token, whatsapp_business_account_id, whatsapp_verify_token, is_active 
            } = req.body || {};

            if (!id) return res.status(400).json({ error: 'Company ID is required' });

            const existing = await sql`SELECT * FROM companies WHERE id = ${id} LIMIT 1`;
            if (existing.length === 0) return res.status(404).json({ error: 'Company not found' });

            const oldComp = existing[0];
            const isMaster = (oldComp.slug && oldComp.slug.toLowerCase() === 'inspenox') || (oldComp.name && oldComp.name.toLowerCase() === 'inspenox');
            const isPaid = oldComp.subscription_status === 'active' && oldComp.subscription_plan && oldComp.subscription_plan.toLowerCase() !== 'none';

            // Check if user is attempting to configure Meta credentials without an active paid subscription
            const hasIncomingCreds = (whatsapp_phone_number_id && String(whatsapp_phone_number_id).trim() !== '') ||
                                    (whatsapp_phone_numbers && Array.isArray(whatsapp_phone_numbers) && whatsapp_phone_numbers.length > 0) ||
                                    (whatsapp_access_token && String(whatsapp_access_token).trim() !== '') ||
                                    (whatsapp_business_account_id && String(whatsapp_business_account_id).trim() !== '');

            if (!isMaster && !isPaid && hasIncomingCreds) {
                return res.status(403).json({
                    error: 'Subscription Required: You must subscribe to an Inspenox plan before adding Meta WhatsApp credentials.'
                });
            }

            const updatedName = isMaster ? 'Inspenox' : ((name && name.trim()) ? name.trim() : oldComp.name);
            const updatedEmail = email !== undefined ? (email && String(email).trim() ? String(email).trim().toLowerCase() : null) : oldComp.email;
            const updatedPhone = phone !== undefined ? (phone && String(phone).trim() ? String(phone).trim() : null) : oldComp.phone;
            
            // Strictly do NOT default to 'Starter'! Only set if explicitly provided
            const updatedPlan = subscription_plan !== undefined ? (subscription_plan || null) : (oldComp.subscription_plan || null);
            const updatedStatus = updatedPlan ? 'active' : (oldComp.subscription_status || 'inactive');
            const updatedExpiresAt = subscription_expires_at !== undefined ? (subscription_expires_at || null) : (oldComp.subscription_expires_at || null);
            const updatedCycle = subscription_billing_cycle !== undefined ? (subscription_billing_cycle || 'monthly') : (oldComp.subscription_billing_cycle || 'monthly');

            // Plan limits enforcement on multiple phone numbers
            let cleanPhoneNumbers = null;
            if (whatsapp_phone_numbers !== undefined && Array.isArray(whatsapp_phone_numbers)) {
                const maxLimit = getCompanyPhoneLimit(updatedPlan, isMaster);
                if (!isMaster && !isPaid && whatsapp_phone_numbers.length > 0) {
                    return res.status(403).json({
                        error: 'Subscription Required: You must subscribe to an Inspenox plan before adding Meta WhatsApp phone numbers.'
                    });
                }
                if (whatsapp_phone_numbers.length > maxLimit) {
                    return res.status(400).json({
                        error: `Plan limit exceeded: Your ${updatedPlan || 'current'} subscription plan allows a maximum of ${maxLimit} WhatsApp phone number(s). Please upgrade to add more numbers.`
                    });
                }

                cleanPhoneNumbers = whatsapp_phone_numbers.map((item, idx) => ({
                    phone: (item.phone || '').trim(),
                    phone_number_id: (item.phone_number_id || '').trim(),
                    verified_name: (item.verified_name || '').trim(),
                    status: item.status || 'Registered',
                    is_default: item.is_default !== undefined ? !!item.is_default : (idx === 0)
                })).filter(item => item.phone_number_id);

                if (cleanPhoneNumbers.length > 0 && !cleanPhoneNumbers.some(p => p.is_default)) {
                    cleanPhoneNumbers[0].is_default = true;
                }
            }

            let defaultPhoneId = null;
            if (cleanPhoneNumbers && cleanPhoneNumbers.length > 0) {
                const def = cleanPhoneNumbers.find(p => p.is_default) || cleanPhoneNumbers[0];
                defaultPhoneId = def.phone_number_id;
            }

            // Parent Inspenox WhatsApp configuration strictly goes from ENV only, NEVER stored in DB!
            const updatedPhoneId = isMaster ? null : ((!isPaid) ? null : (defaultPhoneId || ((whatsapp_phone_number_id !== undefined && whatsapp_phone_number_id !== null && String(whatsapp_phone_number_id).trim() !== '') ? String(whatsapp_phone_number_id).trim() : oldComp.whatsapp_phone_number_id)));
            const phoneNumbersJson = cleanPhoneNumbers !== null ? JSON.stringify(cleanPhoneNumbers) : (oldComp.whatsapp_phone_numbers ? JSON.stringify(oldComp.whatsapp_phone_numbers) : '[]');
            const updatedWabaId = isMaster ? null : ((!isPaid) ? null : ((whatsapp_business_account_id !== undefined && whatsapp_business_account_id !== null && String(whatsapp_business_account_id).trim() !== '') ? String(whatsapp_business_account_id).trim() : oldComp.whatsapp_business_account_id));
            const updatedToken = isMaster ? null : ((!isPaid) ? null : ((whatsapp_access_token && String(whatsapp_access_token).trim() !== '') ? String(whatsapp_access_token).trim() : oldComp.whatsapp_access_token));
            const updatedVerify = isMaster ? null : ((!isPaid) ? null : ((whatsapp_verify_token && String(whatsapp_verify_token).trim() !== '') ? String(whatsapp_verify_token).trim() : oldComp.whatsapp_verify_token));
            const updatedActive = is_active !== undefined ? is_active : oldComp.is_active;

            const result = await sql`
                UPDATE companies 
                SET name = ${updatedName},
                    email = ${updatedEmail},
                    phone = ${updatedPhone},
                    subscription_plan = ${updatedPlan},
                    subscription_status = ${updatedStatus},
                    subscription_expires_at = ${updatedExpiresAt},
                    subscription_billing_cycle = ${updatedCycle},
                    whatsapp_phone_number_id = ${updatedPhoneId},
                    whatsapp_phone_numbers = ${phoneNumbersJson}::jsonb,
                    whatsapp_business_account_id = ${updatedWabaId},
                    whatsapp_access_token = ${updatedToken},
                    whatsapp_verify_token = ${updatedVerify},
                    is_active = ${updatedActive}
                WHERE id = ${id}
                RETURNING *
            `;

            if (result.length === 0) return res.status(404).json({ error: 'Company not found' });

            const returnComp = isMaster ? {
                ...result[0],
                name: 'Inspenox',
                slug: 'inspenox',
                whatsapp_phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID || '',
                whatsapp_business_account_id: env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
                whatsapp_access_token: env.WHATSAPP_ACCESS_TOKEN || '',
                whatsapp_verify_token: env.WHATSAPP_VERIFY_TOKEN || 'marketinginspenox',
                whatsapp_phone_numbers: cleanPhoneNumbers || result[0].whatsapp_phone_numbers || [],
                phone_limit: 20,
                is_parent: true,
                is_master: true,
                is_env_loaded: true
            } : {
                ...result[0],
                phone_limit: isPaid ? getCompanyPhoneLimit(updatedPlan, false) : 0
            };

            return res.status(200).json({ success: true, company: returnComp });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ error: 'Company ID is required' });

            const targetComp = await sql`SELECT id, name, slug FROM companies WHERE id = ${id} LIMIT 1`;
            if (targetComp.length > 0) {
                const compName = (targetComp[0].name || '').toLowerCase();
                const compSlug = (targetComp[0].slug || '').toLowerCase();
                if (compName === 'inspenox' || compSlug === 'inspenox') {
                    return res.status(403).json({ error: 'Inspenox is the primary parent organization and cannot be deleted.' });
                }
            }

            try { await sql`DELETE FROM messages WHERE company_id = ${id}`; } catch(e) {}
            try { await sql`DELETE FROM customers WHERE company_id = ${id}`; } catch(e) {}
            await sql`DELETE FROM companies WHERE id = ${id}`;
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
