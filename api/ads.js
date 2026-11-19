const { getDb } = require('../lib/db');

function formatIndiaPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return '91' + digits;
    if (digits.length > 10) return '91' + digits.slice(-10);
    return digits;
}

async function ensureAdsTables(sql) {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS meta_ads (
                id SERIAL PRIMARY KEY,
                company_id INT,
                meta_ad_id TEXT UNIQUE,
                meta_campaign_id TEXT,
                meta_adset_id TEXT,
                meta_creative_id TEXT,
                name TEXT NOT NULL,
                ad_account_id TEXT NOT NULL,
                page_id TEXT NOT NULL,
                instagram_actor_id TEXT,
                destination_type TEXT DEFAULT 'WHATSAPP',
                whatsapp_phone_number_id TEXT,
                whatsapp_phone_number TEXT,
                lead_form_id TEXT,
                website_url TEXT,
                headline TEXT,
                primary_text TEXT,
                icebreaker_message TEXT,
                media_url TEXT,
                media_type TEXT DEFAULT 'image',
                daily_budget NUMERIC DEFAULT 0,
                currency TEXT DEFAULT 'INR',
                placements JSONB DEFAULT '["facebook_feed", "instagram_feed"]',
                targeting JSONB DEFAULT '{}',
                status TEXT DEFAULT 'ACTIVE',
                spend NUMERIC DEFAULT 0,
                clicks INT DEFAULT 0,
                impressions INT DEFAULT 0,
                inbound_leads_count INT DEFAULT 0,
                sales_converted_count INT DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `;
        await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta_ad_id TEXT;`;
        await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta_referral JSONB;`;
        await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_ad_id TEXT;`;
    } catch(e) {
        console.warn('ensureAdsTables error in ads.js:', e.message);
    }
}

module.exports = async (req, res) => {
    const env = req.env || process.env || {};
    const sql = getDb(env);
    await ensureAdsTables(sql);

    const query = req.query || {};
    const body = req.body || {};

    // Resolve company tenancy
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
    } catch(e) {
        console.warn('Company fetch error in ads.js:', e.message);
    }

    // Resolve Meta credentials
    let phoneId = isMaster ? (env.WHATSAPP_PHONE_NUMBER_ID || '1154537094401525') : (company ? company.whatsapp_phone_number_id : null);
    let token = isMaster ? env.WHATSAPP_ACCESS_TOKEN : (company ? company.whatsapp_access_token : env.WHATSAPP_ACCESS_TOKEN);
    let wabaId = isMaster ? (env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1931240894174615') : (company ? company.whatsapp_business_account_id : null);

    const action = query.action || body.action || 'list';

    // =========================================================================
    // 1. GET ASSETS: Ad Accounts, Pages, Pre-verified WABAs, Payment Status
    // =========================================================================
    if (req.method === 'GET' && action === 'assets') {
        try {
            // A. Collect registered pre-verified WABA phone numbers
            const wabaNumbers = [];
            if (phoneId) {
                wabaNumbers.push({
                    phone_number_id: String(phoneId),
                    display_phone_number: company ? (company.phone || '+91 Registered WABA') : '+91 95532 62002',
                    verified_name: company ? company.name : 'Inspenox Business',
                    is_preverified: true
                });
            }

            // Check if company has additional numbers in whatsapp_phone_numbers JSON
            if (company && company.whatsapp_phone_numbers) {
                try {
                    const extra = typeof company.whatsapp_phone_numbers === 'string'
                        ? JSON.parse(company.whatsapp_phone_numbers)
                        : company.whatsapp_phone_numbers;
                    if (Array.isArray(extra)) {
                        extra.forEach(num => {
                            if (num && num.id && !wabaNumbers.some(w => String(w.phone_number_id) === String(num.id))) {
                                wabaNumbers.push({
                                    phone_number_id: String(num.id),
                                    display_phone_number: num.display_phone_number || num.phone || String(num.id),
                                    verified_name: num.verified_name || (company ? company.name : 'Business Account'),
                                    is_preverified: true
                                });
                            }
                        });
                    }
                } catch(e) {}
            }

            // B. Meta Ad Accounts & Pages Discovery via Meta Graph API
            let adAccounts = [];
            let pages = [];
            let hasPaymentMethod = false;
            let metaError = null;

            if (token) {
                try {
                    // Fetch Ad Accounts
                    const adAccRes = await fetch(`https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,account_status,currency,funding_source_details,balance,amount_spent&access_token=${encodeURIComponent(token)}`);
                    const adAccData = await adAccRes.json();
                    if (adAccData && adAccData.data && Array.isArray(adAccData.data)) {
                        adAccounts = adAccData.data.map(acc => {
                            const hasFunding = !!(acc.funding_source_details && Object.keys(acc.funding_source_details).length > 0);
                            const isActive = (acc.account_status === 1);
                            if (hasFunding || isActive) hasPaymentMethod = true;
                            return {
                                id: acc.id,
                                name: acc.name || `Ad Account (${acc.id})`,
                                currency: acc.currency || 'INR',
                                account_status: acc.account_status,
                                has_payment_method: hasFunding || isActive,
                                amount_spent: acc.amount_spent ? (acc.amount_spent / 100) : 0
                            };
                        });
                    } else if (adAccData.error) {
                        metaError = adAccData.error.message;
                    }

                    // Fetch Facebook Pages
                    const pageRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,category,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
                    const pageData = await pageRes.json();
                    if (pageData && pageData.data && Array.isArray(pageData.data)) {
                        pages = pageData.data.map(p => ({
                            id: p.id,
                            name: p.name,
                            category: p.category,
                            instagram_actor_id: p.instagram_business_account ? p.instagram_business_account.id : null,
                            instagram_username: p.instagram_business_account ? p.instagram_business_account.username : null
                        }));
                    }
                } catch(err) {
                    console.warn('Meta Graph assets discovery error:', err.message);
                    metaError = err.message;
                }
            }

            // Fallback default assets if user hasn't linked ad accounts to their token yet
            if (adAccounts.length === 0) {
                adAccounts.push({
                    id: company && company.meta_ad_account_id ? company.meta_ad_account_id : 'act_default',
                    name: company ? `${company.name} Ad Account` : 'Primary Meta Ad Account',
                    currency: 'INR',
                    account_status: 1,
                    has_payment_method: true,
                    amount_spent: 0
                });
            }

            if (pages.length === 0) {
                pages.push({
                    id: company && company.meta_page_id ? company.meta_page_id : 'page_default',
                    name: company ? `${company.name} Official Page` : 'Official Business Page',
                    category: 'Brand / Business',
                    instagram_actor_id: null,
                    instagram_username: company ? company.name.toLowerCase().replace(/\s+/g, '_') : 'business_page'
                });
            }

            return res.status(200).json({
                success: true,
                waba_numbers: wabaNumbers,
                ad_accounts: adAccounts,
                pages: pages,
                has_payment_method: hasPaymentMethod || true,
                has_meta_token: !!token,
                meta_error: metaError
            });
        } catch(err) {
            console.error('Error fetching ad assets:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 2. GET LIST: Ads Dashboard & Conversion Performance
    // =========================================================================
    if (req.method === 'GET' && action === 'list') {
        try {
            const ads = await sql`
                SELECT 
                    a.*,
                    COALESCE(
                        (SELECT COUNT(*) FROM customers c WHERE c.source_ad_id = a.meta_ad_id AND c.company_id = a.company_id),
                        a.inbound_leads_count,
                        0
                    ) AS total_inbound_leads,
                    COALESCE(
                        (SELECT COUNT(*) FROM customers c WHERE c.source_ad_id = a.meta_ad_id AND c.company_id = a.company_id AND c.status = 'Converted'),
                        a.sales_converted_count,
                        0
                    ) AS total_sales_converted,
                    COALESCE(
                        (SELECT SUM(deal_value) FROM customers c WHERE c.source_ad_id = a.meta_ad_id AND c.company_id = a.company_id AND c.status = 'Converted'),
                        0
                    ) AS total_revenue
                FROM meta_ads a
                WHERE a.company_id = ${companyId}
                ORDER BY a.created_at DESC
            `;

            // Calculate overall workspace totals
            let totalSpend = 0;
            let totalClicks = 0;
            let totalImpressions = 0;
            let totalLeads = 0;
            let totalConverted = 0;
            let totalRevenue = 0;

            const enrichedAds = ads.map(ad => {
                const spend = parseFloat(ad.spend || 0);
                const clicks = parseInt(ad.clicks || 0, 10);
                const impressions = parseInt(ad.impressions || 0, 10);
                const leads = parseInt(ad.total_inbound_leads || 0, 10);
                const converted = parseInt(ad.total_sales_converted || 0, 10);
                const revenue = parseFloat(ad.total_revenue || 0);

                totalSpend += spend;
                totalClicks += clicks;
                totalImpressions += impressions;
                totalLeads += leads;
                totalConverted += converted;
                totalRevenue += revenue;

                const cpc = clicks > 0 ? (spend / clicks).toFixed(2) : 0;
                const cpl = leads > 0 ? (spend / leads).toFixed(2) : 0;
                const conversionRate = leads > 0 ? ((converted / leads) * 100).toFixed(1) : 0;
                const roas = spend > 0 ? (revenue / spend).toFixed(1) : (revenue > 0 ? '10.0' : '0.0');

                return {
                    ...ad,
                    spend,
                    clicks,
                    impressions,
                    inbound_leads_count: leads,
                    sales_converted_count: converted,
                    total_revenue: revenue,
                    cpc,
                    cpl,
                    conversion_rate: conversionRate,
                    roas
                };
            });

            const overallRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : (totalRevenue > 0 ? '10.0' : '0.0');
            const overallConversionRate = totalLeads > 0 ? ((totalConverted / totalLeads) * 100).toFixed(1) : '0.0';

            return res.status(200).json({
                success: true,
                ads: enrichedAds,
                summary: {
                    total_spend: totalSpend,
                    total_clicks: totalClicks,
                    total_impressions: totalImpressions,
                    total_inbound_leads: totalLeads,
                    total_sales_converted: totalConverted,
                    total_revenue: totalRevenue,
                    overall_conversion_rate: overallConversionRate,
                    overall_roas: overallRoas
                }
            });
        } catch(err) {
            console.error('Error listing ads:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 3. POST CREATE: Publish New Meta Ad Campaign
    // =========================================================================
    if (req.method === 'POST' && (action === 'create' || !req.body.action)) {
        try {
            const {
                name,
                ad_account_id,
                page_id,
                instagram_actor_id,
                destination_type = 'WHATSAPP',
                whatsapp_phone_number,
                whatsapp_phone_number_id,
                lead_form_id,
                website_url,
                headline,
                primary_text,
                icebreaker_message,
                media_url,
                media_type = 'image',
                daily_budget = 500,
                currency = 'INR',
                placements = ['facebook_feed', 'instagram_feed'],
                targeting = {}
            } = req.body;

            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'Campaign / Ad name is required.' });
            }

            const cleanPhone = formatIndiaPhone(whatsapp_phone_number || (company ? company.phone : '919553262002'));
            const cleanPhoneId = whatsapp_phone_number_id || phoneId || '1154537094401525';
            const cleanAdAcc = (ad_account_id || 'act_default').replace(/^act_/, 'act_');
            const cleanPageId = page_id || 'page_default';

            let metaAdId = `meta_ad_${Date.now()}`;
            let metaCampaignId = `meta_cmp_${Date.now()}`;
            let metaAdsetId = `meta_adset_${Date.now()}`;
            let metaCreativeId = `meta_cr_${Date.now()}`;
            let metaLiveCreated = false;
            let metaApiError = null;

            // Attempt Live Meta Graph API Publication if valid token & real ad account provided
            if (token && cleanAdAcc !== 'act_default' && cleanAdAcc.startsWith('act_')) {
                try {
                    // 1. Create Campaign
                    const cmpRes = await fetch(`https://graph.facebook.com/v20.0/${cleanAdAcc}/campaigns`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: name.trim(),
                            objective: 'OUTCOME_ENGAGEMENT',
                            status: 'ACTIVE',
                            special_ad_categories: ['NONE'],
                            access_token: token
                        })
                    });
                    const cmpJson = await cmpRes.json();
                    if (cmpJson && cmpJson.id) {
                        metaCampaignId = cmpJson.id;

                        // 2. Create Ad Set with Destination
                        const budgetCents = Math.round(parseFloat(daily_budget) * 100);
                        const adsetPayload = {
                            name: `${name.trim()} - Ad Set`,
                            campaign_id: metaCampaignId,
                            optimization_goal: 'CONVERSATIONS',
                            destination_type: (destination_type === 'WHATSAPP') ? 'WHATSAPP' : (destination_type === 'INSTAGRAM_DIRECT' ? 'INSTAGRAM_DIRECT' : 'MESSENGER'),
                            billing_event: 'IMPRESSIONS',
                            daily_budget: budgetCents > 10000 ? budgetCents : 50000,
                            promoted_object: { page_id: cleanPageId },
                            status: 'ACTIVE',
                            targeting: {
                                geo_locations: { countries: ['IN'] },
                                age_min: targeting.age_min || 18,
                                age_max: targeting.age_max || 65
                            },
                            access_token: token
                        };

                        const adsetRes = await fetch(`https://graph.facebook.com/v20.0/${cleanAdAcc}/adsets`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(adsetPayload)
                        });
                        const adsetJson = await adsetRes.json();
                        if (adsetJson && adsetJson.id) {
                            metaAdsetId = adsetJson.id;

                            // 3. Create Ad Creative with WhatsApp deep-link
                            const prefillMsg = icebreaker_message || `Hi, I saw your ad on Facebook/Instagram and want to know more about ${name.trim()}.`;
                            const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(prefillMsg)}`;

                            const creativePayload = {
                                name: `${name.trim()} - Creative`,
                                object_story_spec: {
                                    page_id: cleanPageId,
                                    instagram_actor_id: instagram_actor_id || undefined,
                                    link_data: {
                                        message: primary_text || `Special Offer from ${company ? company.name : 'Inspenox'}! Connect with us on WhatsApp.`,
                                        link: (destination_type === 'WHATSAPP') ? waUrl : (website_url || 'https://inspenox.in'),
                                        name: headline || 'Chat with us on WhatsApp',
                                        call_to_action: {
                                            type: (destination_type === 'WHATSAPP') ? 'SEND_WHATSAPP_MESSAGE' : 'LEARN_MORE',
                                            value: { link: (destination_type === 'WHATSAPP') ? waUrl : (website_url || 'https://inspenox.in') }
                                        }
                                    }
                                },
                                access_token: token
                            };

                            const crRes = await fetch(`https://graph.facebook.com/v20.0/${cleanAdAcc}/adcreatives`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(creativePayload)
                            });
                            const crJson = await crRes.json();
                            if (crJson && crJson.id) {
                                metaCreativeId = crJson.id;

                                // 4. Create Final Ad
                                const adRes = await fetch(`https://graph.facebook.com/v20.0/${cleanAdAcc}/ads`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        name: name.trim(),
                                        adset_id: metaAdsetId,
                                        creative: { creative_id: metaCreativeId },
                                        status: 'ACTIVE',
                                        access_token: token
                                    })
                                });
                                const adJson = await adRes.json();
                                if (adJson && adJson.id) {
                                    metaAdId = adJson.id;
                                    metaLiveCreated = true;
                                } else {
                                    metaApiError = adJson.error ? adJson.error.message : 'Error creating final ad';
                                }
                            } else {
                                metaApiError = crJson.error ? crJson.error.message : 'Error creating creative';
                            }
                        } else {
                            metaApiError = adsetJson.error ? adsetJson.error.message : 'Error creating ad set';
                        }
                    } else {
                        metaApiError = cmpJson.error ? cmpJson.error.message : 'Error creating campaign';
                    }
                } catch(apiErr) {
                    console.warn('Meta API execution error:', apiErr.message);
                    metaApiError = apiErr.message;
                }
            }

            // Save ad campaign in our local database
            const inserted = await sql`
                INSERT INTO meta_ads (
                    company_id,
                    meta_ad_id,
                    meta_campaign_id,
                    meta_adset_id,
                    meta_creative_id,
                    name,
                    ad_account_id,
                    page_id,
                    instagram_actor_id,
                    destination_type,
                    whatsapp_phone_number_id,
                    whatsapp_phone_number,
                    lead_form_id,
                    website_url,
                    headline,
                    primary_text,
                    icebreaker_message,
                    media_url,
                    media_type,
                    daily_budget,
                    currency,
                    placements,
                    targeting,
                    status
                ) VALUES (
                    ${companyId},
                    ${metaAdId},
                    ${metaCampaignId},
                    ${metaAdsetId},
                    ${metaCreativeId},
                    ${name.trim()},
                    ${cleanAdAcc},
                    ${cleanPageId},
                    ${instagram_actor_id || null},
                    ${destination_type},
                    ${cleanPhoneId},
                    ${cleanPhone},
                    ${lead_form_id || null},
                    ${website_url || null},
                    ${headline || 'Chat with us on WhatsApp'},
                    ${primary_text || ''},
                    ${icebreaker_message || ''},
                    ${media_url || null},
                    ${media_type},
                    ${parseFloat(daily_budget) || 500},
                    ${currency || 'INR'},
                    ${JSON.stringify(placements)}::jsonb,
                    ${JSON.stringify(targeting)}::jsonb,
                    'ACTIVE'
                )
                RETURNING *
            `;

            return res.status(200).json({
                success: true,
                ad: inserted[0],
                meta_live_published: metaLiveCreated,
                meta_ad_id: metaAdId,
                meta_error: metaApiError
            });
        } catch(err) {
            console.error('Error creating ad:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 4. POST TOGGLE: Pause or Resume Ad
    // =========================================================================
    if (req.method === 'POST' && action === 'toggle') {
        try {
            const { id, status } = req.body;
            if (!id || !status) return res.status(400).json({ error: 'id and status required' });

            const newStatus = (status === 'ACTIVE') ? 'ACTIVE' : 'PAUSED';

            const updated = await sql`
                UPDATE meta_ads 
                SET status = ${newStatus}, updated_at = NOW() 
                WHERE id = ${id} AND company_id = ${companyId}
                RETURNING *
            `;

            // If ad is live on Meta and has valid token, sync status to Meta
            if (updated.length > 0 && token && updated[0].meta_ad_id && !updated[0].meta_ad_id.startsWith('meta_ad_')) {
                try {
                    await fetch(`https://graph.facebook.com/v20.0/${updated[0].meta_ad_id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus, access_token: token })
                    });
                } catch(e) {}
            }

            return res.status(200).json({ success: true, ad: updated[0] });
        } catch(err) {
            console.error('Error toggling ad:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // =========================================================================
    // 5. POST DELETE: Archive / Remove Ad
    // =========================================================================
    if (req.method === 'POST' && action === 'delete') {
        try {
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: 'id is required' });

            await sql`
                DELETE FROM meta_ads 
                WHERE id = ${id} AND company_id = ${companyId}
            `;

            return res.status(200).json({ success: true });
        } catch(err) {
            console.error('Error deleting ad:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
};
