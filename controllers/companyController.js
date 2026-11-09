/**
 * ==========================================================================
 * COMPANYCONTROLLER.JS - Multi-Tenant Company Controller (Workspaces, Meta Credentials & Superadmin)
 * ==========================================================================
 * Manages multi-tenant organization state, API request signing with X-Company-ID headers (apiFetch), workspace switching, parent/child company isolation, superadmin permissions, company profile & Meta credentials, phone number limit management, and Superadmin manual overrides modal.
 * 
 * Module Components:
 *  - Lines 317 to 2507 in original app.js (Multi-Tenant Company State, apiFetch, Permissions, Company CRUD, Phone Number Management & Superadmin Overrides)
 * ==========================================================================
 */

// --- Multi-Tenant Company State & API Fetch Wrapper ---
let currentCompanyId = localStorage.getItem('inspenox_company_id') || 'default';
let allCompanies = [];

function getCompanyId() {
    return currentCompanyId || 'default';
}
window.getCompanyId = getCompanyId;
window.getActiveCompanyId = getCompanyId;

function apiFetch(url, options = {}) {
    const opts = { ...options };
    opts.headers = { ...(opts.headers || {}) };

    if (typeof url === 'string' && url.startsWith('/api/')) {
        const companyId = getCompanyId();
        if (companyId) {
            opts.headers['X-Company-ID'] = companyId;
            if (!url.includes('company_id=') && !url.includes('all=true')) {
                const sep = url.includes('?') ? '&' : '?';
                url = `${url}${sep}company_id=${encodeURIComponent(companyId)}`;
            }
        }
    }
    return fetch(url, opts);
}

// --- Multi-Tenant Parent/Child Permissions & Company UI Management ---
window.getStoredCompany = function getStoredCompany() {
    try {
        const u = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}');
        const cId = localStorage.getItem('inspenox_company_id') || u.company_id;
        return { id: cId, name: u.company_name || u.username || 'Registered Account' };
    } catch (e) {
        return { id: null, name: 'Registered Account' };
    }
};

window.isSuperAdmin = function isSuperAdmin() {
    let user = {};
    try {
        user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}');
    } catch (e) { }

    const uname = (user.username || '').toLowerCase().trim();
    const role = (user.role || '').toLowerCase().trim();
    const cname = (user.company_name || '').toLowerCase().trim();
    const coId = user.company_id;

    // 1. Explicit superadmin role or master superadmin username is ALWAYS superadmin
    if (role === 'superadmin' || uname === 'superadmin' || uname === 'inspenox') {
        return true;
    }

    // Check if user's company is Inspenox by company list or name
    let isUserCompanyInspenox = false;
    if (cname && cname.includes('inspenox')) {
        isUserCompanyInspenox = true;
    } else if (coId && typeof allCompanies !== 'undefined' && Array.isArray(allCompanies)) {
        const comp = allCompanies.find(c => String(c.id) === String(coId));
        if (comp && ((comp.slug && comp.slug.toLowerCase() === 'inspenox') || (comp.name && comp.name.toLowerCase() === 'inspenox') || comp.is_parent || comp.is_master)) {
            isUserCompanyInspenox = true;
        }
    }

    // 2. Inspenox parent organization admin (NOT child companies like Manaswini, Kubera, etc.)
    if (isUserCompanyInspenox && (role === 'admin' || !role || uname === 'admin')) {
        return true;
    }

    // 3. Unassigned root admin with no company or default/parent company
    if (uname === 'admin' && (!coId || coId === 'default' || coId === 'parent' || isUserCompanyInspenox)) {
        return true;
    }

    // 4. Any tenant user belonging to child companies (Manaswini, Kubera, etc.) is strictly NOT superadmin
    return false;
};

window.updateSuperAdminNavVisibility = function updateSuperAdminNavVisibility() {
    const isSuper = isSuperAdmin();
    const secNav = document.getElementById('nav-item-security');
    const subNav = document.getElementById('nav-item-subscriptions');
    if (secNav) secNav.style.display = isSuper ? 'flex' : 'none';
    if (subNav) subNav.style.display = 'flex';
    if (typeof updateAutomationNavVisibility === 'function') updateAutomationNavVisibility();
};

window.isParentAdmin = function isParentAdmin() {
    let user = {};
    try {
        user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}');
    } catch (e) { }

    const uname = (user.username || '').toLowerCase().trim();
    const role = (user.role || '').toLowerCase().trim();
    const cname = (user.company_name || '').toLowerCase().trim();
    const coId = user.company_id;

    // 1. Explicit superadmin role or master username
    if (role === 'superadmin' || uname === 'superadmin' || uname === 'inspenox') {
        return true;
    }

    // Check if user's company is Inspenox
    let isUserCompanyInspenox = false;
    if (cname && cname.includes('inspenox')) {
        isUserCompanyInspenox = true;
    } else if (coId && typeof allCompanies !== 'undefined' && Array.isArray(allCompanies)) {
        const comp = allCompanies.find(c => String(c.id) === String(coId));
        if (comp && ((comp.slug && comp.slug.toLowerCase() === 'inspenox') || (comp.name && comp.name.toLowerCase() === 'inspenox') || comp.is_parent || comp.is_master)) {
            isUserCompanyInspenox = true;
        }
    }

    // 2. Parent organization Inspenox (by slug/name, NOT by ID!)
    if (isUserCompanyInspenox) {
        return true;
    }

    // 3. Unassigned root admin
    if (uname === 'admin' && (!coId || coId === 'default' || coId === 'parent')) {
        return true;
    }

    // Child companies (Manaswini, Kubera, etc.) are NOT parent admin
    return false;
};


function updateBrandingForActiveCompany() {
    const brandNameEl = document.getElementById('nav-active-company-name') || document.querySelector('.sidebar-header .logo-text');
    const poweredByBadgeEl = document.getElementById('nav-powered-by-badge');
    const footerStatusEl = document.getElementById('app-footer-system-status');
    const footerCreditsEl = document.getElementById('app-footer-brand-credits');

    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }

    // Find the current active company object from allCompanies
    const activeCo = (allCompanies || []).find(c => String(c.id) === String(currentCompanyId));

    // Determine whether this is the parent Inspenox company:
    // A company is the parent ONLY if:
    // - activeCo exists and has is_parent/is_master true, or slug/name is 'inspenox'
    // - OR no activeCo is found, currentCompanyId is 'default'/'parent'/empty, and user is NOT tied to a child company
    let isParentCo = false;
    if (activeCo) {
        const coNameLower = (activeCo.name || '').toLowerCase().trim();
        const coSlugLower = (activeCo.slug || '').toLowerCase().trim();
        isParentCo = (activeCo.is_parent === true || activeCo.is_master === true || coSlugLower === 'inspenox' || coNameLower === 'inspenox');
    } else {
        const userCoName = (user.company_name || '').toLowerCase().trim();
        const userCoId = user.company_id;
        const isChildUser = (userCoName && !userCoName.includes('inspenox') && !userCoName.includes('parent')) ||
            (userCoId !== undefined && userCoId !== null && String(userCoId) !== 'default' && String(userCoId) !== 'parent' && String(userCoId) !== 'null' && String(userCoId) !== '' && String(userCoId) !== '0');
        if (isChildUser) {
            isParentCo = false;
        } else {
            isParentCo = (!currentCompanyId || currentCompanyId === 'default' || currentCompanyId === 'parent');
        }
    }

    if (isParentCo) {
        if (brandNameEl) {
            brandNameEl.textContent = 'Inspenox';
            brandNameEl.title = 'Inspenox Business Suite';
        }
        if (poweredByBadgeEl) poweredByBadgeEl.style.display = 'none';
        if (footerStatusEl) footerStatusEl.textContent = 'Inspenox Business API';
        if (footerCreditsEl) footerCreditsEl.textContent = 'Inspenox Business Suite For Marketing Platform';

        document.querySelectorAll('.page-footer p').forEach(p => {
            p.textContent = 'Inspenox Business Suite For Marketing';
        });
    } else {
        const coName = (activeCo && activeCo.name) ? activeCo.name : (user.company_name || 'Workspace');
        if (brandNameEl) {
            brandNameEl.textContent = coName;
            brandNameEl.title = coName;
        }
        if (poweredByBadgeEl) {
            poweredByBadgeEl.style.display = 'flex';
        }
        if (footerStatusEl) {
            footerStatusEl.textContent = `${coName} API`;
        }
        if (footerCreditsEl) {
            footerCreditsEl.innerHTML = `${coName} Platform &bull; <span style="color: #10b981; font-weight: 700;">Powered by Inspenox</span>`;
        }

        document.querySelectorAll('.page-footer p').forEach(p => {
            p.innerHTML = `${coName} &bull; <span style="color: #10b981; font-weight: 600;">Powered by Inspenox</span>`;
        });
    }
}
window.updateBrandingForActiveCompany = updateBrandingForActiveCompany;

async function loadCompanies() {
    const isParent = isParentAdmin();
    const isSuper = isSuperAdmin();
    const switcherContainer = document.querySelector('.company-switcher-container');

    // Update branding immediately with cached state
    updateBrandingForActiveCompany();

    // Security strictly for Superadmin; Subscriptions enabled for all
    const secNav = document.getElementById('nav-item-security');
    if (secNav) {
        secNav.style.display = isSuper ? 'flex' : 'none';
    }
    const subNav = document.getElementById('nav-item-subscriptions');
    if (subNav) {
        subNav.style.display = 'flex';
    }

    // Dynamic sidebar nav label: "Settings" for Superadmin/Parent vs "Meta Credentials" for other companies
    const settingsNavSpan = document.querySelector('#sidebar-nav a[data-view="settings"] span');
    if (settingsNavSpan) {
        settingsNavSpan.textContent = (isParent || isSuper) ? 'Settings' : 'Meta Credentials';
    }

    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }

    // Child tenant employee restricted to their specific non-parent company
    const isChildTenant = !isParent && !isSuper;
    if (isChildTenant && user.company_id && String(user.company_id) !== 'default' && String(user.company_id) !== 'parent') {
        currentCompanyId = String(user.company_id);
        localStorage.setItem('inspenox_company_id', currentCompanyId);
        if (switcherContainer) switcherContainer.style.display = 'none';
    } else {
        // Superadmin and Inspenox Parent Admin MUST ALWAYS see the company switcher dropdown in sidebar!
        if (switcherContainer) switcherContainer.style.display = 'block';
    }

    try {
        const compUrl = (isParent || isSuper) ? '/api/companies?all=true' : '/api/companies';
        const res = await apiFetch(compUrl);
        const companies = await res.json();
        if (Array.isArray(companies)) {
            allCompanies = companies;

            // Re-evaluate role now that allCompanies is loaded
            const activeIsSuper = isSuperAdmin();
            const activeIsParent = isParentAdmin();
            if (!activeIsParent && !activeIsSuper) {
                if (switcherContainer) switcherContainer.style.display = 'none';
            } else {
                if (switcherContainer) switcherContainer.style.display = 'block';
            }

            const selectEl = document.getElementById('company-switcher');
            if (selectEl) {
                selectEl.innerHTML = '';
                // Sort so Inspenox parent is always top (strictly by slug / name 'inspenox', NOT by ID!)
                const sortedCos = [...companies].sort((a, b) => {
                    const aMaster = (a.slug && a.slug.toLowerCase() === 'inspenox') || (a.name && a.name.toLowerCase() === 'inspenox') || a.is_parent === true || a.is_master === true;
                    const bMaster = (b.slug && b.slug.toLowerCase() === 'inspenox') || (b.name && b.name.toLowerCase() === 'inspenox') || b.is_parent === true || b.is_master === true;
                    if (aMaster && !bMaster) return -1;
                    if (!aMaster && bMaster) return 1;
                    return a.id - b.id;
                });

                const inspenoxComp = sortedCos.find(c => (c.slug && c.slug.toLowerCase() === 'inspenox') || (c.name && c.name.toLowerCase() === 'inspenox') || c.is_parent === true || c.is_master === true);
                const hasInspenox = !!inspenoxComp;
                if (!hasInspenox && (activeIsParent || activeIsSuper)) {
                    const optDef = document.createElement('option');
                    optDef.value = 'default';
                    optDef.textContent = 'Inspenox (Parent)';
                    if (!currentCompanyId || currentCompanyId === 'default') optDef.selected = true;
                    selectEl.appendChild(optDef);
                }

                sortedCos.forEach(comp => {
                    const opt = document.createElement('option');
                    opt.value = comp.id;
                    const isMaster = (comp.slug && comp.slug.toLowerCase() === 'inspenox') || (comp.name && comp.name.toLowerCase() === 'inspenox') || comp.is_parent === true || comp.is_master === true;
                    opt.textContent = isMaster ? 'Inspenox (Parent)' : comp.name;
                    if (String(comp.id) === String(currentCompanyId) || (isMaster && (!currentCompanyId || currentCompanyId === 'default' || (inspenoxComp && String(currentCompanyId) === String(inspenoxComp.id))))) {
                        opt.selected = true;
                    }
                    selectEl.appendChild(opt);
                });
            }

            // Re-apply branding once companies are loaded
            updateBrandingForActiveCompany();

            if (typeof updateCompanySubscriptionStatusUI === 'function') {
                updateCompanySubscriptionStatusUI();
            }
            if (typeof updateAutomationNavVisibility === 'function') {
                updateAutomationNavVisibility();
            }
            if (localStorage.getItem('activeView') === 'subscriptions' || window.location.hash === '#subscriptions') {
                if (typeof renderPricingCards === 'function') {
                    renderPricingCards();
                }
            }

            if (typeof updateBroadcastSenderPhoneSelect === 'function') {
                updateBroadcastSenderPhoneSelect();
            }
        }
    } catch (e) {
        console.error('Error loading companies:', e);
    }
}

function showWorkspaceSwitchingOverlay(companyName) {
    const overlay = document.getElementById('workspace-switching-overlay');
    if (!overlay) return;
    const titleEl = document.getElementById('switching-overlay-title');
    const descEl = document.getElementById('switching-overlay-desc');
    const avatarEl = document.getElementById('switching-overlay-avatar');
    const name = companyName || 'Selected Organization';
    if (titleEl) titleEl.textContent = `Switching to ${name}...`;
    if (descEl) descEl.textContent = `Loading ${name}'s customer directory, message templates & analytics...`;
    if (avatarEl) avatarEl.textContent = name.trim().charAt(0).toUpperCase() || 'W';
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
    });
}
window.showWorkspaceSwitchingOverlay = showWorkspaceSwitchingOverlay;

function hideWorkspaceSwitchingOverlay() {
    const overlay = document.getElementById('workspace-switching-overlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }, 250);
}
window.hideWorkspaceSwitchingOverlay = hideWorkspaceSwitchingOverlay;

document.getElementById('company-switcher')?.addEventListener('change', (e) => {
    const newCompanyId = e.target.value;
    currentCompanyId = newCompanyId;
    localStorage.setItem('inspenox_company_id', currentCompanyId);

    // 1. Resolve company name and initial for switching animation
    const comp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(newCompanyId)) : null;
    const isMaster = !comp || comp.is_parent || comp.is_master || (comp.slug && comp.slug.toLowerCase() === 'inspenox');
    const targetCompName = isMaster ? 'Inspenox (Parent)' : (comp ? comp.name : 'Workspace');

    // 2. Trigger Workspace Switching Loading Animation
    showWorkspaceSwitchingOverlay(targetCompName);

    // 3. Clear in-memory caches to prevent any data leaking between companies
    templatesCache = [];
    cachedAutomationTemplates = [];
    allAutomationRules = [];
    allCustomers = [];
    inboxCustomersList = [];
    broadcastCustomersCache = [];
    if (typeof campaignsCache !== 'undefined') campaignsCache = [];
    if (typeof activeCustomer !== 'undefined') activeCustomer = null;
    if (typeof activeChatCustomer !== 'undefined') activeChatCustomer = null;
    if (typeof closeChat === 'function') closeChat();

    // 4. Update Branding, Subscriptions & Navigation Permissions
    updateBrandingForActiveCompany();

    const isSuper = isSuperAdmin();
    const secNav = document.getElementById('nav-item-security');
    const subNav = document.getElementById('nav-item-subscriptions');
    if (secNav) secNav.style.display = isSuper ? 'flex' : 'none';
    if (subNav) subNav.style.display = 'flex';
    if (typeof updateAutomationNavVisibility === 'function') updateAutomationNavVisibility();
    if (typeof updateCompanySubscriptionStatusUI === 'function') updateCompanySubscriptionStatusUI();

    if (typeof updateBroadcastSenderPhoneSelect === 'function') {
        updateBroadcastSenderPhoneSelect();
    }

    // 5. Invalidate and re-fetch Meta templates for the new company
    ensureTemplatesCacheLoaded(true);

    // 6. Reload current active view for the new company with fresh loading state
    const activeView = localStorage.getItem('activeView') || 'dashboard';
    switchView(activeView, false);

    // 7. Dismiss switching overlay smoothly after brief animation window
    setTimeout(() => {
        hideWorkspaceSwitchingOverlay();
    }, 450);
});

async function loadCompaniesSettings() {
    const tbody = document.getElementById('companies-table-body');
    if (!tbody) return;

    const isParent = isParentAdmin() || isSuperAdmin();

    // 1. Dynamic Titles for Master Superadmin vs Other Companies
    const panelTitle = document.getElementById('panel-companies-title');
    const panelDesc = document.getElementById('panel-companies-desc');
    const pageTitle = document.getElementById('settings-page-title');
    const pageSubtitle = document.getElementById('settings-page-subtitle');
    const settingsNavSpan = document.querySelector('#sidebar-nav a[data-view="settings"] span');

    if (isParent) {
        if (panelTitle) panelTitle.textContent = 'Multi-Tenant Companies & WhatsApp API Accounts';
        if (panelDesc) panelDesc.textContent = 'Each company has isolated customers, templates, broadcast logs, and custom Meta WhatsApp credentials.';
        if (pageTitle) pageTitle.textContent = 'Settings & Preferences';
        if (pageSubtitle) pageSubtitle.textContent = 'Manage multi-tenant companies, WhatsApp Cloud API credentials, and security settings.';
        if (settingsNavSpan) settingsNavSpan.textContent = 'Settings';
    } else {
        // Other companies see "Meta Credentials"
        if (panelTitle) panelTitle.textContent = '⚙️ Meta Credentials';
        if (panelDesc) panelDesc.textContent = 'Manage your official Meta WhatsApp Cloud API credentials, Phone ID, and Access Tokens.';
        if (pageTitle) pageTitle.textContent = '⚙️ Meta Credentials';
        if (pageSubtitle) pageSubtitle.textContent = 'Configure your official Meta WhatsApp Cloud API credentials and workspace settings.';
        if (settingsNavSpan) settingsNavSpan.textContent = 'Meta Credentials';
    }

    // Toggle System Environment credentials panel visibility (strictly for Master Superadmin)
    const envCard = document.getElementById('env-credentials-card');
    if (envCard) envCard.style.display = isParent ? 'block' : 'none';

    document.querySelectorAll('button[onclick="openCompanyModal()"]').forEach(btn => {
        btn.style.display = isParent ? 'inline-flex' : 'none';
    });

    tbody.innerHTML = `<tr><td colspan="8"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading credentials...</span></div></td></tr>`;
    try {
        let compUrl = '/api/companies?include_env=true';
        if (isParent) {
            compUrl += '&all=true&is_parent=true';
        } else if (currentCompanyId && currentCompanyId !== 'default') {
            compUrl += `&company_id=${currentCompanyId}`;
        }
        const res = await apiFetch(compUrl);
        const data = await res.json();

        const companies = Array.isArray(data) ? data : (data.companies || []);
        const systemEnv = data.system_env || {};
        systemEnvGlobals = systemEnv;

        // Update System Environment Credentials Panel (Superadmin only)
        if (isParent) {
            const elPhone = document.getElementById('env-stat-phone-id');
            const elWaba = document.getElementById('env-stat-waba-id');
            const elVerify = document.getElementById('env-stat-verify-token');
            const elToken = document.getElementById('env-stat-token-status');

            if (elPhone) elPhone.textContent = systemEnv.whatsapp_phone_number_id || 'Not Set';
            if (elWaba) elWaba.textContent = systemEnv.whatsapp_business_account_id || 'Not Set';
            if (elVerify) elVerify.textContent = systemEnv.whatsapp_verify_token || 'Not Set';
            if (elToken) {
                elToken.textContent = systemEnv.has_access_token ? 'Configured ✅' : 'Missing Token ⚠️';
                elToken.style.background = systemEnv.has_access_token ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                elToken.style.color = systemEnv.has_access_token ? '#10b981' : '#ef4444';
            }
        }

        if (Array.isArray(companies)) {
            allCompanies = companies;
            if (companies.length === 0) {
                tbody.innerHTML = renderTableEmptyStateHtml(8, 'No company records found', 'Click "+ Add Company" above to register an organization workspace.', '🏢');
                return;
            }
            tbody.innerHTML = '';
            companies.forEach((c, idx) => {
                const tr = document.createElement('tr');
                const isInspenox = (c.slug && c.slug.toLowerCase() === 'inspenox') || (c.name && c.name.toLowerCase() === 'inspenox');
                const isPlanActive = c.subscription_status === 'active' && c.subscription_plan && c.subscription_plan.toLowerCase() !== 'none';

                let actionHtml = '';
                if (isParent) {
                    actionHtml = `<button class="btn secondary sm" onclick="editCompany('${c.id}')">Edit</button>`;
                    if (!isInspenox) {
                        actionHtml += ` <button class="btn danger sm" onclick="deleteCompany('${c.id}')">Delete</button>`;
                    }
                } else {
                    if (isPlanActive) {
                        actionHtml = `<button class="btn secondary sm" onclick="editCompany('${c.id}')">⚙️ Configure Meta Credentials</button>`;
                    } else {
                        actionHtml = `<button class="btn primary sm" onclick="switchView('subscriptions')" style="gap:4px; font-size:0.75rem; background:linear-gradient(135deg, #00a884 0%, #3b82f6 100%); border:none; padding:0.45rem 0.85rem;">⚡ Subscribe to Unlock Meta API</button>`;
                    }
                }

                const contactHtml = `
                    <div style="font-size:0.8rem; line-height:1.35;">
                        ${c.email ? `<div style="color:var(--text-main); font-weight:500;">✉️ ${c.email}</div>` : '<div style="color:var(--text-muted); font-size:0.75rem;">✉️ No email</div>'}
                        ${c.phone ? `<div style="color:var(--text-muted); font-size:0.75rem; margin-top:2px;">📞 ${formatDisplayPhone(c.phone)}</div>` : ''}
                    </div>
                `;

                const planBadge = isPlanActive ? `
                    <span class="window-badge" style="background:rgba(0, 168, 132, 0.15); color:var(--primary); font-weight:700; font-size:0.75rem;">
                        ${c.subscription_plan}
                    </span>
                ` : `
                    <span class="window-badge" style="background:rgba(239, 68, 68, 0.12); color:#ef4444; font-weight:700; font-size:0.75rem;">
                        No Active Plan
                    </span>
                `;

                // Extract and format multiple phone numbers
                const phoneNumbers = Array.isArray(c.whatsapp_phone_numbers) && c.whatsapp_phone_numbers.length > 0
                    ? c.whatsapp_phone_numbers
                    : (c.whatsapp_phone_number_id ? [{
                        phone: c.phone || '',
                        phone_number_id: c.whatsapp_phone_number_id,
                        status: 'Registered',
                        is_default: true
                    }] : (isInspenox && systemEnv.whatsapp_phone_number_id ? [{
                        phone: c.phone || '+91 79816 56294',
                        phone_number_id: systemEnv.whatsapp_phone_number_id,
                        status: 'Registered',
                        is_default: true
                    }] : []));

                let phoneDisplay = '';
                let wabaDisplay = '';
                let verifyDisplay = '';

                if (isInspenox) {
                    if (phoneNumbers.length > 0) {
                        const prim = phoneNumbers.find(p => p.is_default) || phoneNumbers[0];
                        const extra = phoneNumbers.length - 1;
                        phoneDisplay = `
                            <div>
                                <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap;">
                                    <span style="font-weight:600; font-size:0.8rem; color:var(--text-main);">${prim.phone ? formatDisplayPhone(prim.phone) : 'Parent Line'}</span>
                                    <span style="font-size:0.68rem; padding:1px 6px; border-radius:999px; background:#e6f4ea; color:#137333; font-weight:600;">Registered</span>
                                    ${extra > 0 ? `<span style="font-size:0.68rem; padding:1px 6px; border-radius:999px; background:rgba(59,130,246,0.15); color:#3b82f6; font-weight:600;">+${extra} more</span>` : ''}
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                                    ID: <code style="color:var(--primary); font-size:0.75rem;">${prim.phone_number_id}</code>
                                </div>
                            </div>
                        `;
                    } else {
                        phoneDisplay = `<code style="font-size:0.8rem; color:var(--primary);">${systemEnv.whatsapp_phone_number_id || 'System Env'}</code>`;
                    }
                    wabaDisplay = `<code style="font-size:0.8rem; color:var(--text-muted);">${c.whatsapp_business_account_id || systemEnv.whatsapp_business_account_id || 'System Env'}</code>`;
                    verifyDisplay = `<code style="font-size:0.8rem; color:var(--text-muted);">${c.whatsapp_verify_token || systemEnv.whatsapp_verify_token || 'System Env'}</code>`;
                } else if (isPlanActive) {
                    if (phoneNumbers.length > 0) {
                        const prim = phoneNumbers.find(p => p.is_default) || phoneNumbers[0];
                        const extra = phoneNumbers.length - 1;
                        phoneDisplay = `
                            <div>
                                <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap;">
                                    <span style="font-weight:600; font-size:0.8rem; color:var(--text-main);">${prim.phone ? formatDisplayPhone(prim.phone) : 'Phone ID'}</span>
                                    <span style="font-size:0.68rem; padding:1px 6px; border-radius:999px; background:#e6f4ea; color:#137333; font-weight:600;">Registered</span>
                                    ${extra > 0 ? `<span style="font-size:0.68rem; padding:1px 6px; border-radius:999px; background:rgba(59,130,246,0.15); color:#3b82f6; font-weight:600;">+${extra} more</span>` : ''}
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                                    ID: <code style="color:var(--primary); font-size:0.75rem;">${prim.phone_number_id}</code>
                                </div>
                            </div>
                        `;
                    } else {
                        phoneDisplay = `<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">Not Configured</span>`;
                    }
                    wabaDisplay = c.whatsapp_business_account_id
                        ? `<code style="font-size:0.8rem; color:var(--text-main);">${c.whatsapp_business_account_id}</code>`
                        : `<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">Not Configured</span>`;
                    verifyDisplay = c.whatsapp_verify_token
                        ? `<code style="font-size:0.8rem; color:var(--text-muted);">${c.whatsapp_verify_token}</code>`
                        : `<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">Not Configured</span>`;
                } else {
                    // Not paid: strictly locked!
                    phoneDisplay = `<span style="font-size:0.725rem; color:#ef4444; font-weight:600;">🔒 Locked (Unsubscribed)</span>`;
                    wabaDisplay = `<span style="font-size:0.725rem; color:#ef4444; font-weight:600;">🔒 Locked (Unsubscribed)</span>`;
                    verifyDisplay = `<span style="font-size:0.725rem; color:#ef4444; font-weight:600;">🔒 Locked</span>`;
                }

                tr.innerHTML = `
                    <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                    <td>
                        <strong style="color:var(--text-main);">${c.name}</strong>
                        ${isInspenox ? ' <span class="window-badge" style="background:rgba(168, 85, 247, 0.15);color:#a855f7;">Parent</span>' : ' <span class="window-badge" style="background:rgba(255,255,255,0.08);color:var(--text-muted);">Child Company</span>'}
                    </td>
                    <td>${contactHtml}</td>
                    <td>${planBadge}</td>
                    <td>${phoneDisplay}</td>
                    <td>${wabaDisplay}</td>
                    <td>${verifyDisplay}</td>
                    <td style="text-align: right;">${actionHtml}</td>
                `;
                tbody.appendChild(tr);
            });
        }
        loadUsersList();
    } catch (e) {
        tbody.innerHTML = renderTableEmptyStateHtml(8, 'Failed to load companies settings', 'Please check your connection and retry.', '⚠️');
    }
}

let systemEnvGlobals = {};
let currentModalPhoneNumbers = [];
let currentModalPhoneLimit = 1;

function getCompanyPhoneLimit(planName, isMaster) {
    if (isMaster) return 20;
    if (!planName) return 0;
    const lower = String(planName).toLowerCase().trim();
    if (lower.includes('enterprise')) return 20;
    if (lower.includes('growth')) return 3;
    if (lower.includes('starter')) return 1;
    return 1;
}

window.toggleAddPhoneForm = function toggleAddPhoneForm(show) {
    const form = document.getElementById('comp-add-phone-form');
    const btn = document.getElementById('btn-show-add-phone');
    if (!form) return;
    if (show) {
        if (currentModalPhoneNumbers.length >= currentModalPhoneLimit) {
            showModal('Plan Limit Reached', `Your subscription plan allows a maximum of ${currentModalPhoneLimit} connected phone number(s). Upgrade to Enterprise Elite for up to 20 numbers.`);
            return;
        }
        form.style.display = 'block';
        if (btn) btn.style.display = 'none';
        setTimeout(() => document.getElementById('comp-new-phone-num')?.focus(), 50);
    } else {
        form.style.display = 'none';
        if (btn) btn.style.display = (currentModalPhoneLimit > 0 && currentModalPhoneNumbers.length < currentModalPhoneLimit) ? 'inline-flex' : 'none';
        const numInput = document.getElementById('comp-new-phone-num');
        const idInput = document.getElementById('comp-new-phone-id');
        const nameInput = document.getElementById('comp-new-phone-name');
        if (numInput) numInput.value = '';
        if (idInput) idInput.value = '';
        if (nameInput) nameInput.value = '';
    }
};

window.saveNewPhoneToCompanyList = function saveNewPhoneToCompanyList() {
    const numInput = document.getElementById('comp-new-phone-num');
    const idInput = document.getElementById('comp-new-phone-id');
    const nameInput = document.getElementById('comp-new-phone-name');

    const rawPhone = (numInput?.value || '').trim();
    const phoneId = (idInput?.value || '').trim();
    const verifiedName = (nameInput?.value || '').trim();

    if (!phoneId) {
        showModal('Validation Error', 'Meta Phone Number ID is required.');
        return;
    }

    if (currentModalPhoneLimit === 0) {
        showModal('Subscription Required', 'You must subscribe to an active plan to connect Meta WhatsApp phone numbers.');
        return;
    }

    if (currentModalPhoneNumbers.length >= currentModalPhoneLimit) {
        showModal('Plan Limit Reached', `Your subscription plan allows a maximum of ${currentModalPhoneLimit} phone numbers. Please upgrade your plan in Subscriptions & Billing to add more.`);
        return;
    }

    if (currentModalPhoneNumbers.some(p => p.phone_number_id === phoneId)) {
        showModal('Duplicate ID', 'This Phone Number ID is already added to this company.');
        return;
    }

    const formatted = rawPhone ? formatDisplayPhone(rawPhone) : '';

    currentModalPhoneNumbers.push({
        phone: formatted || rawPhone,
        phone_number_id: phoneId,
        verified_name: verifiedName,
        status: 'Registered',
        is_default: currentModalPhoneNumbers.length === 0
    });

    toggleAddPhoneForm(false);
    renderModalPhoneNumbersList();
};

window.setDefaultModalPhoneNumber = function setDefaultModalPhoneNumber(phoneId) {
    currentModalPhoneNumbers.forEach(p => {
        p.is_default = (p.phone_number_id === phoneId);
    });
    renderModalPhoneNumbersList();
};

window.removeModalPhoneNumber = function removeModalPhoneNumber(phoneId) {
    currentModalPhoneNumbers = currentModalPhoneNumbers.filter(p => p.phone_number_id !== phoneId);
    if (currentModalPhoneNumbers.length > 0 && !currentModalPhoneNumbers.some(p => p.is_default)) {
        currentModalPhoneNumbers[0].is_default = true;
    }
    renderModalPhoneNumbersList();
};

function renderModalPhoneNumbersList() {
    const container = document.getElementById('comp-phone-numbers-list');
    const badge = document.getElementById('comp-phone-quota-badge');
    const planNote = document.getElementById('comp-phone-plan-note');
    const addBtn = document.getElementById('btn-show-add-phone');
    const hiddenPhoneId = document.getElementById('comp-phone-id');

    if (!container) return;

    // Update quota badge
    if (badge) {
        badge.textContent = `${currentModalPhoneNumbers.length} of ${currentModalPhoneLimit} Number${currentModalPhoneLimit === 1 ? '' : 's'}`;
        badge.style.background = (currentModalPhoneLimit > 0 && currentModalPhoneNumbers.length >= currentModalPhoneLimit)
            ? 'rgba(239, 68, 68, 0.15)'
            : 'rgba(0, 168, 132, 0.15)';
        badge.style.color = (currentModalPhoneLimit > 0 && currentModalPhoneNumbers.length >= currentModalPhoneLimit)
            ? '#ef4444'
            : 'var(--primary)';
    }

    // Update plan limit note text
    if (planNote) {
        if (currentModalPhoneLimit === 0) {
            planNote.innerHTML = `🔒 <em>Subscription required to connect Meta WhatsApp phone numbers.</em>`;
            planNote.style.color = '#ef4444';
        } else if (currentModalPhoneNumbers.length >= currentModalPhoneLimit) {
            planNote.innerHTML = `⚠️ <strong>Plan limit reached (${currentModalPhoneLimit}/${currentModalPhoneLimit}).</strong> Upgrade your subscription plan in Subscriptions & Billing to add more phone numbers.`;
            planNote.style.color = '#ef4444';
        } else {
            planNote.innerHTML = `You can add up to <strong>${currentModalPhoneLimit}</strong> phone number${currentModalPhoneLimit === 1 ? '' : 's'} per your plan. Once you upgrade your plan, you can add up to 20 numbers.`;
            planNote.style.color = 'var(--text-muted)';
        }
    }

    // Toggle add button visibility
    if (addBtn) {
        if (currentModalPhoneLimit === 0 || currentModalPhoneNumbers.length >= currentModalPhoneLimit) {
            addBtn.style.display = 'none';
        } else {
            addBtn.style.display = 'inline-flex';
        }
    }

    // Sync hidden phone id with default primary
    const def = currentModalPhoneNumbers.find(p => p.is_default) || currentModalPhoneNumbers[0];
    if (hiddenPhoneId) {
        hiddenPhoneId.value = def ? def.phone_number_id : '';
    }

    if (currentModalPhoneNumbers.length === 0) {
        container.innerHTML = `
            <div style="padding: 1rem; border-radius: 8px; background: var(--bg-dark); border: 1px dashed var(--border); text-align: center; color: var(--text-muted); font-size: 0.8rem;">
                No Meta WhatsApp phone numbers added yet. ${currentModalPhoneLimit > 0 ? 'Click <strong>Add new number</strong> below to register one.' : 'Subscribe to a plan to connect numbers.'}
            </div>
        `;
        return;
    }

    container.innerHTML = currentModalPhoneNumbers.map(item => `
        <div style="background: var(--bg-dark); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 0.95rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem; min-width: 0;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(0, 168, 132, 0.12); display: flex; align-items: center; justify-content: center; font-size: 1.05rem; flex-shrink: 0; color: #00a884;">
                    📞
                </div>
                <div style="min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                        <span style="font-weight: 700; font-size: 0.925rem; color: var(--text-main);">${item.phone ? formatDisplayPhone(item.phone) : 'WhatsApp Number'}</span>
                        <span style="font-size: 0.68rem; padding: 1px 7px; border-radius: 999px; background: #e6f4ea; color: #137333; font-weight: 600;">Registered</span>
                        ${item.is_default ? '<span style="font-size: 0.68rem; padding: 1px 7px; border-radius: 999px; background: rgba(59, 130, 246, 0.15); color: #3b82f6; font-weight: 600;">Primary</span>' : ''}
                    </div>
                    <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">
                        Phone Number ID: <code style="color: var(--primary); font-size: 0.76rem;">${item.phone_number_id}</code>
                        ${item.verified_name ? ` • <span style="color: var(--text-muted);">${item.verified_name}</span>` : ''}
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                ${!item.is_default ? `<button type="button" class="btn secondary sm" style="font-size: 0.7rem; padding: 0.25rem 0.55rem;" onclick="setDefaultModalPhoneNumber('${item.phone_number_id}')">Make Primary</button>` : ''}
                <button type="button" class="btn danger sm" style="font-size: 0.7rem; padding: 0.25rem 0.55rem;" onclick="removeModalPhoneNumber('${item.phone_number_id}')" title="Delete Number">🗑️</button>
            </div>
        </div>
    `).join('');
}

window.openCompanyModal = function openCompanyModal(companyId = null) {
    const modal = document.getElementById('company-modal');
    if (!modal) return;
    document.getElementById('company-form')?.reset();
    document.getElementById('company-id-edit').value = '';
    if (document.getElementById('comp-email')) document.getElementById('comp-email').value = '';
    if (document.getElementById('comp-phone')) document.getElementById('comp-phone').value = '';

    const isParent = isParentAdmin();
    const titleEl = document.getElementById('company-modal-title');
    const subAlert = document.getElementById('comp-modal-sub-alert');
    const phoneInput = document.getElementById('comp-phone-id');
    const wabaInput = document.getElementById('comp-waba-id');
    const tokenInput = document.getElementById('comp-access-token');
    const verifyInput = document.getElementById('comp-verify-token');
    const saveBtn = document.getElementById('btn-save-company');

    if (companyId !== null && companyId !== undefined) {
        const comp = allCompanies.find(c => String(c.id) === String(companyId));
        if (comp) {
            const isMaster = (comp.slug && comp.slug.toLowerCase() === 'inspenox') || (comp.name && comp.name.toLowerCase() === 'inspenox');
            const isPaid = comp.subscription_status === 'active' && comp.subscription_plan && comp.subscription_plan.toLowerCase() !== 'none';

            if (titleEl) {
                titleEl.textContent = isParent ? '🏢 Edit Company Account' : '⚙️ Configure Meta Credentials';
            }

            document.getElementById('company-id-edit').value = comp.id;
            document.getElementById('comp-name').value = comp.name || '';
            if (document.getElementById('comp-email')) document.getElementById('comp-email').value = comp.email || '';
            if (document.getElementById('comp-phone')) document.getElementById('comp-phone').value = comp.phone || '';

            // Strictly do NOT prefill systemEnv for other companies
            wabaInput.value = comp.whatsapp_business_account_id || (isMaster ? systemEnvGlobals.whatsapp_business_account_id : '') || '';
            tokenInput.value = comp.whatsapp_access_token || '';
            verifyInput.value = comp.whatsapp_verify_token || (isMaster ? systemEnvGlobals.whatsapp_verify_token : '') || '';

            // Calculate and enforce phone number limits based on active plan
            const planLimit = comp.phone_limit !== undefined
                ? comp.phone_limit
                : getCompanyPhoneLimit(comp.subscription_plan, isMaster);
            currentModalPhoneLimit = planLimit;

            // Load registered phone numbers
            if (Array.isArray(comp.whatsapp_phone_numbers) && comp.whatsapp_phone_numbers.length > 0) {
                currentModalPhoneNumbers = JSON.parse(JSON.stringify(comp.whatsapp_phone_numbers));
            } else if (comp.whatsapp_phone_number_id) {
                currentModalPhoneNumbers = [{
                    phone: comp.phone || '',
                    phone_number_id: comp.whatsapp_phone_number_id,
                    verified_name: comp.name || '',
                    status: 'Registered',
                    is_default: true
                }];
            } else if (isMaster && systemEnvGlobals.whatsapp_phone_number_id) {
                currentModalPhoneNumbers = [{
                    phone: comp.phone || '+91 79816 56294',
                    phone_number_id: systemEnvGlobals.whatsapp_phone_number_id,
                    verified_name: 'Inspenox Master',
                    status: 'Registered',
                    is_default: true
                }];
            } else {
                currentModalPhoneNumbers = [];
            }

            toggleAddPhoneForm(false);
            renderModalPhoneNumbersList();

            if (isMaster) {
                if (subAlert) {
                    subAlert.style.display = 'flex';
                    subAlert.innerHTML = `
                        <div style="font-size: 0.825rem; color: #10b981; line-height: 1.45;">
                            <strong>⚡ Inspenox Parent Organization:</strong><br>
                            WhatsApp API credentials for Inspenox are loaded directly from server environment variables and allow up to 20 numbers.
                        </div>
                    `;
                }
            } else if (!isPaid) {
                if (subAlert) subAlert.style.display = 'flex';
                if (wabaInput) { wabaInput.disabled = true; wabaInput.style.opacity = '0.55'; wabaInput.placeholder = '🔒 Locked - Subscription Required'; }
                if (tokenInput) { tokenInput.disabled = true; tokenInput.style.opacity = '0.55'; tokenInput.placeholder = '🔒 Locked - Subscription Required'; }
                if (verifyInput) { verifyInput.disabled = true; verifyInput.style.opacity = '0.55'; verifyInput.placeholder = '🔒 Locked - Subscription Required'; }
                if (saveBtn) {
                    if (!isParent) {
                        saveBtn.disabled = true;
                        saveBtn.textContent = '🔒 Subscription Required to Add Meta Credentials';
                        saveBtn.style.opacity = '0.6';
                        saveBtn.style.cursor = 'not-allowed';
                    } else {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save Company Account';
                        saveBtn.style.opacity = '1';
                        saveBtn.style.cursor = 'pointer';
                    }
                }
            } else {
                if (subAlert) subAlert.style.display = 'none';
                if (wabaInput) { wabaInput.disabled = false; wabaInput.style.opacity = '1'; wabaInput.placeholder = 'e.g. 1561463645723530'; }
                if (tokenInput) { tokenInput.disabled = false; tokenInput.style.opacity = '1'; tokenInput.placeholder = 'EAALed5FtFjw...'; }
                if (verifyInput) { verifyInput.disabled = false; verifyInput.style.opacity = '1'; verifyInput.placeholder = 'manasageetha'; }
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = isParent ? 'Save Company Account' : 'Save Meta Credentials';
                    saveBtn.style.opacity = '1';
                    saveBtn.style.cursor = 'pointer';
                }
            }
        }
    } else {
        if (titleEl) titleEl.textContent = '🏢 Add New Company Account';
        if (subAlert) {
            subAlert.style.display = 'flex';
            subAlert.innerHTML = `
                <div style="font-size: 0.825rem; color: #ef4444; line-height: 1.45;">
                    <strong>ℹ️ New Company Creation:</strong><br>
                    New company accounts are initialized without any plan. Meta WhatsApp credentials can be added once the company subscribes to an active plan.
                </div>
            `;
        }
        currentModalPhoneLimit = 0;
        currentModalPhoneNumbers = [];
        toggleAddPhoneForm(false);
        renderModalPhoneNumbersList();

        if (wabaInput) { wabaInput.value = ''; wabaInput.disabled = true; wabaInput.style.opacity = '0.55'; wabaInput.placeholder = '🔒 Unlocked after subscription'; }
        if (tokenInput) { tokenInput.value = ''; tokenInput.disabled = true; tokenInput.style.opacity = '0.55'; tokenInput.placeholder = '🔒 Unlocked after subscription'; }
        if (verifyInput) { verifyInput.value = 'manasageetha'; verifyInput.disabled = false; verifyInput.style.opacity = '1'; }
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Create Company Account';
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
        }
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeCompanyModal = function closeCompanyModal() {
    const modal = document.getElementById('company-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.toggleCompTokenVisibility = function toggleCompTokenVisibility() {
    const input = document.getElementById('comp-access-token');
    const btn = document.getElementById('btn-toggle-comp-token');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (btn) btn.textContent = '🔒';
    } else {
        input.type = 'password';
        if (btn) btn.textContent = '👁️';
    }
};

let allUsersList = [];

window.loadUsersList = async function loadUsersList() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading user accounts...</span></div></td></tr>`;
    try {
        const isParent = isParentAdmin();
        let userUrl = '/api/auth';
        if (isParent) {
            userUrl = '/api/auth?all=true';
        } else if (currentCompanyId && currentCompanyId !== 'default') {
            userUrl = `/api/auth?company_id=${currentCompanyId}`;
        }
        const res = await apiFetch(userUrl);
        const users = await res.json();
        if (Array.isArray(users)) {
            allUsersList = users;
            if (users.length === 0) {
                tbody.innerHTML = renderTableEmptyStateHtml(8, 'No users registered for this company yet', 'Click "+ Add User" to invite or assign team members to this workspace.', '👤');
                return;
            }
            tbody.innerHTML = '';
            users.forEach((u, idx) => {
                const tr = document.createElement('tr');
                const coName = u.company_name || (u.company_id ? `Company #${u.company_id}` : 'Inspenox Parent (All Companies)');
                const emailHtml = u.email ? `<span style="font-size:0.8rem; color:var(--text-main); font-weight:500;">${u.email}</span>` : `<span style="font-size:0.75rem; color:var(--text-muted);">-</span>`;
                const phoneHtml = u.phone ? `<span style="font-size:0.8rem; color:var(--text-muted);">${formatDisplayPhone(u.phone)}</span>` : `<span style="font-size:0.75rem; color:var(--text-muted);">-</span>`;

                tr.innerHTML = `
                    <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                    <td><strong style="color:var(--text-main);">${u.username}</strong></td>
                    <td>${emailHtml}</td>
                    <td>${phoneHtml}</td>
                    <td><span class="window-badge" style="background:var(--primary-light);color:var(--primary);">${coName}</span></td>
                    <td><code style="font-size:0.8rem; text-transform:uppercase;">${u.role || 'admin'}</code></td>
                    <td><span style="font-size:0.75rem; color:var(--text-muted);">${formatTime(u.created_at)}</span></td>
                    <td style="text-align: right;">
                        <button class="btn secondary sm" onclick="openResetUserPassModal('${u.id}', '${u.username}')">🔑 Reset Password</button>
                        <button class="btn secondary sm" onclick="openUserModal('${u.id}')">Edit</button>
                        ${(u.username !== 'admin' && isParent) ? `<button class="btn danger sm" onclick="deleteUser('${u.id}', '${u.username}')">Delete</button>` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Update User Plan Limit Badge
            const badgeEl = document.getElementById('user-plan-limit-badge');
            if (badgeEl) {
                const activeCo = (allCompanies || []).find(c => String(c.id) === String(currentCompanyId));
                const isMaster = !currentCompanyId || currentCompanyId === 'default' || (activeCo && ((activeCo.slug && activeCo.slug.toLowerCase() === 'inspenox') || (activeCo.name && activeCo.name.toLowerCase() === 'inspenox')));

                if (isMaster) {
                    badgeEl.style.display = 'inline-block';
                    badgeEl.textContent = '👥 Inspenox Parent (Unlimited Users)';
                    badgeEl.style.borderColor = 'var(--border)';
                    badgeEl.style.color = 'var(--text-main)';
                } else if (activeCo) {
                    const planStr = (activeCo.subscription_plan || '').toLowerCase();
                    const isPaid = activeCo.subscription_status === 'active' && planStr && planStr !== 'none';
                    let limit = 1;
                    let limitLabel = '1 User';
                    if (isPaid) {
                        if (planStr.includes('enterprise')) { limit = 999999; limitLabel = 'Unlimited'; }
                        else if (planStr.includes('growth')) { limit = 5; limitLabel = '5 Users'; }
                        else if (planStr.includes('starter')) { limit = 2; limitLabel = '2 Users'; }
                    }
                    const coUsers = users.filter(u => String(u.company_id) === String(activeCo.id));
                    badgeEl.style.display = 'inline-block';
                    badgeEl.textContent = `👥 Plan Limit: ${coUsers.length} / ${limitLabel} (${activeCo.subscription_plan || 'No Active Plan'})`;
                    if (typeof limit === 'number' && coUsers.length >= limit) {
                        badgeEl.style.borderColor = '#ef4444';
                        badgeEl.style.color = '#ef4444';
                    } else {
                        badgeEl.style.borderColor = 'var(--border)';
                        badgeEl.style.color = 'var(--text-main)';
                    }
                } else {
                    badgeEl.style.display = 'none';
                }
            }
        }
    } catch (e) {
        tbody.innerHTML = renderTableEmptyStateHtml(8, 'Failed to load user accounts', 'Could not retrieve user profiles for this workspace.', '⚠️');
    }
};

window.openResetUserPassModal = function openResetUserPassModal(userId, username) {
    const modal = document.getElementById('reset-user-pass-modal');
    if (!modal) return;
    document.getElementById('reset-user-id').value = userId || '';
    document.getElementById('reset-user-name').value = username || '';
    document.getElementById('reset-user-display').value = username || 'admin';
    document.getElementById('reset-user-new-pass').value = '';
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeResetUserPassModal = function closeResetUserPassModal() {
    const modal = document.getElementById('reset-user-pass-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.submitAdminResetPass = async function submitAdminResetPass(e) {
    if (e) e.preventDefault();
    const userId = document.getElementById('reset-user-id').value;
    const username = document.getElementById('reset-user-name').value;
    const newPassword = document.getElementById('reset-user-new-pass').value;

    const btn = document.getElementById('btn-submit-reset-user-pass');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Resetting...';
    }

    try {
        const res = await apiFetch('/api/auth?action=admin-reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username, newPassword })
        });
        const data = await res.json();
        if (data.success) {
            closeResetUserPassModal();
            showModal('Success', `Password for user "${username}" reset successfully!`);
        } else {
            showModal('Error', data.error || 'Failed to reset password.');
        }
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Update Password';
        }
    }
};

window.openUserModal = function openUserModal(userId = null) {
    // If adding a new user, enforce subscription plan limits
    if (!userId) {
        const activeCo = (allCompanies || []).find(c => String(c.id) === String(currentCompanyId));
        const isMaster = !currentCompanyId || currentCompanyId === 'default' || (activeCo && ((activeCo.slug && activeCo.slug.toLowerCase() === 'inspenox') || (activeCo.name && activeCo.name.toLowerCase() === 'inspenox')));

        if (!isMaster && activeCo) {
            const planStr = (activeCo.subscription_plan || '').toLowerCase();
            const isPaid = activeCo.subscription_status === 'active' && planStr && planStr !== 'none';
            let limit = 1;
            let limitLabel = '1 user';
            if (isPaid) {
                if (planStr.includes('enterprise')) { limit = 999999; limitLabel = 'unlimited users'; }
                else if (planStr.includes('growth')) { limit = 5; limitLabel = '5 users'; }
                else if (planStr.includes('starter')) { limit = 2; limitLabel = '2 users'; }
            }
            const coUsers = (allUsersList || []).filter(u => String(u.company_id) === String(activeCo.id));
            if (typeof limit === 'number' && coUsers.length >= limit) {
                showModal(
                    'User Limit Reached',
                    `Your current plan (${activeCo.subscription_plan || 'No Active Plan'}) allows a maximum of ${limitLabel}. You currently have ${coUsers.length} active user(s).\n\nPlease upgrade your subscription in Subscriptions & Billing to add more team members.`
                );
                return;
            }
        }
    }

    const modal = document.getElementById('user-modal');
    if (!modal) return;
    document.getElementById('user-form')?.reset();
    document.getElementById('user-id-edit').value = '';
    if (document.getElementById('user-email-input')) document.getElementById('user-email-input').value = '';
    if (document.getElementById('user-phone-input')) document.getElementById('user-phone-input').value = '';
    document.getElementById('user-modal-title').textContent = userId ? '👤 Edit User Account' : '👤 Add New User Account';

    const isParent = isParentAdmin();
    const selectCo = document.getElementById('user-company-select');
    if (selectCo) {
        selectCo.innerHTML = '';
        const sortedCos = [...(allCompanies || [])].sort((a, b) => {
            const aMaster = (a.slug && a.slug.toLowerCase() === 'inspenox') || (a.name && a.name.toLowerCase() === 'inspenox');
            const bMaster = (b.slug && b.slug.toLowerCase() === 'inspenox') || (b.name && b.name.toLowerCase() === 'inspenox');
            if (aMaster && !bMaster) return -1;
            if (!aMaster && bMaster) return 1;
            return a.id - b.id;
        });

        const hasInspenox = sortedCos.some(c => (c.slug && c.slug.toLowerCase() === 'inspenox') || (c.name && c.name.toLowerCase() === 'inspenox'));
        if (!hasInspenox && isParent) {
            const optDef = document.createElement('option');
            optDef.value = 'default';
            optDef.textContent = 'Inspenox (Parent)';
            selectCo.appendChild(optDef);
        }

        sortedCos.forEach(c => {
            if (isParent || String(c.id) === String(currentCompanyId)) {
                const opt = document.createElement('option');
                opt.value = c.id;
                const isMaster = (c.slug && c.slug.toLowerCase() === 'inspenox') || (c.name && c.name.toLowerCase() === 'inspenox');
                opt.textContent = isMaster ? 'Inspenox (Parent)' : c.name;
                selectCo.appendChild(opt);
            }
        });
        if (!isParent) {
            selectCo.value = currentCompanyId;
            selectCo.disabled = true;
        } else {
            selectCo.disabled = false;
        }
    }

    if (userId) {
        const u = allUsersList.find(usr => String(usr.id) === String(userId));
        if (u) {
            document.getElementById('user-id-edit').value = u.id;
            document.getElementById('user-name-input').value = u.username || '';
            if (document.getElementById('user-email-input')) document.getElementById('user-email-input').value = u.email || '';
            if (document.getElementById('user-phone-input')) document.getElementById('user-phone-input').value = u.phone || '';
            document.getElementById('user-role-select').value = u.role || 'admin';
            if (selectCo) selectCo.value = u.company_id || 'default';
        }
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeUserModal = function closeUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.saveUser = async function saveUser(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('user-id-edit').value;
    const username = document.getElementById('user-name-input').value;
    const email = document.getElementById('user-email-input')?.value || '';
    const phone = document.getElementById('user-phone-input')?.value || '';
    const company_id = document.getElementById('user-company-select').value;
    const role = document.getElementById('user-role-select').value;
    const password = document.getElementById('user-password-input').value;

    const btn = document.getElementById('btn-save-user');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Saving...';
    }

    try {
        const res = await apiFetch('/api/auth?action=save-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, username, email, phone, company_id, role, password })
        });
        const data = await res.json();
        if (data.success) {
            const curUserStr = localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user');
            if (curUserStr) {
                try {
                    const curUser = JSON.parse(curUserStr);
                    if (String(curUser.id) === String(id) || (!id && curUser.username.toLowerCase() === username.toLowerCase())) {
                        curUser.username = username;
                        if (email) curUser.email = email;
                        if (phone) curUser.phone = phone;
                        localStorage.setItem('inspenox_user', JSON.stringify(curUser));
                        localStorage.setItem('induio_user', JSON.stringify(curUser));
                    }
                } catch (err) { }
            }
            closeUserModal();
            loadUsersList();
            showModal('Success', `User "${username}" saved successfully!`);
        } else {
            showModal('Error', data.error || 'Failed to save user.');
        }
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Save User';
        }
    }
};

window.deleteUser = function deleteUser(id, username) {
    showModal('Delete User', `Are you sure you want to delete user "${username}"?`, 'confirm', async () => {
        try {
            const res = await apiFetch(`/api/auth?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadUsersList();
            } else {
                showModal('Error', data.error || 'Failed to delete user.');
            }
        } catch (e) {
            showModal('Error', 'Error deleting user.');
        }
    });
};

window.loadDashboard = async function loadDashboard() {
    const elCustomers = document.getElementById('dash-stat-customers');
    const elMessages = document.getElementById('dash-stat-messages');
    const elWaSent = document.getElementById('dash-stat-wa-sent');
    const elEmailSent = document.getElementById('dash-stat-email-sent');
    const elSmsSent = document.getElementById('dash-stat-sms-sent');
    const elChats = document.getElementById('dash-stat-chats');
    const elEstCost = document.getElementById('dash-stat-est-cost');
    const elInboxList = document.getElementById('dash-inbox-list');
    const mediaGrid = document.getElementById('dash-media-grid');

    if (elCustomers) elCustomers.textContent = '...';
    if (elMessages) elMessages.textContent = '...';
    if (elWaSent) elWaSent.textContent = '...';
    if (elEmailSent) elEmailSent.textContent = '...';
    if (elSmsSent) elSmsSent.textContent = '...';
    if (elChats) elChats.textContent = '...';
    if (elEstCost) elEstCost.textContent = '...';
    if (elInboxList) elInboxList.innerHTML = `<div class="loading-spinner-container" style="padding:1.5rem;"><div class="spinner-icon"></div><span>Loading recent activity...</span></div>`;
    if (mediaGrid) mediaGrid.innerHTML = `<div class="loading-spinner-container" style="padding:1.5rem; grid-column: span 2;"><div class="spinner-icon"></div><span>Loading media...</span></div>`;

    try {
        const res = await apiFetch('/api/analytics');
        const data = await res.json();

        if (elCustomers) elCustomers.textContent = data.total_customers || 0;
        if (elMessages) elMessages.textContent = data.messages_sent || 0;
        if (elWaSent) elWaSent.textContent = data.channels?.whatsapp || data.messages_sent || 0;
        if (elEmailSent) elEmailSent.textContent = data.channels?.email || 0;
        if (elSmsSent) elSmsSent.textContent = data.channels?.sms || 0;
        if (elChats) elChats.textContent = data.recent_inbound?.length || 0;
        if (elEstCost) {
            if (!isParentAdmin() && (data.requires_subscription || data.is_subscribed === false)) {
                elEstCost.innerHTML = '<span style="font-size:1.15rem; color:var(--text-muted); font-weight:700;">🔒 Sub Required</span>';
            } else {
                elEstCost.textContent = `₹${(data.estimated_costs?.total || 0).toFixed(2)}`;
            }
        }

        if (elInboxList) {
            if (!data.recent_inbound || data.recent_inbound.length === 0) {
                elInboxList.innerHTML = `<div class="empty-state">No recent customer activity.</div>`;
            } else {
                elInboxList.innerHTML = data.recent_inbound.map(msg => `
                    <div class="dash-list-item" style="padding:0.75rem; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.75rem; cursor:pointer;" onclick="switchView('inbox')">
                        <div class="dash-avatar" style="width:36px; height:36px; border-radius:50%; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem;">
                            ${getInitial(msg.name)}
                        </div>
                        <div class="dash-list-item-content" style="flex:1;">
                            <strong style="color:var(--text-main); font-size:0.875rem;">${msg.name || formatDisplayPhone(msg.phone)}</strong>
                            <p style="margin:0.15rem 0 0 0; font-size:0.775rem; color:var(--text-muted);">${msg.content || '[Message]'}</p>
                        </div>
                        <span style="font-size:0.7rem; color:var(--text-muted);">${formatTime(msg.created_at)}</span>
                    </div>
                `).join('');
            }
        }

        if (mediaGrid) {
            try {
                const mediaRes = await apiFetch('/api/media');
                const mediaList = await mediaRes.json();

                if (!Array.isArray(mediaList) || mediaList.length === 0) {
                    mediaGrid.innerHTML = '<div class="empty-state" style="grid-column: span 2;">No media uploaded yet.</div>';
                } else {
                    mediaGrid.innerHTML = '';
                    const recentFiles = mediaList.slice(0, 4);
                    recentFiles.forEach(m => {
                        const isVideo = m.type === 'video' || (m.name && m.name.endsWith('.mp4'));
                        const mediaHtml = isVideo
                            ? (m.file_url ? `<video src="${m.file_url}" muted></video>` : `<div style="font-size:0.75rem;padding:0.5rem;text-align:center;">🎥 ${m.name}</div>`)
                            : (m.file_url ? `<img src="${m.file_url}" alt="${m.name}">` : `<div style="font-size:0.75rem;padding:0.5rem;text-align:center;">🖼️ ${m.name}</div>`);

                        mediaGrid.innerHTML += `
                            <div class="dash-media-card">
                                ${mediaHtml}
                            </div>
                        `;
                    });
                }
            } catch (mediaErr) {
                console.error('Error loading dashboard media:', mediaErr);
                mediaGrid.innerHTML = '<div class="empty-state" style="grid-column: span 2;">No media uploaded yet.</div>';
            }
        }
    } catch (e) {
        console.error('Error loading dashboard analytics:', e);
    }
};

window.loadUsageAnalytics = async function loadUsageAnalytics(daysParam) {
    const isParent = isParentAdmin();
    const elBadge = document.getElementById('usage-meta-badge');
    const elAmountSpent = document.getElementById('meta-stat-amount-spent');
    const elCostPerMsg = document.getElementById('meta-stat-cost-per-msg');
    const elTotalMsgs = document.getElementById('usage-stat-total-msgs');
    const elTotalCost = document.getElementById('usage-stat-total-cost');

    const elSentCount = document.getElementById('meta-stat-sent-count');
    const elDeliveredCount = document.getElementById('meta-stat-delivered-count');
    const elReadCount = document.getElementById('meta-stat-read-count');
    const elReadPercent = document.getElementById('meta-stat-read-percent');
    const elUniqueReplies = document.getElementById('meta-stat-unique-replies');

    const tbodyTemplates = document.getElementById('meta-templates-insights-body');
    const tbodyCompanies = document.getElementById('usage-company-table-body');
    const companyBreakdownCard = document.getElementById('usage-company-breakdown-card');

    // Show/hide Superadmin action headers in table
    document.querySelectorAll('.th-superadmin-action').forEach(el => {
        el.style.display = isParent ? 'table-cell' : 'none';
    });

    // Always keep company breakdown card visible so companies can see their usage and charges
    if (companyBreakdownCard) {
        companyBreakdownCard.style.display = 'block';
    }

    const cardTitleEl = document.getElementById('usage-breakdown-card-title');
    const cardSubEl = document.getElementById('usage-breakdown-card-sub');
    if (cardTitleEl) {
        cardTitleEl.textContent = isParent ? 'Multi-Tenant Company Usage Breakdown' : 'Bills & Usage Summary';
    }
    if (cardSubEl) {
        cardSubEl.textContent = isParent ?
            'Message counts and estimated charges broken down by company account.' :
            'Itemized message usage breakdown and outstanding bill charges for your account.';
    }

    const colspanVal = isParent ? 11 : 10;
    const coColspanVal = isParent ? 10 : 10;

    if (tbodyTemplates) tbodyTemplates.innerHTML = `<tr><td colspan="${colspanVal}"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading direct Meta template insights...</span></div></td></tr>`;
    if (tbodyCompanies) tbodyCompanies.innerHTML = `<tr><td colspan="${coColspanVal}"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading API usage data...</span></div></td></tr>`;

    try {
        const storedComp = getStoredCompany();
        const dateRangeSelect = document.getElementById('filter-tpl-date-range');
        const queryDays = daysParam || (dateRangeSelect ? dateRangeSelect.value : '60');
        if (dateRangeSelect && daysParam) {
            dateRangeSelect.value = String(daysParam);
        }

        const queryParts = [];
        if (!isParent && storedComp && storedComp.id) {
            queryParts.push(`company_id=${storedComp.id}`);
        } else if (isParent && storedComp && storedComp.id && storedComp.id !== 'all' && storedComp.id !== 'default' && storedComp.id !== 'parent') {
            queryParts.push(`company_id=${storedComp.id}`);
        }
        if (queryDays) {
            queryParts.push(`days=${queryDays}`);
        }
        const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

        const res = await apiFetch(`/api/analytics${queryStr}`);
        const data = await res.json();

        const isRequiresSub = !isParent && (data.requires_subscription || data.is_subscribed === false);
        const isRequiresConfig = !isParent && !isRequiresSub && (data.requires_meta_config || data.is_configured === false);
        window._metaAnalyticsRequiresSub = isRequiresSub;
        window._metaAnalyticsRequiresConfig = isRequiresConfig;

        // 1. Connection Status Badge & Superadmin Edit Summary Button
        if (elBadge) {
            if (isRequiresSub) {
                elBadge.innerHTML = '🔒 Subscription Required';
                elBadge.style.background = 'rgba(239, 68, 68, 0.15)';
                elBadge.style.color = '#ef4444';
            } else if (isRequiresConfig) {
                elBadge.innerHTML = '⚙️ Meta Credentials Not Configured';
                elBadge.style.background = 'rgba(234, 179, 8, 0.15)';
                elBadge.style.color = '#eab308';
            } else {
                let badgeText = data.meta_connected ? '⚡ Direct Meta Graph API v20.0' : '📊 Local Database Analytics';
                let badgeBg = data.meta_connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)';
                let badgeColor = data.meta_connected ? '#10b981' : '#eab308';
                let superBtnHtml = isParent ? ` <button class="btn secondary sm" style="margin-left:0.5rem; padding:0.2rem 0.5rem; font-size:0.75rem; border-radius:6px;" onclick="editOverallMetaInsightsModal(${data.meta_direct_insights?.total_amount_spent || 0}, ${data.meta_direct_insights?.total_sent || 0}, ${data.meta_direct_insights?.total_delivered || 0}, ${data.meta_direct_insights?.total_read || 0}, ${data.meta_direct_insights?.unique_replies || 0})">✏️ Edit Summary</button>` : '';

                elBadge.innerHTML = badgeText + superBtnHtml;
                elBadge.style.background = badgeBg;
                elBadge.style.color = badgeColor;
            }
        }

        // 2. Direct Meta Summary Stat Cards
        const metaInsights = data.meta_direct_insights || {};
        if (elAmountSpent) {
            if (isRequiresSub) {
                elAmountSpent.innerHTML = '<span style="font-size:1.35rem; color:var(--text-muted); font-weight:700;">🔒 Locked</span>';
            } else {
                elAmountSpent.textContent = `₹${(metaInsights.total_amount_spent || data.estimated_costs?.whatsapp || 0).toFixed(2)}`;
            }
        }
        if (elCostPerMsg) elCostPerMsg.textContent = `₹0.8631 / ₹0.115`;
        if (elTotalMsgs) elTotalMsgs.textContent = isRequiresSub ? '0' : (metaInsights.total_sent || data.messages_sent || 0);

        const totalCostVal = data.estimated_costs?.total || 0;
        const subtotalVal = data.estimated_costs?.subtotal || (totalCostVal / 1.18);
        const gstVal = data.estimated_costs?.gst_amount || (totalCostVal - subtotalVal);
        window.latestTotalCost = totalCostVal;
        window.latestSubtotal = subtotalVal;
        window.latestGst = gstVal;

        if (elTotalCost) {
            if (isRequiresSub) {
                elTotalCost.innerHTML = '<span style="font-size:1.35rem; color:var(--text-muted); font-weight:700;">🔒 Locked</span>';
            } else {
                elTotalCost.textContent = `₹${totalCostVal.toFixed(2)}`;
            }
        }

        const elCostSubtext = document.getElementById('usage-stat-cost-subtext');
        if (elCostSubtext) {
            if (isRequiresSub) {
                elCostSubtext.innerHTML = '<span style="color:#eab308; font-weight:600;">Subscribe to view analytics & estimated cost breakdown</span>';
            } else {
                elCostSubtext.innerHTML = `Excl. GST: <strong>₹${subtotalVal.toFixed(2)}</strong> + 18% GST: <strong>₹${gstVal.toFixed(2)}</strong>`;
            }
        }

        // Show Pay Bill Now or Subscribe container for registered logged-in company users
        const payContainer = document.getElementById('pay-now-container');
        if (payContainer) {
            if (isRequiresSub) {
                payContainer.style.display = 'block';
                payContainer.innerHTML = `
                    <button class="btn primary sm" style="width: 100%; font-weight: 700; background: var(--primary); border: none; padding: 0.45rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;" onclick="switchView('subscriptions')">
                        ⚡ Subscribe to View Estimated Cost
                    </button>
                `;
            } else {
                payContainer.style.display = (!isParent && totalCostVal >= 0) ? 'block' : 'none';
                payContainer.innerHTML = `
                    <button id="btn-pay-now" class="btn primary sm" style="width: 100%; font-weight: 700; background: #10b981; border: none; padding: 0.45rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;" onclick="triggerCompanyPayment()">
                        💳 Pay Bill Now
                    </button>
                `;
            }
        }

        // 3. Performance Metrics
        if (elSentCount) elSentCount.innerHTML = isRequiresSub ? '<span style="color:var(--text-muted); font-size:1.35rem;">🔒</span>' : (metaInsights.total_sent || 0);
        if (elDeliveredCount) elDeliveredCount.innerHTML = isRequiresSub ? '<span style="color:var(--text-muted); font-size:1.35rem;">🔒</span>' : (metaInsights.total_delivered || 0);
        if (elReadCount) elReadCount.innerHTML = isRequiresSub ? '<span style="color:var(--text-muted); font-size:1.35rem;">🔒</span>' : (metaInsights.total_read || 0);
        if (elReadPercent) elReadPercent.textContent = isRequiresSub ? '' : `(${metaInsights.total_read_percent || 0}%)`;
        if (elUniqueReplies) elUniqueReplies.innerHTML = isRequiresSub ? '<span style="color:var(--text-muted); font-size:1.35rem;">🔒</span>' : (metaInsights.unique_replies || 0);

        // 4. Render Template Insights Table with Live Filter Controls
        window._metaAllTemplates = metaInsights.templates || [];

        if (tbodyTemplates) {
            if (isRequiresSub) {
                tbodyTemplates.innerHTML = `
                    <tr>
                        <td colspan="${colspanVal}" style="padding: 3.5rem 1.5rem; text-align: center; background: rgba(16, 185, 129, 0.02);">
                            <div style="max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.85rem;">
                                <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(234, 179, 8, 0.15); color: #eab308; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; box-shadow: 0 4px 14px rgba(234, 179, 8, 0.12);">
                                    🔒
                                </div>
                                <h3 style="margin: 0; font-size: 1.25rem; color: var(--text-main); font-weight: 800; letter-spacing: -0.3px;">
                                    Subscribe to View Analytics and Estimated Cost
                                </h3>
                                <p style="margin: 0; font-size: 0.875rem; color: var(--text-muted); line-height: 1.55;">
                                    Direct Meta WhatsApp message templates, delivery statistics, read receipts, and live cost calculation are only available on active subscription plans.
                                </p>
                                <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem; flex-wrap: wrap; justify-content: center;">
                                    <button class="btn primary" style="font-weight: 700; padding: 0.65rem 1.6rem; border-radius: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); font-size: 0.9rem;" onclick="switchView('subscriptions')">
                                        ⚡ View Subscription Plans & Upgrade
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            } else if (isRequiresConfig) {
                tbodyTemplates.innerHTML = `
                    <tr>
                        <td colspan="${colspanVal}" style="padding: 3.5rem 1.5rem; text-align: center; background: rgba(59, 130, 246, 0.02);">
                            <div style="max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.85rem;">
                                <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(59, 130, 246, 0.15); color: #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 1.75rem;">
                                    ⚙️
                                </div>
                                <h3 style="margin: 0; font-size: 1.25rem; color: var(--text-main); font-weight: 800; letter-spacing: -0.3px;">
                                    Configure Meta Credentials
                                </h3>
                                <p style="margin: 0; font-size: 0.875rem; color: var(--text-muted); line-height: 1.55;">
                                    To view your company's official templates and live analytics, please configure your WhatsApp Phone Number ID, Business Account ID, and Access Token in Settings.
                                </p>
                                <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
                                    <button class="btn primary sm" style="font-weight: 700; padding: 0.6rem 1.4rem; border-radius: 8px;" onclick="switchView('settings')">
                                        🔑 Configure Meta Credentials in Settings
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                // Populate languages into filter dropdown
                const langSelect = document.getElementById('filter-tpl-language');
                if (langSelect) {
                    const currentLang = langSelect.value || 'ALL';
                    const langs = Array.from(new Set(window._metaAllTemplates.map(t => t.language).filter(Boolean)));
                    let langHtml = '<option value="ALL">Language ▾ (All)</option>';
                    langs.forEach(l => {
                        const label = l === 'te' ? 'Telugu (te)' : (l === 'en' ? 'English (en)' : (l === 'en_US' ? 'English US (en_US)' : l));
                        langHtml += `<option value="${l}">${label}</option>`;
                    });
                    langSelect.innerHTML = langHtml;
                    if (langs.includes(currentLang)) langSelect.value = currentLang;
                }

                // Initialize filter events once
                if (!window._tplFiltersInitialized) {
                    window._tplFiltersInitialized = true;
                    document.getElementById('filter-tpl-search')?.addEventListener('input', applyTemplateFiltersAndRender);
                    document.getElementById('filter-tpl-category')?.addEventListener('change', applyTemplateFiltersAndRender);
                    document.getElementById('filter-tpl-language')?.addEventListener('change', applyTemplateFiltersAndRender);
                    document.getElementById('filter-tpl-status')?.addEventListener('change', applyTemplateFiltersAndRender);
                    document.getElementById('filter-tpl-date-range')?.addEventListener('change', (e) => {
                        loadUsageAnalytics(e.target.value);
                    });
                    document.getElementById('btn-reset-tpl-filters')?.addEventListener('click', resetTemplateFilters);
                }

                // Render with current filters applied
                applyTemplateFiltersAndRender();
            }
        }

        // 5. Render Company Usage Table
        if (tbodyCompanies) {
            if (isRequiresSub) {
                tbodyCompanies.innerHTML = `
                    <tr>
                        <td colspan="${coColspanVal}" style="padding: 2.5rem 1.5rem; text-align: center;">
                            <div style="max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                                <div style="font-size: 1.5rem;">🔒</div>
                                <strong style="color: var(--text-main); font-size: 1rem;">Usage Billing Details Locked</strong>
                                <p style="margin: 0; font-size: 0.825rem; color: var(--text-muted); line-height: 1.5;">
                                    Subscribe to an active plan to view itemized message counts and estimated charges for your company.
                                </p>
                                <button class="btn primary sm" style="margin-top: 0.5rem; font-weight: 700; border-radius: 6px;" onclick="switchView('subscriptions')">
                                    ⚡ View Subscription Plans
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                const usageList = data.company_usage || [];
                if (usageList.length === 0) {
                    tbodyCompanies.innerHTML = renderTableEmptyStateHtml(coColspanVal, 'No company API usage data recorded yet', 'Outbound messages and API operations will be tracked here.', '📊');
                } else {
                    tbodyCompanies.innerHTML = usageList.map((u, idx) => {
                        const baseCost = u.base_cost || (u.est_cost / 1.18);
                        const gstAmount = u.gst_amount || (u.est_cost - baseCost);
                        const actionTd = isParent ?
                            `<td style="text-align:center;"><button class="btn secondary sm" style="padding:0.2rem 0.45rem; font-size:0.7rem;" onclick="editCompanyUsageModal('${u.id}', '${u.name.replace(/'/g, "\\'")}', ${u.wa_marketing_count}, ${u.wa_utility_count}, ${u.wa_auth_count}, ${u.email_count}, ${u.sms_count}, ${u.est_cost})">✏️ Edit</button></td>` :
                            `<td style="text-align:center;"><button class="btn primary sm" style="padding:0.25rem 0.6rem; font-size:0.75rem; background:#10b981; border:none; font-weight:700;" onclick="triggerCompanyPayment('${u.id}', '${u.name.replace(/'/g, "\\'")}', ${u.est_cost}, ${baseCost}, ${gstAmount})">💳 Pay Charges</button></td>`;
                        return `
                        <tr>
                            <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                            <td><strong style="color:var(--text-main);">${u.name}</strong></td>
                            <td><code style="color:var(--primary); font-weight:600;">${u.wa_marketing_count}</code></td>
                            <td><code>${u.wa_utility_count}</code></td>
                            <td><code>${u.wa_auth_count}</code></td>
                            <td><code>${u.email_count}</code></td>
                            <td><code>${u.sms_count}</code></td>
                            <td><strong>${u.total_outbound}</strong></td>
                            <td style="text-align: right;">
                                <strong style="color:var(--primary); font-size:1.05rem; display:block;">₹${u.est_cost.toFixed(2)} <span style="font-size:0.7rem; color:#10b981; font-weight:600;">(Incl. GST)</span></strong>
                                <span style="font-size:0.725rem; color:var(--text-muted); display:block; font-weight:500; margin-top:0.15rem;">
                                    Excl. GST: ₹${baseCost.toFixed(2)} | GST 18%: ₹${gstAmount.toFixed(2)}
                                </span>
                            </td>
                            ${actionTd}
                        </tr>
                    `;
                    }).join('');
                }
            }
        }
    } catch (e) {
        console.error('Error loading usage analytics:', e);
        if (tbodyTemplates) tbodyTemplates.innerHTML = renderTableEmptyStateHtml(colspanVal, 'Failed to load Meta template insights', 'Please verify your Meta WhatsApp Cloud API credentials in settings.', '⚠️');
        if (tbodyCompanies) tbodyCompanies.innerHTML = renderTableEmptyStateHtml(coColspanVal, 'Failed to load API usage statistics', 'Please check connection and retry.', '⚠️');
    }
};

window.resetTemplateFilters = function resetTemplateFilters() {
    const searchInp = document.getElementById('filter-tpl-search');
    const catSel = document.getElementById('filter-tpl-category');
    const langSel = document.getElementById('filter-tpl-language');
    const statSel = document.getElementById('filter-tpl-status');
    if (searchInp) searchInp.value = '';
    if (catSel) catSel.value = 'ALL';
    if (langSel) langSel.value = 'ALL';
    if (statSel) statSel.value = 'ALL';
    applyTemplateFiltersAndRender();
};

window.applyTemplateFiltersAndRender = function applyTemplateFiltersAndRender() {
    const tbodyTemplates = document.getElementById('meta-templates-insights-body');
    const countBadge = document.getElementById('tpl-filter-count-badge');
    const isParent = isParentAdmin();
    const colspanVal = isParent ? 11 : 10;
    if (!tbodyTemplates) return;

    if (window._metaAnalyticsRequiresSub || window._metaAnalyticsRequiresConfig) return;

    const allTemplates = window._metaAllTemplates || [];
    const searchVal = (document.getElementById('filter-tpl-search')?.value || '').toLowerCase().trim();
    const catVal = document.getElementById('filter-tpl-category')?.value || 'ALL';
    const langVal = document.getElementById('filter-tpl-language')?.value || 'ALL';
    const statVal = document.getElementById('filter-tpl-status')?.value || 'ALL';

    const filtered = allTemplates.filter(t => {
        if (searchVal) {
            const nameMatch = (t.name || '').toLowerCase().includes(searchVal);
            const catMatch = (t.category || '').toLowerCase().includes(searchVal);
            if (!nameMatch && !catMatch) return false;
        }
        if (catVal !== 'ALL') {
            if ((t.category || '').toUpperCase() !== catVal.toUpperCase()) return false;
        }
        if (langVal !== 'ALL') {
            if (t.language !== langVal) return false;
        }
        if (statVal !== 'ALL') {
            const s = (t.status || '').toUpperCase();
            if (statVal === 'APPROVED' && s !== 'APPROVED' && s !== 'ACTIVE') return false;
            if (statVal === 'PENDING' && s !== 'PENDING') return false;
            if (statVal === 'REJECTED' && s !== 'REJECTED') return false;
            if (statVal === 'PAUSED' && s !== 'PAUSED') return false;
        }
        return true;
    });

    if (countBadge) {
        if (allTemplates.length === 0) {
            countBadge.textContent = '0 templates found';
            countBadge.style.background = 'rgba(234, 179, 8, 0.12)';
            countBadge.style.color = '#eab308';
        } else if (filtered.length === allTemplates.length) {
            countBadge.textContent = `Showing all ${allTemplates.length} templates`;
            countBadge.style.background = 'rgba(16, 185, 129, 0.12)';
            countBadge.style.color = '#10b981';
        } else {
            countBadge.textContent = `Showing ${filtered.length} of ${allTemplates.length} templates`;
            countBadge.style.background = 'rgba(59, 130, 246, 0.12)';
            countBadge.style.color = '#3b82f6';
        }
    }

    if (filtered.length === 0) {
        if (allTemplates.length === 0) {
            tbodyTemplates.innerHTML = renderTableEmptyStateHtml(colspanVal, 'No Meta template analytics recorded yet', 'Approved templates that dispatch broadcasts will display delivery metrics here.', '📊');
        } else {
            tbodyTemplates.innerHTML = `
                <tr>
                    <td colspan="${colspanVal}" class="empty-state">
                        <div class="empty-state-content">
                            <div class="empty-state-icon">🔍</div>
                            <div class="empty-state-title">No templates match your filters</div>
                            <div class="empty-state-desc">Try adjusting your search terms, category, or language.</div>
                            <button type="button" class="btn secondary sm" onclick="resetTemplateFilters()" style="margin-top:0.4rem;">Clear Filters</button>
                        </div>
                    </td>
                </tr>
            `;
        }
        return;
    }

    tbodyTemplates.innerHTML = filtered.map((t, idx) => {
        const statusBadge = t.status === 'APPROVED' || t.status === 'ACTIVE' ?
            '<span class="window-badge" style="background:rgba(16, 185, 129, 0.15); color:#10b981; font-weight:600;">Active</span>' :
            '<span class="window-badge" style="background:rgba(234, 179, 8, 0.15); color:#eab308; font-weight:600;">Pending</span>';
        const categoryBadge = `<span class="window-badge" style="background:var(--primary-light); color:var(--primary); font-size:0.75rem; text-transform:uppercase;">${t.category}</span>`;
        const rateDisplay = (t.cost_per_delivered < 0.2 && t.cost_per_delivered > 0) ? `₹${t.cost_per_delivered.toFixed(4)}` : (t.cost_per_delivered === 0 ? 'FREE' : `₹${t.cost_per_delivered.toFixed(4)}`);
        const actionTd = isParent ? `<td style="text-align:center;"><button class="btn secondary sm" style="padding:0.2rem 0.45rem; font-size:0.7rem;" onclick="editTemplateStatsModal('${t.id}', '${t.name.replace(/'/g, "\\'")}', ${t.sent}, ${t.delivered}, ${t.read}, ${t.replies}, ${t.cost_per_delivered}, ${t.amount_spent})">✏️ Edit</button></td>` : '';
        return `
            <tr>
                <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                <td>
                    <strong style="color:var(--text-main); display:block;">${t.name}</strong>
                    <span style="font-size:0.75rem; color:var(--text-muted);">${t.language}</span>
                </td>
                <td>${categoryBadge}</td>
                <td>${statusBadge}</td>
                <td><strong>${t.sent}</strong></td>
                <td><strong style="color:#10b981;">${t.delivered}</strong></td>
                <td>
                    <span style="font-weight:700; color:#3b82f6;">${t.read}</span>
                    <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.2rem;">(${t.read_percent}%)</span>
                </td>
                <td><strong style="color:#8b5cf6;">${t.replies}</strong></td>
                <td><code style="color:var(--text-muted); font-weight:600;">${rateDisplay}</code></td>
                <td style="text-align: right;"><strong style="color:var(--text-main); font-size:1.05rem;">₹${t.amount_spent.toFixed(2)}</strong></td>
                ${actionTd}
            </tr>
        `;
    }).join('');
};

// Payment Flow for Logged-In Registered Companies
window.triggerCompanyPayment = function (id, name, amount, baseCost, gstAmt) {
    const currentCompany = getStoredCompany();
    const compName = name || currentCompany?.name || 'Registered Account';
    const totalAmt = (amount !== undefined && amount !== null) ? amount : (window.latestTotalCost || 0);
    const baseVal = (baseCost !== undefined && baseCost !== null) ? baseCost : (window.latestSubtotal || (totalAmt / 1.18));
    const gstVal = (gstAmt !== undefined && gstAmt !== null) ? gstAmt : (window.latestGst || (totalAmt - baseVal));

    const paymentModalHtml = `
        <div style="display:flex; flex-direction:column; gap:1rem;">
            <div style="background:rgba(16,185,129,0.08); border:1px solid #10b981; padding:1rem; border-radius:10px;">
                <div style="font-size:0.78rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom:0.6rem; text-align:center;">Itemized Bill & Tax Invoice</div>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; font-size:0.85rem;">
                    <span style="color:var(--text-muted);">Base Usage Amount (Excl. GST):</span>
                    <strong style="color:var(--text-main);">₹${parseFloat(baseVal).toFixed(2)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.6rem; font-size:0.85rem; border-bottom:1px dashed var(--border); padding-bottom:0.5rem;">
                    <span style="color:var(--text-muted);">GST (18%):</span>
                    <strong style="color:var(--text-main);">+ ₹${parseFloat(gstVal).toFixed(2)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.4rem;">
                    <span style="font-size:0.85rem; font-weight:700; color:var(--text-main);">Total Payable (Incl. GST):</span>
                    <strong style="font-size:1.8rem; font-weight:800; color:#10b981;">₹${parseFloat(totalAmt).toFixed(2)}</strong>
                </div>
                <div style="text-align:center; font-size:0.75rem; color:var(--text-muted); margin-top:0.4rem;">Account: <strong>${compName}</strong></div>
            </div>

            <div style="font-size:0.85rem;">
                <strong style="display:block; margin-bottom:0.6rem; color:var(--text-main);">Choose Payment Method:</strong>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem;">
                    <label style="border:1px solid var(--border); padding:0.65rem; border-radius:8px; display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:600; font-size:0.8rem;">
                        <input type="radio" name="pay-method" value="upi" checked> UPI / GooglePay / PhonePe
                    </label>
                    <label style="border:1px solid var(--border); padding:0.65rem; border-radius:8px; display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:600; font-size:0.8rem;">
                        <input type="radio" name="pay-method" value="card"> 💳 Credit / Debit Card
                    </label>
                    <label style="border:1px solid var(--border); padding:0.65rem; border-radius:8px; display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:600; font-size:0.8rem;">
                        <input type="radio" name="pay-method" value="netbanking"> 🏦 Netbanking (All Banks)
                    </label>
                    <label style="border:1px solid var(--border); padding:0.65rem; border-radius:8px; display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:600; font-size:0.8rem;">
                        <input type="radio" name="pay-method" value="bank_transfer"> 🏛️ Direct Bank Transfer
                    </label>
                </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem;">
                <button class="btn secondary sm" onclick="closeModal()">Cancel</button>
                <button class="btn primary sm" style="background:#10b981; border:none; font-weight:700; padding:0.45rem 1rem;" onclick="processPaymentSubmit('${compName.replace(/'/g, "\\'")}', ${totalAmt})">Proceed to Pay ₹${parseFloat(totalAmt).toFixed(2)}</button>
            </div>
        </div>
    `;
    showModal(`💳 Pay Usage Charges - ${compName}`, paymentModalHtml);
};

window.processPaymentSubmit = function (compName, amount) {
    const refId = `INS-${Date.now().toString().slice(-8)}`;
    showModal(
        '🎉 Payment Gateway Initiated',
        `<div style="text-align:center; padding:0.75rem;">
            <div style="font-size:3rem; margin-bottom:0.4rem;">✅</div>
            <h4 style="margin:0 0 0.4rem 0; color:var(--text-main); font-size:1.15rem;">Payment Request Dispatched!</h4>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
                Payment session of <strong style="color:#10b981;">₹${parseFloat(amount).toFixed(2)}</strong> (inc. 18% GST) for <strong>${compName}</strong> has been generated successfully.
            </p>
            <div style="background:var(--bg-card); border:1px solid var(--border); padding:0.75rem; border-radius:8px; font-family:monospace; font-size:0.85rem; margin-bottom:1rem;">
                Transaction Ref: ${refId}
            </div>
            <p style="font-size:0.78rem; color:#10b981; font-weight:600; margin:0;">Receipt copy & tax invoice sent to registered billing email.</p>
        </div>`
    );
};

// --- Super Admin Manual Overrides Modals ---
// Live Auto Calculation Helpers for Overrides
window.autoCalcTplSpent = function () {
    const del = parseFloat(document.getElementById('ov-tpl-delivered')?.value || 0);
    const rate = parseFloat(document.getElementById('ov-tpl-rate')?.value || 0);
    const spentEl = document.getElementById('ov-tpl-spent');
    if (spentEl) {
        spentEl.value = (del * rate).toFixed(4);
    }
};

window.autoCalcCoCost = function () {
    const m = parseInt(document.getElementById('ov-co-m')?.value || 0);
    const u = parseInt(document.getElementById('ov-co-u')?.value || 0);
    const a = parseInt(document.getElementById('ov-co-a')?.value || 0);
    const email = parseInt(document.getElementById('ov-co-email')?.value || 0);
    const sms = parseInt(document.getElementById('ov-co-sms')?.value || 0);

    // Rates: WA Mkt = 0.8631, WA Util = 0.115, WA Auth = 0.115, Email = 0.05, SMS = 0.25
    const baseCost = (m * 0.8631) + (u * 0.115) + (a * 0.115) + (email * 0.05) + (sms * 0.25);
    const costWithGst = baseCost * 1.18; // Includes 18% GST

    const costEl = document.getElementById('ov-co-cost');
    if (costEl) {
        costEl.value = costWithGst.toFixed(2);
    }
};

window.editTemplateStatsModal = function (id, name, sent, delivered, read, replies, rate, amountSpent) {
    const contentHtml = `
        <div style="display:flex; flex-direction:column; gap:0.85rem;">
            <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Manually edit analytics stats for template <strong>${name}</strong>. Values set here will be saved in DB and served to all company users.</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Sent Count</label>
                    <input type="number" id="ov-tpl-sent" value="${sent}" min="0" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Delivered Count</label>
                    <input type="number" id="ov-tpl-delivered" value="${delivered}" min="0" oninput="autoCalcTplSpent()" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Read Count</label>
                    <input type="number" id="ov-tpl-read" value="${read}" min="0" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Replies Count</label>
                    <input type="number" id="ov-tpl-replies" value="${replies}" min="0" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Cost / Delivered (₹)</label>
                    <input type="number" step="0.0001" id="ov-tpl-rate" value="${rate}" min="0" oninput="autoCalcTplSpent()" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Amount Spent (₹)</label>
                    <input type="number" step="0.01" id="ov-tpl-spent" value="${amountSpent}" min="0" style="padding:0.4rem;">
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:0.5rem; gap:0.5rem;">
                <button type="button" class="btn secondary sm" onclick="resetOverride('template', '${id}')">Reset Auto Calculation</button>
                <button type="button" class="btn primary sm" onclick="submitTplOverride('${id}')">Save Override</button>
            </div>
        </div>
    `;
    showModal(`Edit Template Stats: ${name}`, contentHtml);
};

window.editCompanyUsageModal = function (id, name, m, u, a, email, sms, cost) {
    const contentHtml = `
        <div style="display:flex; flex-direction:column; gap:0.85rem;">
            <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Manually edit API usage stats for company <strong>${name}</strong>.</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">WA Marketing Count</label>
                    <input type="number" id="ov-co-m" value="${m}" min="0" oninput="autoCalcCoCost()" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">WA Utility Count</label>
                    <input type="number" id="ov-co-u" value="${u}" min="0" oninput="autoCalcCoCost()" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">WA Auth Count</label>
                    <input type="number" id="ov-co-a" value="${a}" min="0" oninput="autoCalcCoCost()" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Email Sent Count</label>
                    <input type="number" id="ov-co-email" value="${email}" min="0" oninput="autoCalcCoCost()" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">SMS Sent Count</label>
                    <input type="number" id="ov-co-sms" value="${sms}" min="0" oninput="autoCalcCoCost()" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Estimated Cost (₹ + 18% GST)</label>
                    <input type="number" step="0.01" id="ov-co-cost" value="${cost}" min="0" style="padding:0.4rem;">
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:0.5rem; gap:0.5rem;">
                <button type="button" class="btn secondary sm" onclick="resetOverride('company_usage', '${id}')">Reset Auto Calculation</button>
                <button type="button" class="btn primary sm" onclick="submitCoOverride('${id}')">Save Override</button>
            </div>
        </div>
    `;
    showModal(`Edit Company Usage: ${name}`, contentHtml);
};

window.editOverallMetaInsightsModal = function (spent, sent, delivered, read, replies) {
    const contentHtml = `
        <div style="display:flex; flex-direction:column; gap:0.85rem;">
            <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Manually edit overall Meta Direct Insights summary cards.</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Total Amount Spent (₹)</label>
                    <input type="number" step="0.01" id="ov-global-spent" value="${spent}" min="0" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Total Sent</label>
                    <input type="number" id="ov-global-sent" value="${sent}" min="0" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Total Delivered</label>
                    <input type="number" id="ov-global-delivered" value="${delivered}" min="0" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Total Read</label>
                    <input type="number" id="ov-global-read" value="${read}" min="0" style="padding:0.4rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.75rem; font-weight:600;">Unique Replies</label>
                    <input type="number" id="ov-global-replies" value="${replies}" min="0" style="padding:0.4rem;">
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:0.5rem; gap:0.5rem;">
                <button type="button" class="btn secondary sm" onclick="resetOverride('meta_direct', 'global')">Reset Auto Calculation</button>
                <button type="button" class="btn primary sm" onclick="submitGlobalOverride()">Save Override</button>
            </div>
        </div>
    `;
    showModal(`Edit Overall Meta Insights Summary`, contentHtml);
};

window.submitTplOverride = async function (id) {
    const data = {
        sent: parseInt(document.getElementById('ov-tpl-sent')?.value || 0),
        delivered: parseInt(document.getElementById('ov-tpl-delivered')?.value || 0),
        read: parseInt(document.getElementById('ov-tpl-read')?.value || 0),
        replies: parseInt(document.getElementById('ov-tpl-replies')?.value || 0),
        cost_per_delivered: parseFloat(document.getElementById('ov-tpl-rate')?.value || 0),
        amount_spent: parseFloat(document.getElementById('ov-tpl-spent')?.value || 0)
    };
    try {
        const res = await apiFetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_override', type: 'template', target_id: id, data })
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadUsageAnalytics();
        } else {
            showModal('Error', result.error || 'Failed to save template override');
        }
    } catch (e) { showModal('Error', e.message); }
};

window.submitCoOverride = async function (id) {
    const data = {
        wa_marketing_count: parseInt(document.getElementById('ov-co-m')?.value || 0),
        wa_utility_count: parseInt(document.getElementById('ov-co-u')?.value || 0),
        wa_auth_count: parseInt(document.getElementById('ov-co-a')?.value || 0),
        email_count: parseInt(document.getElementById('ov-co-email')?.value || 0),
        sms_count: parseInt(document.getElementById('ov-co-sms')?.value || 0),
        est_cost: parseFloat(document.getElementById('ov-co-cost')?.value || 0)
    };
    try {
        const res = await apiFetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_override', type: 'company_usage', target_id: id, data })
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadUsageAnalytics();
        } else {
            showModal('Error', result.error || 'Failed to save company usage override');
        }
    } catch (e) { showModal('Error', e.message); }
};

window.submitGlobalOverride = async function () {
    const data = {
        total_amount_spent: parseFloat(document.getElementById('ov-global-spent')?.value || 0),
        total_sent: parseInt(document.getElementById('ov-global-sent')?.value || 0),
        total_delivered: parseInt(document.getElementById('ov-global-delivered')?.value || 0),
        total_read: parseInt(document.getElementById('ov-global-read')?.value || 0),
        unique_replies: parseInt(document.getElementById('ov-global-replies')?.value || 0)
    };
    try {
        const res = await apiFetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_override', type: 'meta_direct', target_id: 'global', data })
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadUsageAnalytics();
        } else {
            showModal('Error', result.error || 'Failed to save global insights override');
        }
    } catch (e) { showModal('Error', e.message); }
};

window.resetOverride = async function (type, targetId) {
    try {
        const res = await apiFetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset_override', type, target_id: targetId })
        });
        const result = await res.json();
        if (result.success) {
            closeModal();
            loadUsageAnalytics();
        } else {
            showModal('Error', result.error || 'Failed to reset override');
        }
    } catch (e) { showModal('Error', e.message); }
};

window.calculateEstimatorCost = function calculateEstimatorCost() {
    const marketSelect = document.getElementById('calc-market');
    const elMarketing = document.getElementById('calc-wa-marketing');
    const elUtility = document.getElementById('calc-wa-utility');
    const elAuth = document.getElementById('calc-wa-auth');
    const elService = document.getElementById('calc-wa-service');
    const elEmail = document.getElementById('calc-email-count');
    const elSms = document.getElementById('calc-sms-count');
    const elResult = document.getElementById('calc-result-total');

    if (!marketSelect || !elResult) return;

    const opt = marketSelect.options[marketSelect.selectedIndex];
    const rateM = parseFloat(opt.getAttribute('data-m') || 0.8631);
    const rateU = parseFloat(opt.getAttribute('data-u') || 0.1150);
    const rateA = parseFloat(opt.getAttribute('data-a') || 0.1150);
    const rateService = 0.0000;
    const rateEmail = 0.0500;
    const rateSms = 0.2500;

    const cntM = parseFloat(elMarketing?.value || 0);
    const cntU = parseFloat(elUtility?.value || 0);
    const cntA = parseFloat(elAuth?.value || 0);
    const cntS = parseFloat(elService?.value || 0);
    const cntEmail = parseFloat(elEmail?.value || 0);
    const cntSms = parseFloat(elSms?.value || 0);

    const total = (cntM * rateM) + (cntU * rateU) + (cntA * rateA) + (cntS * rateService) + (cntEmail * rateEmail) + (cntSms * rateSms);
    elResult.textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

window.editCompany = function editCompany(id) {
    openCompanyModal(id);
};

window.saveCompany = async function saveCompany(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('company-id-edit').value;
    const name = document.getElementById('comp-name').value;
    const email = document.getElementById('comp-email')?.value || '';
    const phone = document.getElementById('comp-phone')?.value || '';
    const whatsapp_phone_number_id = (document.getElementById('comp-phone-id')?.value || '').trim();
    const whatsapp_business_account_id = (document.getElementById('comp-waba-id')?.value || '').trim();
    const whatsapp_access_token = (document.getElementById('comp-access-token')?.value || '').trim();
    const whatsapp_verify_token = (document.getElementById('comp-verify-token')?.value || '').trim();

    let comp = null;
    if (id && Array.isArray(allCompanies)) {
        comp = allCompanies.find(c => String(c.id) === String(id));
    }
    const isMaster = comp && ((comp.name || '').toLowerCase().trim() === 'inspenox' || (comp.slug && comp.slug.toLowerCase() === 'inspenox') || String(comp.id) === 'default' || comp.is_parent === true || comp.is_master === true);
    const isPaid = comp && (comp.subscription_status === 'active' && comp.subscription_plan && comp.subscription_plan.toLowerCase() !== 'none');

    const hasCreds = whatsapp_phone_number_id || (currentModalPhoneNumbers && currentModalPhoneNumbers.length > 0) || whatsapp_business_account_id || whatsapp_access_token;
    if (id && comp && !isMaster && !isPaid && hasCreds) {
        showModal('Subscription Required', 'Active Subscription Required: You must subscribe to an Inspenox plan to configure Meta WhatsApp Business API credentials.');
        return;
    }

    const btn = document.getElementById('btn-save-company');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Saving...';
    }

    try {
        const method = id ? 'PUT' : 'POST';
        const body = { name, email, phone };
        if (id) {
            body.id = id;
            if (isMaster || isPaid) {
                body.whatsapp_phone_numbers = currentModalPhoneNumbers;
                const defPhone = currentModalPhoneNumbers.find(p => p.is_default) || currentModalPhoneNumbers[0];
                body.whatsapp_phone_number_id = defPhone ? defPhone.phone_number_id : whatsapp_phone_number_id;
                body.whatsapp_business_account_id = whatsapp_business_account_id;
                body.whatsapp_access_token = whatsapp_access_token;
                body.whatsapp_verify_token = whatsapp_verify_token || 'manasageetha';
            }
        }

        const res = await apiFetch('/api/companies', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (data.success) {
            closeCompanyModal();
            loadCompanies();
            loadCompaniesSettings();
            showModal('Success', id ? 'Company updated successfully!' : 'New company created successfully!');
        } else {
            showModal('Error', data.error || 'Failed to save company credentials.');
        }
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Save Company Account';
        }
    }
};

window.deleteCompany = function deleteCompany(id) {
    const comp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(id)) : null;
    if (comp && ((comp.name || '').toLowerCase().trim() === 'inspenox' || (comp.slug && comp.slug.toLowerCase() === 'inspenox') || String(id) === 'default' || comp.is_parent === true)) {
        showModal('Protected Company', 'Inspenox Business Suite is the primary parent organization and cannot be deleted.');
        return;
    }

    const compName = comp ? comp.name : `Company #${id}`;

    showModal('Delete Company Account', `Are you sure you want to permanently delete company "${compName}" and its WhatsApp API settings? This action cannot be undone.`, 'confirm', async () => {
        try {
            const res = await apiFetch(`/api/companies?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                if (currentCompanyId === String(id)) {
                    currentCompanyId = 'default';
                    localStorage.setItem('inspenox_company_id', 'default');
                }
                loadCompaniesSettings();
                loadCompanies();
                showModal('Success', `Company "${compName}" deleted permanently.`);
            } else {
                showModal('Error', data.error || 'Failed to delete company.');
            }
        } catch (e) {
            showModal('Error', e.message || 'Error deleting company.');
        }
    }, 'Delete Company', 'btn danger');
};

