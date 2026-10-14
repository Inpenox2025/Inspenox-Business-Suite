const { getDb } = require('../lib/db');
const crypto = require('node:crypto');
const { sendSubscriptionReceiptEmail } = require('../lib/email');

async function ensurePaymentTables(sql) {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS coupons (
                id SERIAL PRIMARY KEY,
                coupon_code TEXT UNIQUE NOT NULL,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                discount_percent NUMERIC DEFAULT 0,
                commission_percent NUMERIC DEFAULT 0,
                usage_limit INT,
                used_count INT DEFAULT 0,
                expiry_date TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS payment_logs (
                id SERIAL PRIMARY KEY,
                company_id INT REFERENCES companies(id) ON DELETE SET NULL,
                order_id TEXT,
                payment_id TEXT,
                user_email TEXT,
                user_phone TEXT,
                plan_name TEXT,
                original_amount NUMERIC,
                discount_amount NUMERIC,
                final_amount NUMERIC,
                coupon_code TEXT,
                coupon_id INT REFERENCES coupons(id),
                influencer_id INT REFERENCES users(id),
                commission_amount NUMERIC,
                status TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;

        await sql`ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;`;
        await sql`ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';`;
        await sql`ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ DEFAULT NULL;`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT NULL;`;
        await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_billing_cycle TEXT DEFAULT 'monthly';`;

        // Ensure users table has influencer & bank fields if referenced
        await sql`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_influencer TEXT DEFAULT 'FALSE';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS account_holder_name TEXT DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS ifsc_code TEXT DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
        `;
    } catch (err) {
        console.error('Error ensuring payment tables:', err);
    }
}

const SUBSCRIPTION_PLANS = [
    {
        id: 'starter',
        name: 'Starter Tier',
        description: 'Perfect for small businesses beginning their automated WhatsApp messaging journey.',
        price_monthly: 999,
        price_4months: 3596, // ~10% off (₹899/mo)
        price_6months: 5095, // ~15% off (₹849/mo)
        price_annual: 9590, // ~20% off (₹799/mo)
        popular: false,
        badge: 'Essential',
        features: [
            '1 Connected WhatsApp Business Number',
            'Up to 1,500 Active Contacts',
            'Pre-Approved WhatsApp Templates',
            'Basic Direct Broadcast Campaigns',
            'Customer Support (Standard Email)',
            'Standard Delivery Speed'
        ]
    },
    {
        id: 'growth',
        name: 'Growth Pro',
        description: 'Built for scaling brands requiring multi-team access and intelligent broadcasts.',
        price_monthly: 2499,
        price_4months: 8996, // ~10% off (₹2,249/mo)
        price_6months: 12745, // ~15% off (₹2,124/mo)
        price_annual: 23990, // ~20% off (₹1,999/mo)
        popular: true,
        badge: 'Most Popular',
        features: [
            'Up to 3 WhatsApp Phone Numbers',
            'Up to 15,000 Active Contacts',
            'Dynamic Broadcast Variables & Tags',
            'Multi-Channel Inbox (Live Chat & WhatsApp)',
            '5 Team Members / Agent Accounts',
            'Detailed Meta Delivery Analytics',
            'Priority Queue Broadcast Engine'
        ]
    },
    {
        id: 'enterprise',
        name: 'Enterprise Elite',
        description: 'Complete multi-tenant ecosystem for corporate agencies and high-volume operations.',
        price_monthly: 5999,
        price_4months: 21596, // ~10% off (₹5,399/mo)
        price_6months: 30595, // ~15% off (₹5,099/mo)
        price_annual: 57590, // ~20% off (₹4,799/mo)
        popular: false,
        badge: 'Enterprise',
        features: [
            'Unlimited WhatsApp Business Accounts',
            'Unlimited Active Customer Records',
            'Multi-Tenant Company Workspace Switcher',
            'Unlimited Team Members & Role Permissions',
            'Dedicated Webhooks & Custom Meta System Tokens',
            'White-Glove Onboarding & 24/7 SLA Support',
            'Maximum Meta API Throughput (Tier 3/Unlimited)',
            'This Plan pricing only for exisiting features for Extra Addon Features Billed Separately'
        ]
    }
];

module.exports = async (req, res) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    const env = req.env || process.env || {};
    const action = req.query.action || 'plans';
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const razorpayKeyId = env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';
    const razorpayKeySecret = env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || '';

    // Fast-path: plans & config do not require DB
    if (req.method === 'GET' && (action === 'plans' || action === 'config')) {
        return res.status(200).json({
            success: true,
            plans: SUBSCRIPTION_PLANS,
            razorpay_key_id: razorpayKeyId,
            has_keys: !!(razorpayKeyId && razorpayKeySecret)
        });
    }

    let sql;
    try {
        sql = getDb(env);
        await ensurePaymentTables(sql);
    } catch (e) {
        return res.status(500).json({ error: `Database initialization error: ${e.message}` });
    }

    // ==========================================
    // GET Actions
    // ==========================================
    if (req.method === 'GET') {
        try {
            if (action === 'coupons') {
                const coupons = await sql`
                    SELECT c.id, c.coupon_code, c.user_id, c.discount_percent, c.commission_percent,
                           c.usage_limit, c.used_count, c.expiry_date, c.is_active, c.created_at,
                           u.username as influencer_username, u.email as influencer_email, u.phone as influencer_phone
                    FROM coupons c
                    LEFT JOIN users u ON c.user_id = u.id
                    ORDER BY c.id DESC;
                `;
                return res.status(200).json({ success: true, coupons });
            }

            if (action === 'logs' || action === 'receipts') {
                const companyIdParam = req.query.company_id;
                const emailParam = req.query.email ? String(req.query.email).trim().toLowerCase() : null;
                const coId = (companyIdParam && companyIdParam !== 'default' && companyIdParam !== 'null' && companyIdParam !== '0') ? parseInt(companyIdParam) : null;

                let logs = [];
                if (coId && emailParam) {
                    logs = await sql`
                        SELECT p.id, p.company_id, p.order_id, p.payment_id, p.user_email, p.user_phone,
                               p.plan_name, p.billing_cycle, p.valid_until,
                               TO_CHAR(p.valid_until, 'YYYY-MM-DD HH24:MI:SS') as valid_until_formatted,
                               p.original_amount, p.discount_amount, p.final_amount,
                               p.coupon_code, p.coupon_id, p.influencer_id, p.commission_amount,
                               p.status, TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at_formatted,
                               p.created_at,
                               u.username as influencer_username
                        FROM payment_logs p
                        LEFT JOIN users u ON p.influencer_id = u.id
                        WHERE p.company_id = ${coId} OR LOWER(p.user_email) = ${emailParam}
                        ORDER BY p.id DESC
                        LIMIT 100;
                    `;
                } else if (coId) {
                    logs = await sql`
                        SELECT p.id, p.company_id, p.order_id, p.payment_id, p.user_email, p.user_phone,
                               p.plan_name, p.billing_cycle, p.valid_until,
                               TO_CHAR(p.valid_until, 'YYYY-MM-DD HH24:MI:SS') as valid_until_formatted,
                               p.original_amount, p.discount_amount, p.final_amount,
                               p.coupon_code, p.coupon_id, p.influencer_id, p.commission_amount,
                               p.status, TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at_formatted,
                               p.created_at,
                               u.username as influencer_username
                        FROM payment_logs p
                        LEFT JOIN users u ON p.influencer_id = u.id
                        WHERE p.company_id = ${coId}
                        ORDER BY p.id DESC
                        LIMIT 100;
                    `;
                } else if (emailParam && action === 'receipts') {
                    logs = await sql`
                        SELECT p.id, p.company_id, p.order_id, p.payment_id, p.user_email, p.user_phone,
                               p.plan_name, p.billing_cycle, p.valid_until,
                               TO_CHAR(p.valid_until, 'YYYY-MM-DD HH24:MI:SS') as valid_until_formatted,
                               p.original_amount, p.discount_amount, p.final_amount,
                               p.coupon_code, p.coupon_id, p.influencer_id, p.commission_amount,
                               p.status, TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at_formatted,
                               p.created_at,
                               u.username as influencer_username
                        FROM payment_logs p
                        LEFT JOIN users u ON p.influencer_id = u.id
                        WHERE LOWER(p.user_email) = ${emailParam}
                        ORDER BY p.id DESC
                        LIMIT 100;
                    `;
                } else {
                    logs = await sql`
                        SELECT p.id, p.company_id, p.order_id, p.payment_id, p.user_email, p.user_phone,
                               p.plan_name, p.billing_cycle, p.valid_until,
                               TO_CHAR(p.valid_until, 'YYYY-MM-DD HH24:MI:SS') as valid_until_formatted,
                               p.original_amount, p.discount_amount, p.final_amount,
                               p.coupon_code, p.coupon_id, p.influencer_id, p.commission_amount,
                               p.status, TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at_formatted,
                               p.created_at,
                               u.username as influencer_username
                        FROM payment_logs p
                        LEFT JOIN users u ON p.influencer_id = u.id
                        ORDER BY p.id DESC
                        LIMIT 250;
                    `;
                }

                // Aggregate metrics
                const stats = await sql`
                    SELECT 
                        COUNT(*)::int as total_orders,
                        COALESCE(SUM(final_amount), 0)::numeric as total_revenue,
                        COALESCE(SUM(discount_amount), 0)::numeric as total_discounts,
                        COALESCE(SUM(commission_amount), 0)::numeric as total_commissions
                    FROM payment_logs
                    WHERE status = 'paid';
                `;

                return res.status(200).json({
                    success: true,
                    logs,
                    stats: stats[0] || { total_orders: 0, total_revenue: 0, total_discounts: 0, total_commissions: 0 }
                });
            }

            return res.status(400).json({ error: `Unknown GET action "${action}"` });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // ==========================================
    // DELETE Actions
    // ==========================================
    if (req.method === 'DELETE') {
        try {
            if (action === 'delete-coupon') {
                const couponId = req.query.id || body.id;
                if (!couponId) return res.status(400).json({ error: 'Coupon ID is required' });

                await sql`DELETE FROM coupons WHERE id = ${parseInt(couponId)}`;
                return res.status(200).json({ success: true, message: 'Coupon deleted successfully' });
            }

            return res.status(400).json({ error: `Unknown DELETE action "${action}"` });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // ==========================================
    // POST Actions
    // ==========================================
    if (req.method === 'POST') {
        try {
            // 1. Validate Coupon
            if (action === 'validate-coupon') {
                const { coupon_code, amount } = body;
                if (!coupon_code || !String(coupon_code).trim()) {
                    return res.status(400).json({ error: 'Coupon code is required' });
                }

                const cleanCode = String(coupon_code).trim().toUpperCase();
                const numAmount = parseFloat(amount) || 0;

                const results = await sql`
                    SELECT c.*, u.username as influencer_name
                    FROM coupons c
                    LEFT JOIN users u ON c.user_id = u.id
                    WHERE UPPER(c.coupon_code) = ${cleanCode}
                    LIMIT 1;
                `;

                if (results.length === 0) {
                    return res.status(404).json({ error: `Coupon code "${cleanCode}" is invalid.` });
                }

                const coupon = results[0];

                if (!coupon.is_active) {
                    return res.status(400).json({ error: `Coupon "${cleanCode}" is currently inactive.` });
                }

                if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
                    return res.status(400).json({ error: `Coupon "${cleanCode}" expired on ${new Date(coupon.expiry_date).toLocaleDateString()}.` });
                }

                if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
                    return res.status(400).json({ error: `Coupon "${cleanCode}" has reached its maximum usage limit.` });
                }

                const discountPercent = parseFloat(coupon.discount_percent) || 0;
                const discountAmount = Math.round((numAmount * discountPercent) / 100 * 100) / 100;
                const finalAmount = Math.max(0, Math.round((numAmount - discountAmount) * 100) / 100);

                const commissionPercent = parseFloat(coupon.commission_percent) || 0;
                const commissionAmount = Math.round((finalAmount * commissionPercent) / 100 * 100) / 100;

                return res.status(200).json({
                    success: true,
                    valid: true,
                    coupon_id: coupon.id,
                    coupon_code: coupon.coupon_code,
                    discount_percent: discountPercent,
                    discount_amount: discountAmount,
                    final_amount: finalAmount,
                    commission_percent: commissionPercent,
                    commission_amount: commissionAmount,
                    influencer_id: coupon.user_id,
                    influencer_name: coupon.influencer_name
                });
            }

            // 2. Create Razorpay Order
            if (action === 'create-order') {
                const { plan_name, billing_cycle, original_amount, coupon_code, email, phone, company_id } = body;
                const billingCycle = String(billing_cycle || 'monthly').toLowerCase();
                const numOriginal = parseFloat(original_amount) || 0;
                let finalAmount = numOriginal;
                let discountAmount = 0;
                let couponId = null;
                let influencerId = null;
                let commissionAmount = 0;

                // Validate and apply coupon if provided
                if (coupon_code && String(coupon_code).trim()) {
                    const cleanCode = String(coupon_code).trim().toUpperCase();
                    const coupRes = await sql`
                        SELECT * FROM coupons 
                        WHERE UPPER(coupon_code) = ${cleanCode} AND is_active = TRUE 
                        LIMIT 1;
                    `;
                    if (coupRes.length > 0) {
                        const c = coupRes[0];
                        const notExpired = !c.expiry_date || new Date(c.expiry_date) >= new Date();
                        const withinLimit = !c.usage_limit || c.used_count < c.usage_limit;
                        if (notExpired && withinLimit) {
                            const discPct = parseFloat(c.discount_percent) || 0;
                            discountAmount = Math.round((numOriginal * discPct) / 100 * 100) / 100;
                            finalAmount = Math.max(0, Math.round((numOriginal - discountAmount) * 100) / 100);
                            couponId = c.id;
                            influencerId = c.user_id;
                            const commPct = parseFloat(c.commission_percent) || 0;
                            commissionAmount = Math.round((finalAmount * commPct) / 100 * 100) / 100;
                        }
                    }
                }

                // If Razorpay Keys configured, call official Razorpay Orders API
                if (razorpayKeyId && razorpayKeySecret) {
                    const authHeader = 'Basic ' + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
                    const rzpPayload = {
                        amount: Math.round(finalAmount * 100), // Razorpay requires amount in paise (1 INR = 100 paise)
                        currency: 'INR',
                        receipt: `rcpt_${Date.now()}`,
                        notes: {
                            plan_name: plan_name || 'Inspenox Plan',
                            billing_cycle: billingCycle,
                            coupon_code: coupon_code || '',
                            user_email: email || '',
                            user_phone: phone || '',
                            company_id: company_id ? String(company_id) : ''
                        }
                    };

                    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
                        method: 'POST',
                        headers: {
                            'Authorization': authHeader,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(rzpPayload)
                    });

                    const rzpData = await rzpRes.json();
                    if (!rzpRes.ok) {
                        throw new Error(rzpData.error?.description || 'Failed to create order on Razorpay');
                    }

                    return res.status(200).json({
                        success: true,
                        order_id: rzpData.id,
                        amount: finalAmount,
                        currency: 'INR',
                        key_id: razorpayKeyId,
                        original_amount: numOriginal,
                        discount_amount: discountAmount,
                        billing_cycle: billingCycle,
                        coupon_code: coupon_code || null,
                        coupon_id: couponId,
                        influencer_id: influencerId,
                        commission_amount: commissionAmount,
                        is_live: true
                    });
                } else {
                    // Fallback sandbox/mock order ID if live credentials are not yet set
                    const mockOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                    return res.status(200).json({
                        success: true,
                        order_id: mockOrderId,
                        amount: finalAmount,
                        currency: 'INR',
                        key_id: 'rzp_test_placeholder',
                        original_amount: numOriginal,
                        discount_amount: discountAmount,
                        billing_cycle: billingCycle,
                        coupon_code: coupon_code || null,
                        coupon_id: couponId,
                        influencer_id: influencerId,
                        commission_amount: commissionAmount,
                        is_mock: true,
                        warning: 'Razorpay keys not yet configured. Simulated checkout order generated.'
                    });
                }
            }

            // 3. Verify Razorpay Payment Signature & Log Transaction
            if (action === 'verify-payment') {
                const {
                    razorpay_payment_id,
                    razorpay_order_id,
                    razorpay_signature,
                    plan_name,
                    billing_cycle,
                    original_amount,
                    discount_amount,
                    final_amount,
                    coupon_code,
                    coupon_id,
                    influencer_id,
                    commission_amount,
                    user_email,
                    user_phone,
                    company_id
                } = body;

                if (!razorpay_order_id) {
                    return res.status(400).json({ error: 'Razorpay Order ID is required' });
                }

                // If real keys are configured and this is not a mock order, verify HMAC SHA256 signature
                if (razorpayKeySecret && !String(razorpay_order_id).startsWith('order_mock_')) {
                    if (!razorpay_payment_id || !razorpay_signature) {
                        return res.status(400).json({ error: 'Payment ID and Signature are required for verification.' });
                    }

                    const expectedSignature = crypto
                        .createHmac('sha256', razorpayKeySecret)
                        .update(razorpay_order_id + '|' + razorpay_payment_id)
                        .digest('hex');

                    if (expectedSignature !== razorpay_signature) {
                        return res.status(400).json({ error: 'Signature verification failed. Potential tampering detected.' });
                    }
                }

                const cycleVal = String(billing_cycle || 'monthly').toLowerCase();
                const numOrig = parseFloat(original_amount) || 0;
                const numDisc = parseFloat(discount_amount) || 0;
                const numFinal = parseFloat(final_amount) || Math.max(0, numOrig - numDisc);
                const numComm = parseFloat(commission_amount) || 0;
                const validCouponId = coupon_id ? parseInt(coupon_id) : null;
                const validInfluencerId = influencer_id ? parseInt(influencer_id) : null;
                const paymentIdVal = razorpay_payment_id || `pay_mock_${Date.now()}`;

                // Resolve company ID
                let targetCompanyId = (company_id && company_id !== 'default' && company_id !== 'null') ? parseInt(company_id) : null;
                if (!targetCompanyId) {
                    try {
                        const firstComp = await sql`SELECT id FROM companies ORDER BY id ASC LIMIT 1;`;
                        if (firstComp.length > 0) {
                            targetCompanyId = firstComp[0].id;
                        }
                    } catch(e) {}
                }

                // Compute exact subscription expiration date & validity
                let monthsToAdd = 1;
                if (cycleVal === '4_months' || cycleVal === '4months') {
                    monthsToAdd = 4;
                } else if (cycleVal === '6_months' || cycleVal === '6months') {
                    monthsToAdd = 6;
                } else if (cycleVal === 'annual' || cycleVal === '12_months' || cycleVal === 'year') {
                    monthsToAdd = 12;
                }

                let baseDate = new Date();
                if (targetCompanyId) {
                    try {
                        const compRows = await sql`SELECT subscription_expires_at FROM companies WHERE id = ${targetCompanyId} LIMIT 1;`;
                        if (compRows.length > 0 && compRows[0].subscription_expires_at) {
                            const currentExp = new Date(compRows[0].subscription_expires_at);
                            if (currentExp > baseDate) {
                                baseDate = currentExp; // Extend existing active duration
                            }
                        }
                    } catch(e) {}
                }

                const expiresAt = new Date(baseDate.getTime());
                if (monthsToAdd === 12) {
                    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                } else {
                    expiresAt.setMonth(expiresAt.getMonth() + monthsToAdd);
                }
                const expiresAtIso = expiresAt.toISOString();

                // Insert into payment_logs table with company_id, billing_cycle, and valid_until
                const logResult = await sql`
                    INSERT INTO payment_logs (
                        company_id, order_id, payment_id, user_email, user_phone, plan_name,
                        billing_cycle, valid_until,
                        original_amount, discount_amount, final_amount,
                        coupon_code, coupon_id, influencer_id, commission_amount,
                        status, created_at
                    ) VALUES (
                        ${targetCompanyId},
                        ${razorpay_order_id},
                        ${paymentIdVal},
                        ${user_email || null},
                        ${user_phone || null},
                        ${plan_name || 'Inspenox Business Plan'},
                        ${cycleVal},
                        ${expiresAtIso},
                        ${numOrig},
                        ${numDisc},
                        ${numFinal},
                        ${coupon_code || null},
                        ${validCouponId},
                        ${validInfluencerId},
                        ${numComm},
                        'paid',
                        NOW()
                    )
                    RETURNING *;
                `;

                // If a coupon was used, increment used_count
                if (validCouponId) {
                    try {
                        await sql`
                            UPDATE coupons 
                            SET used_count = used_count + 1 
                            WHERE id = ${validCouponId};
                        `;
                    } catch (e) {
                        console.error('Error updating coupon used_count:', e);
                    }
                }

                // Update company subscription_plan, subscription_status, subscription_billing_cycle, and subscription_expires_at
                if (targetCompanyId) {
                    try {
                        await sql`
                            UPDATE companies 
                            SET subscription_plan = ${plan_name || 'Growth Pro'},
                                subscription_status = 'active',
                                subscription_billing_cycle = ${cycleVal},
                                subscription_expires_at = ${expiresAtIso}
                            WHERE id = ${targetCompanyId};
                        `;
                    } catch (e) {
                        console.error('Error updating company subscription status:', e);
                    }
                }

                // Send email receipt to user with plan details, pricing and validity
                let emailSent = false;
                if (user_email && user_email.includes('@')) {
                    try {
                        const emailRes = await sendSubscriptionReceiptEmail({
                            to: user_email,
                            phone: user_phone,
                            plan_name: plan_name || 'Inspenox Business Plan',
                            billing_cycle: cycleVal,
                            valid_until: expiresAtIso,
                            original_amount: numOrig,
                            discount_amount: numDisc,
                            final_amount: numFinal,
                            coupon_code,
                            order_id: razorpay_order_id,
                            payment_id: paymentIdVal,
                            env
                        });
                        emailSent = !!emailRes.success;
                    } catch (e) {
                        console.error('Error sending subscription receipt email:', e);
                    }
                }

                return res.status(200).json({
                    success: true,
                    message: 'Payment verified and subscription activated successfully!',
                    payment: logResult[0],
                    subscription_expires_at: expiresAtIso,
                    subscription_billing_cycle: cycleVal,
                    valid_until: expiresAtIso,
                    email_sent: emailSent
                });
            }

            // 4. Create New Coupon Code
            if (action === 'create-coupon') {
                const { coupon_code, user_id, discount_percent, commission_percent, usage_limit, expiry_date } = body;
                if (!coupon_code || !String(coupon_code).trim()) {
                    return res.status(400).json({ error: 'Coupon code is required' });
                }

                const cleanCode = String(coupon_code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                const userIdVal = user_id && String(user_id) !== '' && String(user_id) !== 'null' ? parseInt(user_id) : null;
                const discPct = Math.max(0, Math.min(100, parseFloat(discount_percent) || 0));
                const commPct = Math.max(0, Math.min(100, parseFloat(commission_percent) || 0));
                const limitVal = usage_limit && parseInt(usage_limit) > 0 ? parseInt(usage_limit) : null;
                const expiryVal = expiry_date ? new Date(expiry_date) : null;

                const newCoupon = await sql`
                    INSERT INTO coupons (
                        coupon_code, user_id, discount_percent, commission_percent,
                        usage_limit, used_count, expiry_date, is_active, created_at
                    ) VALUES (
                        ${cleanCode},
                        ${userIdVal},
                        ${discPct},
                        ${commPct},
                        ${limitVal},
                        0,
                        ${expiryVal},
                        TRUE,
                        NOW()
                    )
                    RETURNING *;
                `;

                return res.status(200).json({
                    success: true,
                    message: `Coupon "${cleanCode}" created successfully!`,
                    coupon: newCoupon[0]
                });
            }

            // 5. Toggle Coupon Active Status
            if (action === 'toggle-coupon') {
                const { id, is_active } = body;
                if (!id) return res.status(400).json({ error: 'Coupon ID is required' });

                const updated = await sql`
                    UPDATE coupons 
                    SET is_active = ${!!is_active} 
                    WHERE id = ${parseInt(id)}
                    RETURNING *;
                `;

                if (updated.length === 0) return res.status(404).json({ error: 'Coupon not found' });

                return res.status(200).json({
                    success: true,
                    coupon: updated[0]
                });
            }

            return res.status(400).json({ error: `Unknown POST action "${action}"` });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
