// --- Helper Functions ---
function formatIndiaPhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) {
        return '91' + digits;
    } else if (digits.length > 10) {
        return '91' + digits.slice(-10);
    }
    return digits;
}

function formatDisplayPhone(phone) {
    const formatted = formatIndiaPhone(phone);
    if (formatted.length === 12 && formatted.startsWith('91')) {
        return `+91 ${formatted.slice(2, 7)} ${formatted.slice(7)}`;
    }
    return '+' + formatted;
}

function getInitial(name) {
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase();
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

// --- Thumbnail & Media Preview Helpers ---
function generateImageThumbnail(file, maxWidth = 380) {
    return new Promise((resolve) => {
        if (!file || !file.type || !file.type.startsWith('image')) return resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / Math.max(img.width, maxWidth);
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

function generateVideoThumbnail(file, maxWidth = 380) {
    return new Promise((resolve) => {
        try {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.src = url;
            video.currentTime = 0.5;
            video.muted = true;
            video.playsInline = true;
            video.onloadeddata = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / Math.max(video.videoWidth || 380, maxWidth);
                canvas.width = Math.round((video.videoWidth || 380) * scale);
                canvas.height = Math.round((video.videoHeight || 240) * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            video.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };
        } catch (e) {
            resolve(null);
        }
    });
}

window.openMediaPreview = function openMediaPreview(url, isVideo, title) {
    const modal = document.getElementById('media-preview-modal');
    const titleEl = document.getElementById('media-preview-title');
    const bodyEl = document.getElementById('media-preview-body');
    if (!modal || !bodyEl) return;

    if (titleEl) titleEl.textContent = title || 'Media Preview';

    if (url) {
        if (isVideo) {
            bodyEl.innerHTML = `<video src="${url}" controls autoplay style="max-width:100%; max-height:65vh; border-radius:8px; display:block; margin:0 auto;"></video>`;
        } else {
            bodyEl.innerHTML = `<img src="${url}" alt="${title}" style="max-width:100%; max-height:65vh; object-fit:contain; border-radius:8px; display:block; margin:0 auto;">`;
        }
    } else {
        bodyEl.innerHTML = `<div style="padding:2rem; color:var(--text-muted); text-align:center;">No direct media preview stream available for this file.<br><span style="font-size:0.8rem; margin-top:0.5rem; display:block;">Meta Cloud ID is active & ready for broadcasting.</span></div>`;
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeMediaPreview = function closeMediaPreview() {
    const modal = document.getElementById('media-preview-modal');
    if (modal) {
        const bodyEl = document.getElementById('media-preview-body');
        if (bodyEl) bodyEl.innerHTML = '';
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

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

document.getElementById('company-switcher')?.addEventListener('change', (e) => {
    currentCompanyId = e.target.value;
    localStorage.setItem('inspenox_company_id', currentCompanyId);

    updateBrandingForActiveCompany();

    const isSuper = isSuperAdmin();
    const secNav = document.getElementById('nav-item-security');
    const subNav = document.getElementById('nav-item-subscriptions');
    if (secNav) secNav.style.display = isSuper ? 'flex' : 'none';
    if (subNav) subNav.style.display = 'flex';

    if (typeof updateBroadcastSenderPhoneSelect === 'function') {
        updateBroadcastSenderPhoneSelect();
    }

    const activeView = localStorage.getItem('activeView') || 'dashboard';
    switchView(activeView, false);
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
                tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No company record found.</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load companies settings.</td></tr>`;
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
                tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No users registered for this company yet.</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load user accounts.</td></tr>`;
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
                    <div class="dash-list-item" style="padding:0.75rem; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.75rem;">
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
                    tbodyCompanies.innerHTML = `<tr><td colspan="${coColspanVal}" class="empty-state">No company API usage data recorded yet.</td></tr>`;
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
        if (tbodyTemplates) tbodyTemplates.innerHTML = `<tr><td colspan="${colspanVal}" class="empty-state">Failed to load direct Meta template insights.</td></tr>`;
        if (tbodyCompanies) tbodyCompanies.innerHTML = `<tr><td colspan="${coColspanVal}" class="empty-state">Failed to load API usage statistics.</td></tr>`;
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
            tbodyTemplates.innerHTML = `<tr><td colspan="${colspanVal}" class="empty-state">No Meta template analytics recorded yet for your account.</td></tr>`;
        } else {
            tbodyTemplates.innerHTML = `
                <tr>
                    <td colspan="${colspanVal}" class="empty-state" style="padding: 2.5rem 1.5rem; text-align: center;">
                        <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.35rem;">No templates match your filters</div>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0 0 0.85rem 0;">Try adjusting your search terms, category, or language.</p>
                        <button type="button" class="btn secondary sm" onclick="resetTemplateFilters()">Clear Filters</button>
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

// --- Globals ---
let templatesCache = [];
let selectedCustomerIds = [];
let activeInboxCustomer = null;

window.openChangePass = function openChangePass() {
    const modal = document.getElementById('change-password-modal');
    if (modal) {
        const errB = document.getElementById('change-pass-error-banner');
        const succB = document.getElementById('change-pass-success-banner');
        if (errB) errB.style.display = 'none';
        if (succB) succB.style.display = 'none';
        document.getElementById('change-password-form')?.reset();
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeChangePass = function closeChangePass() {
    const modal = document.getElementById('change-password-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.submitChangePass = async function submitChangePass(e) {
    if (e) e.preventDefault();
    const currentPassword = document.getElementById('change-pass-current')?.value || '';
    const newPassword = document.getElementById('change-pass-new')?.value || '';
    const confirmPassword = document.getElementById('change-pass-confirm')?.value || '';

    const errorBanner = document.getElementById('change-pass-error-banner');
    const successBanner = document.getElementById('change-pass-success-banner');
    const submitBtn = document.getElementById('btn-submit-change-pass');

    if (errorBanner) errorBanner.style.display = 'none';
    if (successBanner) successBanner.style.display = 'none';

    if (!newPassword) {
        if (errorBanner) {
            errorBanner.textContent = '⚠️ New password is required!';
            errorBanner.style.display = 'block';
        }
        return;
    }

    if (newPassword !== confirmPassword) {
        if (errorBanner) {
            errorBanner.textContent = '⚠️ New passwords do not match!';
            errorBanner.style.display = 'block';
        }
        return;
    }

    if (newPassword.length < 6) {
        if (errorBanner) {
            errorBanner.textContent = '⚠️ New password must be at least 6 characters long!';
            errorBanner.style.display = 'block';
        }
        return;
    }

    let username = 'admin';
    try {
        const storedUser = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}');
        if (storedUser.username) username = storedUser.username;
    } catch (err) { }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Updating...';
    }

    try {
        const res = await apiFetch('/api/auth?action=change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, currentPassword, newPassword })
        });
        const data = await res.json();

        if (data.success) {
            if (successBanner) {
                successBanner.textContent = '✅ Password updated successfully!';
                successBanner.style.display = 'block';
            }
            document.getElementById('change-password-form')?.reset();
            setTimeout(() => {
                window.closeChangePass();
            }, 1800);
        } else {
            if (errorBanner) {
                errorBanner.textContent = `⚠️ ${data.error || 'Failed to change password'}`;
                errorBanner.style.display = 'block';
            }
        }
    } catch (err) {
        if (errorBanner) {
            errorBanner.textContent = `⚠️ Error: ${err.message}`;
            errorBanner.style.display = 'block';
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Update Password';
        }
    }
};
let activeCustomerData = null;
let inboxPollInterval = null;
let allCustomers = [];
let filteredCustomers = [];
let inboxCustomersList = [];
var availableTags = [];
var pendingExcelCustomers = [];
var currentInboxFilter = 'all';
var activeInboxTagFilter = null;
let currentCustomersPage = 1;
const CUSTOMERS_PER_PAGE = 10;

// --- Modal Logic ---
window.closeModal = function () {
    const overlay = document.getElementById('app-modal');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
};

function showModal(title, message, type = 'info', onConfirm = null, confirmText = 'OK', confirmClass = null) {
    const overlay = document.getElementById('app-modal');
    if (!overlay) return;
    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = title;

    const msgEl = document.getElementById('modal-message');
    if (msgEl) {
        if (typeof message === 'string' && message.includes('<') && message.includes('>')) {
            msgEl.innerHTML = message;
        } else {
            msgEl.textContent = message;
        }
    }

    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newConfirm.disabled = false;
    newConfirm.removeAttribute('disabled');
    newConfirm.style.pointerEvents = 'auto';
    newConfirm.style.opacity = '1';
    newConfirm.style.cursor = 'pointer';

    newCancel.disabled = false;
    newCancel.removeAttribute('disabled');
    newCancel.style.pointerEvents = 'auto';
    newCancel.style.opacity = '1';
    newCancel.style.cursor = 'pointer';

    if (type === 'loading') {
        newCancel.style.display = 'none';
        newConfirm.style.display = 'none';
    } else if (type === 'confirm') {
        newCancel.style.display = 'inline-block';
        newConfirm.style.display = 'inline-block';
        newConfirm.textContent = confirmText || 'Yes, Proceed';
        newConfirm.className = confirmClass || 'btn primary';
    } else {
        newCancel.style.display = 'none';
        newConfirm.style.display = 'inline-block';
        newConfirm.textContent = 'OK';
        newConfirm.className = 'btn primary';
    }

    newCancel.addEventListener('click', () => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    });
    newConfirm.addEventListener('click', async () => {
        if (onConfirm) {
            newConfirm.innerHTML = '<span class="spinner"></span> Processing...';
            newConfirm.disabled = true;
            try { await onConfirm(); } catch (e) { console.error(e); }
            newConfirm.disabled = false;
        }
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    });

    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
}

// --- Theme & Navigation & UI Logic ---
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);

themeToggle?.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
});

// Mobile menu
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarNav = document.getElementById('sidebar-nav');

mobileMenuBtn?.addEventListener('click', () => {
    sidebarNav?.classList.toggle('active');
});

// Close mobile nav on click outside
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebarNav?.classList.contains('active')) {
        if (!sidebarNav.contains(e.target) && !mobileMenuBtn?.contains(e.target)) {
            sidebarNav.classList.remove('active');
        }
    }
});

window.toggleNavGroup = function toggleNavGroup(headerEl) {
    if (!headerEl) return;
    const group = headerEl.closest('.nav-group');
    if (group) {
        group.classList.toggle('collapsed');
    }
};

/* ========================================================
   Subscriptions & Billing State & Instant UI Engine
   ======================================================== */
const DEFAULT_SUBSCRIPTION_PLANS = [
    {
        id: 'starter',
        name: 'Starter Tier',
        description: 'Perfect for small businesses beginning their automated WhatsApp messaging journey.',
        price_monthly: 999,
        price_4months: 3596, // ~10% off (₹899/mo)
        price_6months: 5095, // ~15% off (₹849/mo)
        price_annual: 9590,  // ~20% off (₹799/mo)
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
        price_4months: 8996,  // ~10% off (₹2,249/mo)
        price_6months: 12745, // ~15% off (₹2,124/mo)
        price_annual: 23990,  // ~20% off (₹1,999/mo)
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
        price_annual: 57590,  // ~20% off (₹4,799/mo)
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

let currentBillingCycle = 'monthly';
let allSubscriptionPlans = [...DEFAULT_SUBSCRIPTION_PLANS];
let allCouponsList = [];
let allPaymentLogsList = [];
let activeCompanyPlanName = null;

function getPlanCyclePrice(plan, cycle) {
    if (!plan) return 0;
    const c = String(cycle || 'monthly').toLowerCase();
    if (c === '4_months' || c === '4months') {
        return plan.price_4months || Math.round(plan.price_monthly * 4 * 0.9);
    }
    if (c === '6_months' || c === '6months') {
        return plan.price_6months || Math.round(plan.price_monthly * 6 * 0.85);
    }
    if (c === 'annual' || c === '12_months' || c === 'year') {
        return plan.price_annual || Math.round(plan.price_monthly * 12 * 0.8);
    }
    return plan.price_monthly;
}
window.getPlanCyclePrice = getPlanCyclePrice;

function getCyclePeriodInfo(cycle) {
    const c = String(cycle || 'monthly').toLowerCase();
    if (c === '4_months' || c === '4months') {
        return { text: '/4 months', badge: '✨ Includes 10% bundle discount', label: '4 Months' };
    }
    if (c === '6_months' || c === '6months') {
        return { text: '/6 months', badge: '✨ Includes 15% bundle discount', label: '6 Months' };
    }
    if (c === 'annual' || c === '12_months' || c === 'year') {
        return { text: '/year', badge: '✨ Includes 20% annual discount', label: 'Annual (12 Months)' };
    }
    return { text: '/month', badge: '', label: 'Monthly' };
}
window.getCyclePeriodInfo = getCyclePeriodInfo;

function updateCompanySubscriptionStatusUI() {
    const coId = getCompanyId();
    const activeComp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;

    // Check if subscription has expired based on stored subscription_expires_at
    const isMaster = !!(activeComp && ((activeComp.slug && activeComp.slug.toLowerCase() === 'inspenox') || (activeComp.name && activeComp.name.toLowerCase() === 'inspenox')));
    const isExpired = !isMaster && !!(activeComp && activeComp.subscription_expires_at && (new Date(activeComp.subscription_expires_at) < new Date()));
    const hasActiveSub = !!(activeComp && !isExpired && activeComp.subscription_status === 'active' && activeComp.subscription_plan && activeComp.subscription_plan.toLowerCase() !== 'none');
    activeCompanyPlanName = hasActiveSub ? activeComp.subscription_plan : null;

    // 1. Update Company Workspace Hero Banner (Shown for Child / Tenant Companies)
    const elHeroPlanName = document.getElementById('sub-hero-plan-name');
    const elHeroBadge = document.getElementById('sub-hero-status-badge');
    const elHeroDesc = document.getElementById('sub-hero-plan-desc');
    const elHeroIcon = document.getElementById('sub-hero-icon-container');

    let cycleInfo = getCyclePeriodInfo(activeComp?.subscription_billing_cycle || 'monthly');

    if (hasActiveSub) {
        if (elHeroPlanName) {
            elHeroPlanName.textContent = `${activeCompanyPlanName} (${cycleInfo.label})`;
            elHeroPlanName.style.color = '#10b981';
        }
        if (elHeroBadge) {
            elHeroBadge.textContent = 'Active ✅';
            elHeroBadge.style.background = 'rgba(16, 185, 129, 0.15)';
            elHeroBadge.style.color = '#10b981';
        }
        if (elHeroDesc) {
            if (activeComp.subscription_expires_at) {
                const expDate = new Date(activeComp.subscription_expires_at);
                const now = new Date();
                const diffMs = expDate - now;
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                const formattedExp = expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                elHeroDesc.textContent = `Valid until ${formattedExp} (${diffDays} day${diffDays === 1 ? '' : 's'} remaining) • WhatsApp broadcast & marketing automation unlocked.`;
            } else {
                elHeroDesc.textContent = 'Verified subscription active via Razorpay. WhatsApp broadcast & marketing automation unlocked.';
            }
        }
        if (elHeroIcon) {
            elHeroIcon.style.color = '#10b981';
            elHeroIcon.style.background = 'rgba(16, 185, 129, 0.15)';
            elHeroIcon.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        }
    } else if (isExpired) {
        const expDate = new Date(activeComp.subscription_expires_at);
        const formattedExp = expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        if (elHeroPlanName) {
            elHeroPlanName.textContent = `${activeComp.subscription_plan || 'Subscription'} (Expired)`;
            elHeroPlanName.style.color = '#ef4444';
        }
        if (elHeroBadge) {
            elHeroBadge.textContent = 'Expired ⚠️';
            elHeroBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elHeroBadge.style.color = '#ef4444';
        }
        if (elHeroDesc) {
            elHeroDesc.textContent = `Your subscription expired on ${formattedExp}. Please renew below to reactivate automated WhatsApp messaging.`;
        }
        if (elHeroIcon) {
            elHeroIcon.style.color = '#ef4444';
            elHeroIcon.style.background = 'rgba(239, 68, 68, 0.12)';
            elHeroIcon.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        }
    } else {
        if (elHeroPlanName) {
            elHeroPlanName.textContent = 'No Active Plan (Unsubscribed)';
            elHeroPlanName.style.color = 'var(--text-muted)';
        }
        if (elHeroBadge) {
            elHeroBadge.textContent = 'Unsubscribed';
            elHeroBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elHeroBadge.style.color = '#ef4444';
        }
        if (elHeroDesc) {
            elHeroDesc.textContent = 'Subscribe to an Inspenox package below to activate WhatsApp broadcasts, templates, and contact automation.';
        }
        if (elHeroIcon) {
            elHeroIcon.style.color = '#ef4444';
            elHeroIcon.style.background = 'rgba(239, 68, 68, 0.12)';
            elHeroIcon.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        }
    }

    // 2. Update Superadmin Top Stat Cards
    const elStatPlanName = document.getElementById('sub-stat-plan-name');
    const elStatBadge = document.getElementById('sub-stat-status-badge');
    const elStatCycle = document.getElementById('sub-stat-plan-cycle');

    if (hasActiveSub) {
        if (elStatPlanName) {
            elStatPlanName.textContent = activeCompanyPlanName;
            elStatPlanName.style.color = 'var(--primary)';
        }
        if (elStatBadge) {
            elStatBadge.textContent = 'Active';
            elStatBadge.style.background = 'rgba(16,185,129,0.15)';
            elStatBadge.style.color = '#10b981';
        }
        if (elStatCycle) {
            if (activeComp?.subscription_expires_at) {
                const formattedExp = new Date(activeComp.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                elStatCycle.textContent = `Valid until ${formattedExp} (${cycleInfo.label})`;
            } else {
                elStatCycle.textContent = 'Renewing via Razorpay';
            }
        }
    } else if (isExpired) {
        if (elStatPlanName) {
            elStatPlanName.textContent = activeComp.subscription_plan || 'Expired';
            elStatPlanName.style.color = '#ef4444';
        }
        if (elStatBadge) {
            elStatBadge.textContent = 'Expired ⚠️';
            elStatBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elStatBadge.style.color = '#ef4444';
        }
        if (elStatCycle) {
            const formattedExp = new Date(activeComp.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            elStatCycle.textContent = `Expired on ${formattedExp}`;
        }
    } else {
        if (elStatPlanName) {
            elStatPlanName.textContent = 'None';
            elStatPlanName.style.color = 'var(--text-muted)';
        }
        if (elStatBadge) {
            elStatBadge.textContent = 'Not Subscribed';
            elStatBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elStatBadge.style.color = '#ef4444';
        }
        if (elStatCycle) elStatCycle.textContent = 'Select a package below to subscribe';
    }
}
window.updateCompanySubscriptionStatusUI = updateCompanySubscriptionStatusUI;

function getPlanRank(planIdOrName) {
    if (!planIdOrName) return 0;
    const str = String(planIdOrName).toLowerCase();
    if (str.includes('enterprise')) return 3;
    if (str.includes('growth')) return 2;
    if (str.includes('starter')) return 1;
    return 0;
}
window.getPlanRank = getPlanRank;

function renderPricingCards() {
    const grid = document.getElementById('pricing-plans-grid');
    if (!grid) return;

    const plansToRender = (Array.isArray(allSubscriptionPlans) && allSubscriptionPlans.length > 0)
        ? allSubscriptionPlans
        : DEFAULT_SUBSCRIPTION_PLANS;

    const cycleInfo = getCyclePeriodInfo(currentBillingCycle);
    const hasActiveSub = !!activeCompanyPlanName;
    const activeRank = hasActiveSub ? getPlanRank(activeCompanyPlanName) : 0;

    grid.innerHTML = plansToRender.map(plan => {
        const price = getPlanCyclePrice(plan, currentBillingCycle);
        const periodText = cycleInfo.text;

        const planRank = getPlanRank(plan.id);
        const isCurrentActive = hasActiveSub && (activeRank === planRank);
        const isUpgrade = hasActiveSub && (planRank > activeRank);
        const isDowngrade = hasActiveSub && (planRank < activeRank);

        const featureItems = plan.features.map(f => `
            <li class="pricing-feature-item">
                <svg class="pricing-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>${f}</span>
            </li>
        `).join('');

        let headerBadgeHtml = '';
        if (isCurrentActive) {
            headerBadgeHtml = '<span class="window-badge" style="background:rgba(0,168,132,0.18); color:var(--primary); font-weight:700;">CURRENT PLAN</span>';
        } else if (isUpgrade) {
            headerBadgeHtml = '<span class="window-badge" style="background:rgba(59,130,246,0.18); color:#3b82f6; font-weight:700;">UPGRADE AVAILABLE</span>';
        } else if (isDowngrade) {
            headerBadgeHtml = '<span class="window-badge" style="background:rgba(100,116,139,0.15); color:var(--text-muted); font-weight:600;">LOWER TIER</span>';
        }

        let actionButtonHtml = '';
        if (!hasActiveSub) {
            actionButtonHtml = `
                <button type="button" class="btn ${plan.popular ? 'primary' : 'secondary'}" 
                        onclick="openSubscribeModal('${plan.id}')" 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 700; border-radius: 10px; font-size: 0.925rem;">
                    Subscribe & Boost Sales 🚀
                </button>
            `;
        } else if (isCurrentActive) {
            actionButtonHtml = `
                <button type="button" class="btn primary" 
                        onclick="openSubscribeModal('${plan.id}')" 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 700; border-radius: 10px; font-size: 0.925rem;">
                    Renew / Extend Subscription 💳
                </button>
            `;
        } else if (isUpgrade) {
            actionButtonHtml = `
                <button type="button" class="btn primary" 
                        onclick="openSubscribeModal('${plan.id}')" 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 700; border-radius: 10px; font-size: 0.925rem; background: linear-gradient(135deg, #00a884 0%, #3b82f6 100%); border: none;">
                    Upgrade to ${plan.name} ⚡
                </button>
            `;
        } else if (isDowngrade) {
            actionButtonHtml = `
                <button type="button" class="btn secondary" disabled 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 600; border-radius: 10px; font-size: 0.85rem; opacity: 0.55; cursor: not-allowed; background: var(--bg-dark); border: 1px dashed var(--border); color: var(--text-muted);" 
                        title="You are currently subscribed to a higher tier plan. Downgrades are disabled.">
                    Current Plan is Higher (Downgrade Disabled) 🔒
                </button>
            `;
        }

        const strikedPrice = price * 2;

        return `
            <div class="pricing-card ${plan.popular && !isCurrentActive && !isDowngrade ? 'popular' : ''}" style="${isDowngrade ? 'opacity: 0.82;' : ''}">
                ${plan.popular && !isCurrentActive && !isDowngrade ? '<div class="pricing-badge-popular">⭐ Recommended</div>' : ''}
                
                <div class="pricing-card-header">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 class="pricing-title">${plan.name}</h3>
                        ${headerBadgeHtml}
                    </div>
                    <p class="pricing-desc">${plan.description}</p>
                </div>

                <div class="pricing-price-box">
                    <div style="display:flex; align-items:baseline; gap:0.4rem; flex-wrap:wrap;">
                        <span class="pricing-amount">₹${price.toLocaleString('en-IN')}</span>
                        <span class="pricing-strikethrough" style="font-size:1.2rem; font-weight:600; color:var(--text-muted); text-decoration:line-through; text-decoration-thickness:2px; text-decoration-color:#ef4444; opacity:0.75; margin-left:0.35rem;">₹${strikedPrice.toLocaleString('en-IN')}</span>
                        <span class="pricing-period">${periodText}</span>
                    </div>
                    ${cycleInfo.badge ? `<div style="font-size:0.75rem; color:#10b981; font-weight:600; margin-top:0.25rem;">${cycleInfo.badge}</div>` : ''}
                </div>

                <ul class="pricing-features-list">
                    ${featureItems}
                </ul>

                ${actionButtonHtml}
            </div>
        `;
    }).join('');
}
window.renderPricingCards = renderPricingCards;

function setBillingCycle(cycle) {
    currentBillingCycle = cycle;
    const subSelect = document.getElementById('sub-billing-cycle-select');
    if (subSelect && subSelect.value !== cycle) {
        subSelect.value = cycle;
    }
    const checkoutSelect = document.getElementById('checkout-cycle-select');
    if (checkoutSelect && checkoutSelect.value !== cycle) {
        checkoutSelect.value = cycle;
    }
    renderPricingCards();
}
window.setBillingCycle = setBillingCycle;

function toggleBillingCycle() {
    setBillingCycle(currentBillingCycle === 'monthly' ? 'annual' : 'monthly');
}
window.toggleBillingCycle = toggleBillingCycle;

function switchSubTab(tabName) {
    const isSuper = isSuperAdmin();
    // Strictly prevent non-superadmin or other companies from accessing coupons or platform audit logs
    if (!isSuper && (tabName === 'coupons' || tabName === 'logs')) {
        tabName = 'plans';
    }

    const panels = {
        plans: document.getElementById('sub-tab-panel-plans'),
        receipts: document.getElementById('sub-tab-panel-receipts'),
        coupons: document.getElementById('sub-tab-panel-coupons'),
        logs: document.getElementById('sub-tab-panel-logs')
    };
    const buttons = {
        plans: document.getElementById('tab-btn-sub-plans'),
        receipts: document.getElementById('tab-btn-sub-receipts'),
        coupons: document.getElementById('tab-btn-sub-coupons'),
        logs: document.getElementById('tab-btn-sub-logs')
    };

    Object.keys(panels).forEach(key => {
        if (panels[key]) panels[key].style.display = (key === tabName) ? 'block' : 'none';
        if (buttons[key]) {
            if (key === tabName) {
                buttons[key].classList.add('active');
            } else {
                buttons[key].classList.remove('active');
            }
        }
    });

    if (tabName === 'receipts' && typeof window.loadCompanyReceipts === 'function') window.loadCompanyReceipts();
    if (tabName === 'coupons' && isSuper && typeof window.loadCouponsList === 'function') window.loadCouponsList();
    if (tabName === 'logs' && isSuper && typeof window.loadPaymentLogs === 'function') window.loadPaymentLogs();
}
window.switchSubTab = switchSubTab;

async function loadSubscriptions() {
    // 1. Instantly render pricing cards and current active company plan without waiting for network
    updateCompanySubscriptionStatusUI();
    renderPricingCards();

    // 2. Strict Superadmin vs Other Companies Configuration
    const isSuper = isSuperAdmin();
    const btnCoupons = document.getElementById('tab-btn-sub-coupons');
    const btnLogs = document.getElementById('tab-btn-sub-logs');
    const btnReceipts = document.getElementById('tab-btn-sub-receipts');
    const panelCoupons = document.getElementById('sub-tab-panel-coupons');
    const panelLogs = document.getElementById('sub-tab-panel-logs');
    const statSavings = document.getElementById('sub-stat-card-coupons');
    const subTabsBar = document.getElementById('sub-tabs-container');
    const adminStatsGrid = document.getElementById('sub-superadmin-stats-grid');
    const companyHeroBanner = document.getElementById('sub-company-hero-banner');

    if (isSuper) {
        // Superadmin: Show the full admin stats grid (Active Plan, Gateway, Total Orders, Savings)
        if (adminStatsGrid) adminStatsGrid.style.display = 'grid';
        if (companyHeroBanner) companyHeroBanner.style.display = 'none';

        // Superadmin sees all 4 sub-tabs
        if (btnCoupons) btnCoupons.style.display = 'inline-flex';
        if (btnLogs) btnLogs.style.display = 'inline-flex';
        if (statSavings) statSavings.style.display = 'flex';
        if (btnReceipts) btnReceipts.style.display = 'inline-flex';
        if (subTabsBar) subTabsBar.style.display = 'flex';
    } else {
        // Child / Tenant Company ("other companies"):
        // Remove the 2 admin stat cards (Razorpay Gateway & Total Orders Paid) by hiding the admin stats grid
        if (adminStatsGrid) adminStatsGrid.style.display = 'none';
        // Show clean, uncluttered Company Workspace Hero Banner
        if (companyHeroBanner) companyHeroBanner.style.display = 'flex';

        // Strictly hide superadmin features
        if (btnCoupons) btnCoupons.style.display = 'none';
        if (btnLogs) btnLogs.style.display = 'none';
        if (panelCoupons) panelCoupons.style.display = 'none';
        if (panelLogs) panelLogs.style.display = 'none';
        if (statSavings) statSavings.style.display = 'none';

        // Show Subscription Packages & Payment Receipts tabs
        if (btnReceipts) btnReceipts.style.display = 'inline-flex';
        if (subTabsBar) subTabsBar.style.display = 'flex';
    }

    // 3. Asynchronously fetch live plans and gateway status
    try {
        const res = await apiFetch('/api/payments?action=plans');
        const data = await res.json();

        if (data.success && Array.isArray(data.plans) && data.plans.length > 0) {
            allSubscriptionPlans = data.plans;
            renderPricingCards();
        }

        if (isSuper) {
            const elGateway = document.getElementById('sub-stat-gateway-status');
            const elRzpBadge = document.getElementById('sub-stat-rzp-badge');
            if (data.has_keys) {
                if (elGateway) elGateway.textContent = 'Configured ✅';
                if (elRzpBadge) {
                    elRzpBadge.textContent = 'Razorpay Live';
                    elRzpBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                    elRzpBadge.style.color = '#10b981';
                }
            } else {
                if (elGateway) elGateway.textContent = 'Test Mode 🧪';
                if (elRzpBadge) {
                    elRzpBadge.textContent = 'Sandbox / Test';
                    elRzpBadge.style.background = 'rgba(234, 179, 8, 0.15)';
                    elRzpBadge.style.color = '#eab308';
                }
            }
        }
    } catch (err) {
        console.warn('Live subscription plans check:', err);
    }

    // 4. If superadmin, fetch aggregated payment statistics without blocking
    if (isSuper) {
        try {
            const logsRes = await apiFetch('/api/payments?action=logs');
            const logsData = await logsRes.json();
            if (logsData.success && logsData.stats) {
                const s = logsData.stats;
                const elOrders = document.getElementById('sub-stat-orders-count');
                const elRevenue = document.getElementById('sub-stat-total-revenue');
                const elSavings = document.getElementById('sub-stat-savings-claimed');

                if (elOrders) elOrders.textContent = s.total_orders || 0;
                if (elRevenue) elRevenue.textContent = `Total Paid: ₹${Number(s.total_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                if (elSavings) elSavings.textContent = `₹${Number(s.total_discounts || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            }
        } catch (e) { }
    }
}
window.loadSubscriptions = loadSubscriptions;

window.switchView = function switchView(target, pushHistory = true) {
    if (!target) return;

    // Security Control Center is strictly restricted to Superadmin; silently redirect non-superadmin without popup
    if (target === 'security' && !isSuperAdmin()) {
        target = 'dashboard';
        if (pushHistory && history.replaceState) {
            history.replaceState({ view: 'dashboard' }, '', '#dashboard');
        }
    }

    document.querySelectorAll('#sidebar-nav a[data-view]').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('#sidebar-nav .nav-group').forEach(g => g.classList.remove('active-group'));

    const link = document.querySelector(`[data-view="${target}"]`);
    if (link) {
        link.classList.add('active');
        const parentGroup = link.closest('.nav-group');
        if (parentGroup) {
            parentGroup.classList.add('active-group');
            parentGroup.classList.remove('collapsed');
        }
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${target}`)?.classList.add('active');

    localStorage.setItem('activeView', target);
    document.getElementById('sidebar-nav')?.classList.remove('active');

    if (target !== 'inbox') closeChat();

    if (target === 'dashboard') loadDashboard();
    if (target === 'usage') loadUsageAnalytics();
    if (target === 'customers') loadCustomers();
    if (target === 'templates') loadTemplates();
    if (target === 'send') {
        if (typeof loadCampaigns === 'function') loadCampaigns();
        loadCustomersForSelect();
        loadTemplatesForSelect();
        if (typeof updateBroadcastSenderPhoneSelect === 'function') updateBroadcastSenderPhoneSelect();
        if (typeof initVarPickers === 'function') initVarPickers();
    }
    if (target === 'inbox') loadInboxSidebar();
    if (target === 'media') loadMedia();
    if (target === 'settings') loadCompaniesSettings();
    if (target === 'subscriptions') {
        if (typeof loadSubscriptions === 'function') {
            loadSubscriptions();
        } else if (typeof window.loadSubscriptions === 'function') {
            window.loadSubscriptions();
        }
    }
    if (target === 'security') {
        if (typeof loadSecurityLogs === 'function') {
            loadSecurityLogs();
        } else if (typeof window.loadSecurityLogs === 'function') {
            window.loadSecurityLogs();
        }
    }

    if (pushHistory && history.pushState) {
        history.pushState({ view: target }, '', `#${target}`);
    }
}

// Global navigation click handler via event delegation
document.addEventListener('click', (e) => {
    const viewLink = e.target.closest('#sidebar-nav a[data-view]');
    if (viewLink) {
        e.preventDefault();
        const targetView = viewLink.getAttribute('data-view');
        if (targetView) {
            switchView(targetView);
        }
        return;
    }

    const changePassBtn = e.target.closest('#btn-open-reset-pass, #btn-change-pass-nav');
    if (changePassBtn) {
        e.preventDefault();
        document.getElementById('sidebar-nav')?.classList.remove('active');
        window.openChangePass?.();
        return;
    }

    const logoutBtn = e.target.closest('#btn-logout-nav');
    if (logoutBtn) {
        e.preventDefault();
        localStorage.removeItem('inspenox_token');
        localStorage.removeItem('inspenox_user');
        localStorage.removeItem('induio_token');
        localStorage.removeItem('induio_user');
        try { sessionStorage.clear(); } catch (err) { }
        window.location.replace('/login.html');
        return;
    }
});

// SPA Browser Back/Forward Navigation & History Management
window.addEventListener('popstate', (e) => {
    // 1. If any modal is currently visible, close it on back
    const visibleModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (visibleModal) {
        visibleModal.classList.add('hidden');
        return;
    }

    // 2. If inside active chat in Inbox, close chat view and return to contact list
    if (activeInboxCustomer) {
        closeChat();
        if (window.innerWidth <= 768) {
            document.getElementById('inbox-customers-panel')?.classList.remove('hidden');
            document.getElementById('inbox-chat-area')?.classList.add('hidden');
        }
        return;
    }

    // 3. Restore view from history state or hash
    const state = e.state;
    if (state && state.view) {
        switchView(state.view, false);
    } else {
        const hash = window.location.hash.replace('#', '').split('-')[0];
        if (hash && document.getElementById(`view-${hash}`)) {
            switchView(hash, false);
        } else {
            switchView('dashboard', false);
        }
    }
});

window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && document.getElementById(`view-${hash}`)) {
        switchView(hash, false);
    }
});

const initialHash = window.location.hash.replace('#', '').trim();
const savedView = (initialHash && document.getElementById(`view-${initialHash}`))
    ? initialHash
    : (localStorage.getItem('activeView') || 'dashboard');

if (history.replaceState) {
    history.replaceState({ view: savedView }, '', `#${savedView}`);
}
updateSuperAdminNavVisibility();
loadCompanies();
switchView(savedView, false);
if (typeof initVarPickers === 'function') initVarPickers();


// --- Customer Tags Management & Lifecycle Segmentation System ---
if (!Array.isArray(availableTags)) availableTags = [];
if (!Array.isArray(pendingExcelCustomers)) pendingExcelCustomers = [];

const DEFAULT_TAG_PALETTES = {
    'repeat buyers': { cls: 'tag-pill-pink', bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8' },
    'recovered': { cls: 'tag-pill-gray', bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
    'order placed(prepaid)': { cls: 'tag-pill-pink', bg: '#fdf2f8', text: '#db2777', border: '#fbcfe8' },
    'order placed(cod)': { cls: 'tag-pill-purple', bg: '#ede9fe', text: '#7c3aed', border: '#ddd6fe' },
    'loyal': { cls: 'tag-pill-green', bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
    'lost': { cls: 'tag-pill-blue', bg: '#e0f2fe', text: '#0284c7', border: '#bae6fd' },
    'high spenders': { cls: 'tag-pill-purple', bg: '#ede9fe', text: '#7c3aed', border: '#ddd6fe' },
    'curious browsers': { cls: 'tag-pill-mint', bg: '#d1fae5', text: '#047857', border: '#a7f3d0' },
    'at risk': { cls: 'tag-pill-lime', bg: '#ecfccb', text: '#65a30d', border: '#d9f99d' },
    'abandoned cart': { cls: 'tag-pill-lime', bg: '#ecfccb', text: '#65a30d', border: '#d9f99d' }
};

const EXTRA_PALETTES = [
    { cls: 'tag-pill-pink', bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8' },
    { cls: 'tag-pill-purple', bg: '#ede9fe', text: '#7c3aed', border: '#ddd6fe' },
    { cls: 'tag-pill-green', bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
    { cls: 'tag-pill-blue', bg: '#e0f2fe', text: '#0284c7', border: '#bae6fd' },
    { cls: 'tag-pill-mint', bg: '#d1fae5', text: '#047857', border: '#a7f3d0' },
    { cls: 'tag-pill-lime', bg: '#ecfccb', text: '#65a30d', border: '#d9f99d' },
    { cls: 'tag-pill-amber', bg: '#fef3c7', text: '#b45309', border: '#fde68a' }
];

function getTagStyle(tagName) {
    if (!tagName) return { cls: 'tag-pill-gray', styleAttr: '' };
    const clean = String(tagName).trim();
    const lower = clean.toLowerCase();
    if (DEFAULT_TAG_PALETTES[lower]) {
        const pal = DEFAULT_TAG_PALETTES[lower];
        return { cls: pal.cls, styleAttr: `background:${pal.bg}; color:${pal.text}; border-color:${pal.border};` };
    }
    const found = availableTags.find(t => (t.name || '').toLowerCase() === lower);
    if (found && (found.bg_color || found.color)) {
        const bg = found.bg_color || '#f3f4f6';
        const txt = found.text_color || '#4b5563';
        const bdr = found.border_color || '#e5e7eb';
        return { cls: '', styleAttr: `background:${bg}; color:${txt}; border-color:${bdr};` };
    }
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash << 5) - hash + clean.charCodeAt(i);
    const pal = EXTRA_PALETTES[Math.abs(hash) % EXTRA_PALETTES.length];
    return { cls: pal.cls, styleAttr: `background:${pal.bg}; color:${pal.text}; border-color:${pal.border};` };
}

function renderTagPillHtml(tagName, removable = false, context = '') {
    if (!tagName) return '';
    const clean = String(tagName).trim();
    const style = getTagStyle(clean);
    const escaped = clean.replace(/"/g, '&quot;').replace(/'/g, "\\'");
    return `
        <span class="tag-pill ${style.cls}" style="${style.styleAttr}" title="Tag: ${clean}">
            <svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
            <span>${clean}</span>
            ${removable ? `<span class="tag-remove-btn" onclick="removeSelectedTag('${context}', '${escaped}', event)" title="Remove tag">✕</span>` : ''}
        </span>
    `;
}

async function loadTags() {
    try {
        const res = await apiFetch('/api/tags');
        const data = await res.json();
        if (data && Array.isArray(data.tags)) {
            availableTags = data.tags;
        } else {
            availableTags = [
                { name: 'Repeat Buyers' }, { name: 'Recovered' }, { name: 'Order Placed(Prepaid)' },
                { name: 'Order Placed(CoD)' }, { name: 'Loyal' }, { name: 'Lost' },
                { name: 'High Spenders' }, { name: 'Curious Browsers' }, { name: 'At Risk' },
                { name: 'Abandoned Cart' }
            ];
        }
    } catch (err) {
        console.warn('Failed to load tags from API, using fallback defaults:', err);
        availableTags = [
            { name: 'Repeat Buyers' }, { name: 'Recovered' }, { name: 'Order Placed(Prepaid)' },
            { name: 'Order Placed(CoD)' }, { name: 'Loyal' }, { name: 'Lost' },
            { name: 'High Spenders' }, { name: 'Curious Browsers' }, { name: 'At Risk' },
            { name: 'Abandoned Cart' }
        ];
    }
    updateTagFilterDropdown();
    renderTagDropdownItems('form');
    renderTagDropdownItems('excel');
    renderTagDropdownItems('quick');
}

function updateTagFilterDropdown() {
    const sel = document.getElementById('customers-tag-filter');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">🏷️ All Tags (Filter)</option>';
    availableTags.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = `🏷️ ${t.name}`;
        if (t.name === currentVal) opt.selected = true;
        sel.appendChild(opt);
    });
}

function getSelectedTags(context) {
    if (context === 'form') {
        const val = document.getElementById('cust-tags')?.value || '';
        return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (context === 'excel') {
        const val = document.getElementById('excel-import-tags')?.value || '';
        return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    if (context === 'quick') {
        const custId = document.getElementById('quick-tag-cust-id')?.value;
        const cust = allCustomers.find(c => String(c.id) === String(custId));
        return (cust && cust.tags) ? cust.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
    return [];
}

function setSelectedTags(context, tagsArr) {
    const unique = Array.from(new Set(tagsArr.map(s => s.trim()).filter(Boolean)));
    const str = unique.join(', ');
    if (context === 'form') {
        const inp = document.getElementById('cust-tags');
        if (inp) inp.value = str;
    } else if (context === 'excel') {
        const inp = document.getElementById('excel-import-tags');
        if (inp) inp.value = str;
    }
    syncTagSelectorDisplay(context);
    renderTagDropdownItems(context);
}

function syncTagSelectorDisplay(context) {
    if (context === 'quick') return;
    const tags = getSelectedTags(context);
    const container = document.getElementById(context === 'form' ? 'cust-selected-tags-container' : 'excel-selected-tags-container');
    const placeholder = document.getElementById(context === 'form' ? 'cust-tags-placeholder' : 'excel-tags-placeholder');
    if (!container) return;
    container.innerHTML = tags.map(t => renderTagPillHtml(t, true, context)).join('');
    if (placeholder) {
        placeholder.style.display = tags.length > 0 ? 'none' : 'inline';
    }
}

window.removeSelectedTag = function removeSelectedTag(context, tagName, e) {
    if (e) e.stopPropagation();
    const current = getSelectedTags(context);
    const updated = current.filter(t => t.toLowerCase() !== tagName.toLowerCase());
    setSelectedTags(context, updated);
};

window.renderTagDropdownItems = function renderTagDropdownItems(context) {
    const listEl = document.getElementById(`${context}-tag-items-list`);
    if (!listEl) return;
    const searchVal = (document.getElementById(`${context}-tag-search`)?.value || '').toLowerCase().trim();
    const selected = getSelectedTags(context).map(s => s.toLowerCase());

    const filtered = availableTags.filter(t => !searchVal || (t.name || '').toLowerCase().includes(searchVal));

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="font-size:0.775rem; color:var(--text-muted); text-align:center; padding:0.75rem 0;">No matching tags found</div>`;
        return;
    }

    listEl.innerHTML = filtered.map(t => {
        const isChecked = selected.includes((t.name || '').toLowerCase());
        const escaped = (t.name || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");
        return `
            <div class="tag-item-row" onclick="toggleTagOption('${context}', '${escaped}', event)">
                <input type="checkbox" class="tag-checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleTagOption('${context}', '${escaped}', event)">
                ${renderTagPillHtml(t.name)}
            </div>
        `;
    }).join('');
};

window.toggleTagOption = function toggleTagOption(context, tagName, e) {
    if (e && e.target && e.target.type !== 'checkbox') {
        const cb = e.currentTarget.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = !cb.checked;
    }
    const current = getSelectedTags(context);
    const exists = current.some(t => t.toLowerCase() === tagName.toLowerCase());
    let updated = [];
    if (exists) {
        updated = current.filter(t => t.toLowerCase() !== tagName.toLowerCase());
    } else {
        updated = [...current, tagName];
    }

    if (context === 'quick') {
        const custId = document.getElementById('quick-tag-cust-id')?.value;
        const cust = allCustomers.find(c => String(c.id) === String(custId));
        if (cust) {
            cust.tags = updated.join(', ');
        }
        renderTagDropdownItems('quick');
    } else {
        setSelectedTags(context, updated);
    }
};

window.showNewTagInput = function showNewTagInput(context) {
    const box = document.getElementById(`${context}-new-tag-box`);
    const btn = document.getElementById(`${context}-btn-show-new-tag`);
    const input = document.getElementById(`${context}-new-tag-name`);
    if (box) box.classList.add('show');
    if (btn) btn.style.display = 'none';
    if (input) { input.value = ''; input.focus(); }
};

window.cancelNewTag = function cancelNewTag(context) {
    const box = document.getElementById(`${context}-new-tag-box`);
    const btn = document.getElementById(`${context}-btn-show-new-tag`);
    if (box) box.classList.remove('show');
    if (btn) btn.style.display = 'flex';
};

window.submitNewTag = async function submitNewTag(context) {
    const input = document.getElementById(`${context}-new-tag-name`);
    const tagName = (input?.value || '').trim();
    if (!tagName) return;

    try {
        const res = await apiFetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tagName })
        });
        const data = await res.json();
        if (data && (data.success || data.tag)) {
            if (!availableTags.some(t => t.name.toLowerCase() === tagName.toLowerCase())) {
                availableTags.push(data.tag || { name: tagName });
            }
            toggleTagOption(context, tagName);
            cancelNewTag(context);
            updateTagFilterDropdown();
            renderTagDropdownItems('form');
            renderTagDropdownItems('excel');
            renderTagDropdownItems('quick');
        }
    } catch (err) {
        console.error('Failed to create tag:', err);
    }
};

window.toggleTagDropdown = function toggleTagDropdown(context, e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById(`${context}-tag-dropdown-menu`);
    if (!menu) return;
    const isShown = menu.classList.contains('show');

    document.querySelectorAll('.tag-dropdown-menu').forEach(m => m.classList.remove('show'));

    if (!isShown) {
        menu.classList.add('show');
        renderTagDropdownItems(context);
        const searchInput = document.getElementById(`${context}-tag-search`);
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    }
};

window.filterTagDropdown = function filterTagDropdown(context) {
    renderTagDropdownItems(context);
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('.tag-dropdown-menu') && !e.target.closest('.tag-selector-box')) {
        document.querySelectorAll('.tag-dropdown-menu').forEach(m => m.classList.remove('show'));
    }
});

window.openQuickTagModal = function openQuickTagModal(custId, e) {
    if (e) e.stopPropagation();
    const cust = allCustomers.find(c => String(c.id) === String(custId));
    if (!cust) return;

    document.getElementById('quick-tag-cust-id').value = cust.id;
    document.getElementById('quick-tag-cust-name').textContent = `${cust.name} (${cust.phone})`;

    cancelNewTag('quick');
    const searchInput = document.getElementById('quick-tag-search');
    if (searchInput) searchInput.value = '';

    renderTagDropdownItems('quick');
    const modal = document.getElementById('quick-tag-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeQuickTagModal = function closeQuickTagModal() {
    const modal = document.getElementById('quick-tag-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.saveQuickTags = async function saveQuickTags() {
    const custId = document.getElementById('quick-tag-cust-id')?.value;
    const cust = allCustomers.find(c => String(c.id) === String(custId));
    if (!cust) return;

    const btn = document.getElementById('btn-save-quick-tags');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Saving...';
    }

    try {
        const res = await apiFetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: custId,
                tags: cust.tags || ''
            })
        });
        const data = await res.json();
        if (data && data.success) {
            closeQuickTagModal();
            renderCustomersTable();
            showModal('Tags Updated', `Successfully updated tags for ${cust.name}.`);
        }
    } catch (err) {
        console.error('Failed to update tags:', err);
        showModal('Error', 'Failed to update tags.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Save Tags';
        }
    }
};

window.filterCustomersByTag = function filterCustomersByTag(tagVal) {
    const query = (document.getElementById('customers-search')?.value || '').toLowerCase().trim();
    const selectedTag = (tagVal || '').toLowerCase().trim();

    filteredCustomers = allCustomers.filter(c => {
        const matchesQuery = !query || (
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.phone && c.phone.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.company_name && c.company_name.toLowerCase().includes(query)) ||
            (c.tags && c.tags.toLowerCase().includes(query)) ||
            (c.city && c.city.toLowerCase().includes(query))
        );

        const matchesTag = !selectedTag || (
            c.tags && c.tags.split(',').map(s => s.trim().toLowerCase()).includes(selectedTag)
        );

        return matchesQuery && matchesTag;
    });

    currentCustomersPage = 1;
    renderCustomersTable();
};

// --- Customers Logic ---
async function loadCustomers() {
    const tbody = document.getElementById('customers-table-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading customer directory...</span></div></td></tr>`;
    }
    try {
        await loadTags();

        const res = await apiFetch('/api/customers');
        const customers = await res.json();

        if (customers.error) {
            console.error('API Error:', customers.error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="height:100px;">Failed to load customers.</td></tr>`;
            return;
        }

        allCustomers = Array.isArray(customers) ? customers : [];
        filteredCustomers = [...allCustomers];
        currentCustomersPage = 1;

        const statEl = document.getElementById('dash-stat-customers');
        if (statEl) statEl.textContent = allCustomers.length;

        renderCustomersTable();
        syncTagSelectorDisplay('form');
    } catch (e) {
        console.error('Error loading customers:', e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="height:100px;">Error loading data.</td></tr>`;
    }
}

function renderCustomersTable() {
    const tbody = document.getElementById('customers-table-body');
    const pageInfo = document.getElementById('customers-pagination-info');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    if (!tbody) return;

    const totalItems = filteredCustomers.length;
    const totalPages = Math.ceil(totalItems / CUSTOMERS_PER_PAGE) || 1;

    if (currentCustomersPage > totalPages) currentCustomersPage = totalPages;
    if (currentCustomersPage < 1) currentCustomersPage = 1;

    const startIndex = (currentCustomersPage - 1) * CUSTOMERS_PER_PAGE;
    const endIndex = Math.min(startIndex + CUSTOMERS_PER_PAGE, totalItems);

    const pageData = filteredCustomers.slice(startIndex, endIndex);

    tbody.innerHTML = '';
    pageData.forEach((c, idx) => {
        const serialNo = startIndex + idx + 1;
        const tr = document.createElement('tr');
        const tagsArr = c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const pillsHtml = tagsArr.map(t => renderTagPillHtml(t)).join('');
        const tagsDisplayHtml = `
            <div class="table-tags-cell">
                ${pillsHtml}
                <button type="button" class="btn-edit-tag-quick" onclick="openQuickTagModal(${c.id}, event)" title="Update lifecycle / status tags for this customer">
                    <span>🏷️</span> <span>${tagsArr.length > 0 ? 'Edit' : '+ Tag'}</span>
                </button>
            </div>
        `;

        tr.innerHTML = `
            <td><strong style="color:var(--text-muted); font-size:0.85rem;">${serialNo}</strong></td>
            <td>
                <div class="user-cell">
                    <div class="user-avatar">${getInitial(c.name)}</div>
                    <div>
                        <strong style="color:var(--text-main);display:block;">${c.name}</strong>
                        ${c.city ? `<span style="font-size:0.75rem;color:var(--text-muted);">${c.city}${c.state ? ', ' + c.state : ''}</span>` : ''}
                    </div>
                </div>
            </td>
            <td><code style="font-size:0.85rem;color:var(--primary);">${c.phone}</code></td>
            <td><span style="font-size:0.8rem;color:var(--text-muted);">${c.email || '-'}</span></td>
            <td><span style="font-size:0.8rem;color:var(--text-muted);">${c.company_name || '-'}</span></td>
            <td>${tagsDisplayHtml}</td>
            <td><span class="window-badge" style="background:var(--primary-light);color:var(--primary);">${c.message_count || 0} messages</span></td>
            <td style="text-align: right;">
                <button class="btn secondary sm" onclick="editCustomer(${c.id})">Edit</button>
                <button class="btn danger sm" onclick="deleteCustomer(${c.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (totalItems === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="height: 100px;">No matching customers found.</td></tr>`;
    }

    if (pageInfo) {
        pageInfo.textContent = `Showing ${totalItems === 0 ? 0 : startIndex + 1} to ${endIndex} of ${totalItems}`;
    }

    if (btnPrev) btnPrev.disabled = currentCustomersPage === 1;
    if (btnNext) btnNext.disabled = currentCustomersPage === totalPages || totalItems === 0;
}

document.getElementById('customers-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const selectedTag = (document.getElementById('customers-tag-filter')?.value || '').toLowerCase().trim();

    filteredCustomers = allCustomers.filter(c => {
        const matchesQuery = !query || (
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.phone && c.phone.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.company_name && c.company_name.toLowerCase().includes(query)) ||
            (c.tags && c.tags.toLowerCase().includes(query)) ||
            (c.city && c.city.toLowerCase().includes(query))
        );

        const matchesTag = !selectedTag || (
            c.tags && c.tags.split(',').map(s => s.trim().toLowerCase()).includes(selectedTag)
        );

        return matchesQuery && matchesTag;
    });
    currentCustomersPage = 1;
    renderCustomersTable();
});

document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (currentCustomersPage > 1) {
        currentCustomersPage--;
        renderCustomersTable();
    }
});

document.getElementById('btn-next-page')?.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE);
    if (currentCustomersPage < totalPages) {
        currentCustomersPage++;
        renderCustomersTable();
    }
});

window.deleteCustomer = (id) => {
    showModal('Delete Customer', 'Are you sure you want to delete this customer? This action cannot be undone.', 'confirm', async () => {
        await apiFetch(`/api/customers?id=${id}`, { method: 'DELETE' });
        loadCustomers();
    });
};

window.editCustomer = (id) => {
    const cust = allCustomers.find(c => c.id === id);
    if (!cust) return;
    document.getElementById('cust-id').value = cust.id;
    document.getElementById('cust-name').value = cust.name || '';
    document.getElementById('cust-phone').value = cust.phone || '';
    if (document.getElementById('cust-email')) document.getElementById('cust-email').value = cust.email || '';
    if (document.getElementById('cust-company')) document.getElementById('cust-company').value = cust.company_name || '';
    if (document.getElementById('cust-city')) document.getElementById('cust-city').value = cust.city || '';
    if (document.getElementById('cust-state')) document.getElementById('cust-state').value = cust.state || '';
    if (document.getElementById('cust-pincode')) document.getElementById('cust-pincode').value = cust.pincode || '';
    if (document.getElementById('cust-tags')) {
        document.getElementById('cust-tags').value = cust.tags || '';
        syncTagSelectorDisplay('form');
    }
    if (document.getElementById('cust-notes')) document.getElementById('cust-notes').value = cust.notes || '';
    document.getElementById('btn-save-cust').innerHTML = `<span>Update Customer</span>`;
    document.getElementById('btn-cancel-edit').style.display = 'inline-flex';
};

document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    document.getElementById('add-customer-form').reset();
    document.getElementById('cust-id').value = '';
    if (document.getElementById('cust-tags')) {
        document.getElementById('cust-tags').value = '';
        syncTagSelectorDisplay('form');
    }
    document.getElementById('btn-save-cust').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Add Customer</span>`;
    document.getElementById('btn-cancel-edit').style.display = 'none';
});

document.getElementById('add-customer-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const custId = document.getElementById('cust-id').value;
    const name = document.getElementById('cust-name').value;
    const phone = formatIndiaPhone(document.getElementById('cust-phone').value);
    const email = document.getElementById('cust-email')?.value || '';
    const company_name = document.getElementById('cust-company')?.value || '';
    const city = document.getElementById('cust-city')?.value || '';
    const state = document.getElementById('cust-state')?.value || '';
    const pincode = document.getElementById('cust-pincode')?.value || '';
    const tags = document.getElementById('cust-tags')?.value || '';
    const notes = document.getElementById('cust-notes')?.value || '';

    const performSave = async () => {
        await apiFetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: custId || undefined,
                name,
                phone,
                email,
                company_name,
                city,
                state,
                pincode,
                tags,
                notes,
                company_id: getCompanyId()
            })
        });
        document.getElementById('btn-cancel-edit').click();
        loadCustomers();
    };

    if (custId) {
        await performSave();
    } else {
        showModal(
            'Customer Opt-In Consent Confirmation',
            `By adding ${name} (${phone}), you certify that this customer has agreed: "I agree to receive WhatsApp, Email, and SMS promotional updates & service announcements from Inspenox Business Suite".`,
            'confirm',
            performSave,
            'I Confirm & Agree',
            'btn primary'
        );
    }
});

// --- Dashboard Logic ---
async function loadDashboard() {
    const statCust = document.getElementById('dash-stat-customers');
    const statMsgs = document.getElementById('dash-stat-messages');
    const statChats = document.getElementById('dash-stat-chats');

    if (statCust) statCust.textContent = '...';
    if (statMsgs) statMsgs.textContent = '...';
    if (statChats) statChats.textContent = '...';

    try {
        const res = await apiFetch('/api/analytics');
        const analytics = await res.json();

        if (!analytics.error) {
            if (statCust) statCust.textContent = analytics.total_customers || 0;
            if (statMsgs) statMsgs.textContent = analytics.messages_sent || 0;
            if (statChats) statChats.textContent = (analytics.recent_inbound && analytics.recent_inbound.length) || 0;

            const inboxList = document.getElementById('dash-inbox-list');
            if (inboxList) {
                if (analytics.recent_inbound && analytics.recent_inbound.length > 0) {
                    inboxList.innerHTML = '';
                    analytics.recent_inbound.forEach(msg => {
                        inboxList.innerHTML += `
                            <div class="dash-list-item" onclick="switchView('inbox')">
                                <div class="avatar-mini">${getInitial(msg.name)}</div>
                                <div class="dash-list-item-content">
                                    <strong>${msg.name} (${msg.phone})</strong>
                                    <p>${msg.content.substring(0, 60)}${msg.content.length > 60 ? '...' : ''}</p>
                                </div>
                            </div>
                        `;
                    });
                } else {
                    inboxList.innerHTML = '<div class="empty-state">No recent inbound messages</div>';
                }
            }
        }

        const mediaGrid = document.getElementById('dash-media-grid');
        if (mediaGrid) {
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
        }
    } catch (e) {
        console.error('Error loading dashboard:', e);
    }
}

// Excel Import with Tag Configuration & Opt-in Consent
window.closeExcelImportModal = function closeExcelImportModal() {
    const modal = document.getElementById('excel-import-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    pendingExcelCustomers = [];
    const uploadInput = document.getElementById('excel-upload');
    if (uploadInput) uploadInput.value = '';
};

window.executeExcelImport = async function executeExcelImport() {
    if (!pendingExcelCustomers || pendingExcelCustomers.length === 0) {
        showModal('Error', 'No valid contacts to import.');
        return;
    }

    const consentCb = document.getElementById('excel-consent-cb');
    if (consentCb && !consentCb.checked) {
        showModal('Consent Required', 'Please certify that these contacts have given opt-in consent before importing.');
        return;
    }

    const defaultTags = (document.getElementById('excel-import-tags')?.value || '').trim();
    const appendMode = document.getElementById('excel-import-append-cb')?.checked ?? true;

    const btn = document.getElementById('btn-confirm-excel-import');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Importing Contacts...';
    }

    try {
        const res = await apiFetch('/api/customers-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customers: pendingExcelCustomers,
                company_id: getCompanyId(),
                default_tags: defaultTags,
                tag_mode: appendMode ? 'append' : 'replace'
            })
        });
        const data = await res.json();
        if (data && data.success) {
            closeExcelImportModal();
            showModal('Success', `Imported ${data.count || pendingExcelCustomers.length} customers successfully!`);
            loadCustomers();
        } else {
            showModal('Error', data.error || 'Failed to import contacts.');
        }
    } catch (err) {
        console.error('Import error:', err);
        showModal('Error', 'Failed to import contacts: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
};

document.getElementById('excel-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const customers = json.map(row => {
                const keys = Object.keys(row);
                const nameKey = keys.find(k => k.toLowerCase().includes('name')) || keys[0];
                const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('mobile') || k.toLowerCase().includes('contact')) || keys[1];
                const emailKey = keys.find(k => k.toLowerCase().includes('email'));
                const companyKey = keys.find(k => k.toLowerCase().includes('company') || k.toLowerCase().includes('organization'));
                const cityKey = keys.find(k => k.toLowerCase().includes('city'));
                const tagKey = keys.find(k => k.toLowerCase().includes('tag') || k.toLowerCase().includes('status') || k.toLowerCase().includes('segment'));

                const rawPhone = row[phoneKey];
                const formattedPhone = formatIndiaPhone(rawPhone);
                return {
                    name: row[nameKey] ? String(row[nameKey]).trim() : 'Customer',
                    phone: formattedPhone,
                    email: emailKey && row[emailKey] ? String(row[emailKey]).trim() : '',
                    company_name: companyKey && row[companyKey] ? String(row[companyKey]).trim() : '',
                    city: cityKey && row[cityKey] ? String(row[cityKey]).trim() : '',
                    tags: tagKey && row[tagKey] ? String(row[tagKey]).trim() : ''
                };
            }).filter(c => c.phone && c.phone.length >= 10);

            if (customers.length > 0) {
                pendingExcelCustomers = customers;
                const countEl = document.getElementById('excel-import-count');
                const fileEl = document.getElementById('excel-import-file-info');
                if (countEl) countEl.textContent = `${customers.length} contacts detected`;
                if (fileEl) fileEl.textContent = `File: ${file.name} (${customers.length} valid rows)`;

                // Reset tag selector in Excel modal
                const importTagsInp = document.getElementById('excel-import-tags');
                if (importTagsInp) importTagsInp.value = '';
                syncTagSelectorDisplay('excel');
                renderTagDropdownItems('excel');

                const modal = document.getElementById('excel-import-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    modal.style.display = 'flex';
                }
            } else {
                showModal('Error', 'Could not find any valid phone numbers in the uploaded Excel/CSV file.');
            }
        } catch (err) {
            console.error('Excel parse error:', err);
            showModal('Error', 'Error processing file: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
});

// Download Excel Template for Customer Import with Tags column
document.getElementById('btn-download-template')?.addEventListener('click', () => {
    const templateData = [
        { Name: "John Doe", Phone: "919876543210", Email: "john@example.com", Company: "Acme Corp", City: "Mumbai", Tags: "Repeat Buyers, High Spenders" },
        { Name: "Jane Smith", Phone: "919876543211", Email: "jane@example.com", Company: "Apex Media", City: "Bengaluru", Tags: "Loyal" },
        { Name: "Rahul Verma", Phone: "919876543212", Email: "rahul@example.com", Company: "Tech Solutions", City: "Hyderabad", Tags: "Order Placed(Prepaid)" },
        { Name: "Priya Sharma", Phone: "919876543213", Email: "priya@example.com", Company: "Design Studio", City: "Delhi", Tags: "Abandoned Cart" }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");

    // Set column widths
    worksheet['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 30 }];

    XLSX.writeFile(workbook, "inspenox_customers_template.xlsx");
});



// --- Templates Logic & Meta Template Builder ---
let editingTemplateId = null;

async function loadTemplates() {
    const grid = document.getElementById('templates-grid');
    if (grid) {
        grid.innerHTML = `<div style="grid-column: 1 / -1;"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading WhatsApp message templates...</span></div></div>`;
    }
    try {
        const res = await apiFetch('/api/templates');
        const json = await res.json();

        if (json.error) {
            templatesCache = [];
            if (grid) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; max-width: 600px; margin: 2rem auto; text-align: center;">
                        <div style="font-size: 2rem; margin-bottom: 0.75rem;">⚠️</div>
                        <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.5rem; color: var(--text-primary);">${json.error}</div>
                        <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.25rem;">Meta WhatsApp requires an active access token to sync message templates.</div>
                        <button class="btn primary" onclick="navigateToSettingsMeta()" style="padding: 0.6rem 1.4rem;">Go to Meta Credentials Settings</button>
                    </div>
                `;
            }
            return;
        }

        const isViewOnly = json.is_view_only === true;
        const isConfigured = json.is_configured !== false;
        const list = Array.isArray(json) ? json : (json.data || json.templates || []);
        templatesCache = list;
        templatesCache.is_view_only = isViewOnly;
        templatesCache.is_configured = isConfigured;

        // Toggle View-Only Notification Banner
        const bannerEl = document.getElementById('templates-view-only-banner');
        if (bannerEl) {
            bannerEl.style.display = isViewOnly ? 'flex' : 'none';
        }

        // Toggle Create Template button visual state
        const createBtn = document.getElementById('btn-create-template');
        if (createBtn) {
            if (isViewOnly) {
                createBtn.style.opacity = '0.5';
                createBtn.title = 'Configure Meta app details in Settings to create templates';
            } else {
                createBtn.style.opacity = '1';
                createBtn.title = 'Create Template';
            }
        }

        if (grid) {
            grid.innerHTML = '';
            if (Array.isArray(templatesCache) && templatesCache.length > 0) {
                templatesCache.forEach(t => {
                    const statusClass = t.status === 'APPROVED' ? 'badge-approved' : t.status === 'PENDING' ? 'badge-pending' : 'badge-rejected';
                    const bodyComponent = t.components ? t.components.find(c => c.type === 'BODY') : null;
                    const bodySnippet = bodyComponent ? bodyComponent.text : 'Official Meta Message Template for WhatsApp broadcasts.';
                    const safeName = (t.name || '').replace(/'/g, "\\'");
                    const safeId = (t.id || '').replace(/'/g, "\\'");

                    let actionHtml = '';
                    if (isViewOnly) {
                        actionHtml = `
                            <div class="tpl-actions-row">
                                <div class="tpl-action-group">
                                    <span class="window-badge" style="background:rgba(245, 158, 11, 0.15); color:#f59e0b; font-weight:600; font-size:0.75rem; padding:4px 10px;">🔒 View Access Only</span>
                                </div>
                                <span class="template-id-tag" title="Template ID">${t.id || ''}</span>
                            </div>
                        `;
                    } else {
                        actionHtml = `
                            <div class="tpl-actions-row">
                                <div class="tpl-action-group">
                                    <button class="tpl-action-btn copy" onclick="navigator.clipboard.writeText('${safeName}'); showModal('Copied', 'Template name copied to clipboard!');" title="Copy template name">
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                        <span>Copy</span>
                                    </button>
                                    <button class="tpl-action-btn edit" onclick="editTemplate('${safeId || safeName}')" title="Edit Meta template">
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        <span>Edit</span>
                                    </button>
                                    <button class="tpl-action-btn delete" onclick="deleteTemplate('${safeName}', '${safeId}')" title="Delete template">
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        <span>Delete</span>
                                    </button>
                                </div>
                                <span class="template-id-tag" title="Template ID">${t.id || ''}</span>
                            </div>
                        `;
                    }

                    grid.innerHTML += `
                        <div class="template-card">
                            <div>
                                <div class="template-card-header">
                                    <h4 class="template-card-title" title="${t.name}">${t.name}</h4>
                                    <span class="badge-status ${statusClass}">${t.status || 'APPROVED'}</span>
                                </div>
                                <span class="template-card-meta">${t.language} • ${t.category || 'UTILITY'}</span>
                                <p class="template-card-body">${bodySnippet}</p>
                            </div>
                            ${actionHtml}
                        </div>
                    `;
                });
            } else {
                grid.innerHTML = isViewOnly
                    ? '<div class="empty-state" style="grid-column: 1 / -1;">No templates available. Configure Meta app details in Settings to create and manage templates.</div>'
                    : '<div class="empty-state" style="grid-column: 1 / -1;">No templates found. Click "+ Create Template" above to build your first template.</div>';
            }
        }
    } catch (e) { console.error('Templates fetch error', e); }
}

window.loadTemplates = loadTemplates;

window.navigateToSettingsMeta = function () {
    switchView('settings');
    setTimeout(() => {
        const target = document.getElementById('panel-companies-title') || document.getElementById('env-credentials-card');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    }, 150);
};

function updateBannerTitle() {
    const titleEl = document.getElementById('tpl-banner-title');
    if (!titleEl) return;
    const name = document.getElementById('tpl-name')?.value || 'your_template_name';
    const langSelect = document.getElementById('tpl-lang');
    let langLabel = 'English';
    if (langSelect && langSelect.selectedIndex >= 0) {
        const selectedOpt = langSelect.options[langSelect.selectedIndex];
        langLabel = selectedOpt ? selectedOpt.textContent.split('(')[0].trim() : langSelect.value;
    }
    titleEl.textContent = `${name} • ${langLabel}`;
}
window.updateBannerTitle = updateBannerTitle;

window.editTemplate = function editTemplate(id) {
    if (templatesCache && templatesCache.is_view_only) {
        showModal('View-Only Access', 'Templates are view-only for this company. Configure Meta app details in Settings to manage templates.');
        return;
    }
    if (!templatesCache || !Array.isArray(templatesCache) || templatesCache.length === 0) {
        showModal('Error', 'Templates data is loading. Please try clicking "Refresh Statuses" to sync templates.');
        return;
    }

    const targetIdStr = String(id || '').trim();
    const tpl = templatesCache.find(t => String(t.id || '').trim() === targetIdStr || String(t.name || '').trim() === targetIdStr);

    if (!tpl) {
        showModal('Error', `Template "${id}" details not found in cache. Please click "Refresh Statuses" to reload.`);
        return;
    }

    editingTemplateId = tpl.id || tpl.name;
    currentSelectedCategory = (tpl.category || 'MARKETING').toUpperCase();
    currentSelectedSubtype = 'custom';

    const modal = document.getElementById('template-create-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // 1. Switch to Step 2 and build form DOM
    if (typeof goToStep === 'function') goToStep(2);
    if (typeof renderStep2Form === 'function') {
        renderStep2Form(currentSelectedCategory, currentSelectedSubtype);
    }

    // 2. Select Step 2 Form Elements
    const nameInput = document.getElementById('tpl-name');
    const langSelect = document.getElementById('tpl-lang');
    const headerTypeSelect = document.getElementById('tpl-header-type');
    const headerTextInput = document.getElementById('tpl-header-text');
    const headerTextGroup = document.getElementById('tpl-header-text-group');
    const mediaGroup = document.getElementById('tpl-media-dropzone-wrapper');
    const bodyInput = document.getElementById('tpl-body');
    const footerInput = document.getElementById('tpl-footer');
    const buttonTypeSelect = document.getElementById('tpl-button-type');

    // Populate Name (Locked on edit per Meta guidelines)
    if (nameInput) {
        nameInput.value = tpl.name || '';
        nameInput.disabled = true;
    }

    // Populate Language (Add dynamic option if 'en' or other code is missing)
    if (langSelect && tpl.language) {
        let opt = Array.from(langSelect.options).find(o => o.value === tpl.language);
        if (!opt) {
            const newOpt = document.createElement('option');
            newOpt.value = tpl.language;
            newOpt.textContent = `Language (${tpl.language})`;
            langSelect.appendChild(newOpt);
        }
        langSelect.value = tpl.language;
    }

    // Update banner using the helper which reads display text from the select option
    updateBannerTitle();

    const comps = tpl.components || [];
    const headerComp = comps.find(c => c.type === 'HEADER');
    const bodyComp = comps.find(c => c.type === 'BODY');
    const footerComp = comps.find(c => c.type === 'FOOTER');
    const buttonsComp = comps.find(c => c.type === 'BUTTONS');

    // Populate Header Component
    editingTemplateHeaderHandle = null;
    editingTemplateHeaderUrl = null;
    currentMediaSampleUrl = null;
    if (headerComp) {
        const fmt = (headerComp.format || (headerComp.text ? 'TEXT' : 'NONE')).toUpperCase();
        if (headerTypeSelect) headerTypeSelect.value = fmt;
        if (fmt === 'TEXT' && headerTextInput) {
            headerTextInput.value = headerComp.text || '';
            if (headerTextGroup) headerTextGroup.style.display = 'block';
            if (mediaGroup) mediaGroup.style.display = 'none';
        } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(fmt)) {
            if (headerTextGroup) headerTextGroup.style.display = 'none';
            if (mediaGroup) mediaGroup.style.display = 'block';

            let sampleUrl = null;
            if (headerComp.example) {
                if (Array.isArray(headerComp.example.header_url) && headerComp.example.header_url[0]) {
                    sampleUrl = headerComp.example.header_url[0];
                } else if (Array.isArray(headerComp.example.header_handle) && headerComp.example.header_handle[0]) {
                    const h = headerComp.example.header_handle[0];
                    if (h.startsWith('http://') || h.startsWith('https://') || h.startsWith('data:')) {
                        sampleUrl = h;
                    }
                    editingTemplateHeaderHandle = h;
                }
            }

            // Fallback: Check local Media Library for matching file asset
            if (!sampleUrl) {
                try {
                    apiFetch('/api/media').then(res => res.json()).then(mediaList => {
                        if (Array.isArray(mediaList) && mediaList.length > 0) {
                            const fmtLower = fmt.toLowerCase();
                            const matched = mediaList.find(m => (m.type === fmtLower || (m.mime_type && m.mime_type.startsWith(fmtLower))) && m.file_url);
                            if (matched && matched.file_url) {
                                currentMediaSampleUrl = matched.file_url;
                                const mediaThumbEl = document.getElementById('tpl-media-file-thumb');
                                if (mediaThumbEl && fmt === 'IMAGE') {
                                    mediaThumbEl.src = matched.file_url;
                                    mediaThumbEl.style.display = 'block';
                                }
                                if (typeof updateLivePreview === 'function') updateLivePreview();
                            }
                        }
                    }).catch(e => console.warn('Error matching media for edit preview:', e));
                } catch (e) {
                    console.warn('Error matching media for edit preview:', e);
                }
            }

            const dropzone = document.getElementById('tpl-media-dropzone');
            const fileCardEl = document.getElementById('tpl-media-file-card');
            const fileNameTextEl = document.getElementById('tpl-media-file-name-text');
            const fileSizeTextEl = document.getElementById('tpl-media-file-size-text');
            const mediaThumbEl = document.getElementById('tpl-media-file-thumb');
            const mediaIconEl = document.getElementById('tpl-media-file-icon');

            if (sampleUrl || editingTemplateHeaderHandle) {
                if (sampleUrl) currentMediaSampleUrl = sampleUrl;
                if (fileNameTextEl) fileNameTextEl.textContent = `Meta Sample ${fmt.toLowerCase()}`;
                if (fileSizeTextEl) fileSizeTextEl.textContent = `(Synced from Meta)`;
                if (dropzone) dropzone.style.display = 'none';
                if (fileCardEl) fileCardEl.style.display = 'flex';

                if (fmt === 'IMAGE') {
                    if (mediaThumbEl && sampleUrl) {
                        mediaThumbEl.src = sampleUrl;
                        mediaThumbEl.style.display = 'block';
                    }
                    if (mediaIconEl) mediaIconEl.style.display = 'none';
                } else if (fmt === 'VIDEO') {
                    if (mediaThumbEl) mediaThumbEl.style.display = 'none';
                    if (mediaIconEl) {
                        mediaIconEl.textContent = '🎥';
                        mediaIconEl.style.display = 'inline-block';
                    }
                } else {
                    if (mediaThumbEl) mediaThumbEl.style.display = 'none';
                    if (mediaIconEl) {
                        mediaIconEl.textContent = '📄';
                        mediaIconEl.style.display = 'inline-block';
                    }
                }
            } else {
                if (dropzone) dropzone.style.display = 'block';
                if (fileCardEl) fileCardEl.style.display = 'none';
            }
        } else {
            if (headerTextGroup) headerTextGroup.style.display = 'none';
            if (mediaGroup) mediaGroup.style.display = 'none';
        }
    } else {
        if (headerTypeSelect) headerTypeSelect.value = 'NONE';
        if (headerTextGroup) headerTextGroup.style.display = 'none';
        if (mediaGroup) mediaGroup.style.display = 'none';
    }

    // Populate Body Component
    if (bodyInput && bodyComp) {
        bodyInput.value = bodyComp.text || '';
    }

    // Populate Footer Component
    if (footerInput && footerComp) {
        footerInput.value = footerComp.text || '';
    }

    // Populate Buttons Component
    const listContainer = document.getElementById('tpl-buttons-list');
    if (listContainer) listContainer.innerHTML = '';

    if (buttonsComp && Array.isArray(buttonsComp.buttons) && buttonsComp.buttons.length > 0) {
        buttonsComp.buttons.forEach(btn => {
            const bType = (btn.type || '').toUpperCase();
            if (bType === 'QUICK_REPLY') {
                addTemplateButton('QUICK_REPLY', { text: btn.text || '' });
            } else if (bType === 'URL') {
                addTemplateButton('URL', { text: btn.text || '', url: btn.url || '' });
            } else if (bType === 'PHONE_NUMBER') {
                addTemplateButton('PHONE_NUMBER', { text: btn.text || '', phone: btn.phone_number || '' });
            } else if (bType === 'COPY_CODE') {
                addTemplateButton('COPY_CODE', { code: btn.example || btn.text || '' });
            }
        });
    }

    const submitBtn = document.getElementById('btn-submit-tpl');
    if (submitBtn) submitBtn.innerHTML = '✏️ Update Template';

    if (typeof updateLivePreview === 'function') updateLivePreview();
};

window.deleteTemplate = function deleteTemplate(name, id) {
    if (templatesCache && templatesCache.is_view_only) {
        showModal('View-Only Access', 'Templates are in view-only access. Configure Meta app details in Settings to create or manage templates for other companies.');
        return;
    }
    if (name && name.toLowerCase().startsWith('hello_world')) {
        showModal('System Template Locked', 'Meta Cloud API Notice: "hello_world" is a default system sample template pre-provisioned and locked by Meta. It cannot be deleted from your account. Any custom templates you create can be deleted freely.');
        return;
    }

    showModal('Delete Template', `Are you sure you want to permanently delete template "${name}" from your Meta WhatsApp Business Account? This action cannot be undone.`, 'confirm', async () => {
        try {
            const res = await apiFetch(`/api/templates?name=${encodeURIComponent(name)}&id=${id || ''}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.error) {
                showModal('Meta Delete Notice', data.error);
            } else {
                showModal('Deleted', `Template "${name}" has been deleted from Meta Cloud API.`);
                loadTemplates();
                loadTemplatesForSelect();
            }
        } catch (err) {
            showModal('Error', 'Failed to delete template: ' + err.message);
        }
    });
};

window._customMediaOverrideActive = false;

function toggleCustomMediaOverride() {
    window._customMediaOverrideActive = !window._customMediaOverrideActive;
    const customWrapper = document.getElementById('bc-custom-media-wrapper');
    const btnToggle = document.getElementById('btn-toggle-custom-media');
    if (customWrapper) {
        customWrapper.style.display = window._customMediaOverrideActive ? 'block' : 'none';
    }
    if (btnToggle) {
        btnToggle.textContent = window._customMediaOverrideActive ? '✖ Use Meta Default' : '🔄 Change Media (Optional)';
    }
    if (!window._customMediaOverrideActive) {
        const mediaSelect = document.getElementById('bc-media-select');
        const mediaFile = document.getElementById('bc-media');
        if (mediaSelect) mediaSelect.value = '';
        if (mediaFile) mediaFile.value = '';
        const dropzoneText = document.getElementById('dropzone-text');
        if (dropzoneText) dropzoneText.textContent = 'Click to choose image or video';
        const previewContainer = document.getElementById('bc-media-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
    }
}
window.toggleCustomMediaOverride = toggleCustomMediaOverride;

function checkSelectedTemplateMediaRequirement() {
    const type = document.getElementById('bc-type')?.value;
    const mediaGroup = document.getElementById('bc-media-group');
    if (!mediaGroup) return;

    const autoContainer = document.getElementById('bc-meta-header-auto-container');
    const customWrapper = document.getElementById('bc-custom-media-wrapper');
    const label = document.getElementById('bc-media-group-label') || mediaGroup.querySelector('label');

    if (type === 'template') {
        const tSel = document.getElementById('bc-template');
        const selectedName = tSel ? tSel.value : null;
        const tmpl = (templatesCache || []).find(t => t.name === selectedName);
        const headerComp = tmpl && tmpl.components ? tmpl.components.find(c => c.type === 'HEADER') : null;

        if (headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
            const format = headerComp.format.toUpperCase();
            mediaGroup.style.display = 'block';
            if (label) label.textContent = `Template Header ${format} (Auto-Attached from Meta)`;

            const metaMedia = tmpl.header_media;
            const hasMeta = metaMedia && (metaMedia.has_meta_media || metaMedia.media_id);
            const mediaVal = metaMedia ? metaMedia.media_id : null;
            const isFallback = metaMedia && metaMedia.has_fallback_media;
            const fallbackName = metaMedia && metaMedia.fallback_name;

            if (autoContainer) {
                autoContainer.style.display = 'block';
                const iconSvg = format === 'VIDEO'
                    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`
                    : format === 'DOCUMENT'
                        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
                        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;

                const badgeText = isFallback ? 'Auto-Attached from Library' : 'Synced from Meta';
                const subtitleText = isFallback
                    ? `Default ${fallbackName || 'library asset'} is attached. No re-upload required.`
                    : 'Meta approved header media is automatically linked. No re-upload required to broadcast.';

                autoContainer.innerHTML = `
                    <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.32); border-radius: 8px; padding: 0.85rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 38px; height: 38px; border-radius: 8px; background: rgba(16, 185, 129, 0.18); display: flex; align-items: center; justify-content: center; color: #10b981; flex-shrink: 0;">
                                ${iconSvg}
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                                    <span style="font-weight: 600; font-size: 0.88rem; color: var(--text-main);">Template Header ${format} Auto-Attached</span>
                                    <span style="background: #10b981; color: #ffffff; font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 12px; letter-spacing: 0.02em;">${badgeText}</span>
                                </div>
                                <p style="margin: 0.2rem 0 0 0; font-size: 0.77rem; color: var(--text-muted);">
                                    ${subtitleText}
                                </p>
                                ${mediaVal ? `<div style="margin-top: 0.25rem; font-size: 0.72rem; color: #10b981; font-family: monospace;">Linked ID / Handle: ${mediaVal.length > 40 ? mediaVal.substring(0, 37) + '...' : mediaVal}</div>` : ''}
                            </div>
                        </div>
                        <button type="button" class="btn secondary" id="btn-toggle-custom-media" onclick="toggleCustomMediaOverride()" style="font-size: 0.75rem; padding: 0.35rem 0.65rem; white-space: nowrap;">
                            ${window._customMediaOverrideActive ? '✖ Use Meta Default' : '🔄 Change Media (Optional)'}
                        </button>
                    </div>
                `;
            }

            if (customWrapper) {
                customWrapper.style.display = window._customMediaOverrideActive ? 'block' : 'none';
            }
            loadMediaForSelect(format === 'VIDEO' ? 'video' : 'image');
            return;
        } else {
            mediaGroup.style.display = 'none';
            if (autoContainer) autoContainer.style.display = 'none';
            return;
        }
    }

    if (type === 'image' || type === 'video') {
        mediaGroup.style.display = 'block';
        if (label) label.textContent = 'Attach Media';
        if (autoContainer) autoContainer.style.display = 'none';
        if (customWrapper) customWrapper.style.display = 'block';
        return;
    }

    mediaGroup.style.display = 'none';
    if (autoContainer) autoContainer.style.display = 'none';
}
window.checkSelectedTemplateMediaRequirement = checkSelectedTemplateMediaRequirement;

async function loadTemplatesForSelect() {
    if (templatesCache.length === 0) await loadTemplates();
    const select = document.getElementById('bc-template');
    if (select) {
        select.innerHTML = '';
        const approvedOnly = Array.isArray(templatesCache) ? templatesCache.filter(t => t.status === 'APPROVED' || !t.status) : [];
        if (approvedOnly.length === 0) {
            select.innerHTML = '<option value="">No approved templates available</option>';
        } else {
            approvedOnly.forEach(t => {
                select.innerHTML += `<option value="${t.name}" data-lang="${t.language}">${t.name} (${t.language})</option>`;
            });
        }
    }
    checkSelectedTemplateMediaRequirement();
}

// Meta Template Modal Setup & Logic

let currentStep = 1;
let currentSelectedSubtype = 'default';
let currentSelectedCategory = 'MARKETING';

const subTypesMap = {
    MARKETING: [
        { id: 'default', title: 'Default', desc: 'Send messages with media and customised buttons to engage your customers.' },
        { id: 'catalogue', title: 'Catalogue', desc: 'Send messages that drive sales by connecting your product catalogue.' },
        { id: 'calling_permissions', title: 'Calling permissions request', desc: 'Ask customers if you can call them on WhatsApp.' }
    ],
    UTILITY: [
        { id: 'default', title: 'Default', desc: 'Send messages about an existing order or account.' },
        { id: 'calling_permissions', title: 'Calling permissions request', desc: 'Ask customers if you can call them on WhatsApp.' }
    ],
    AUTHENTICATION: [
        { id: 'otp', title: 'One-time passcode', desc: 'Send codes to verify a transaction or login.' }
    ]
};


function renderSubtypes(category) {
    const container = document.getElementById('meta-subtypes-container');
    if (!container) return;

    const list = subTypesMap[category] || subTypesMap.MARKETING;
    currentSelectedSubtype = list[0].id;

    container.innerHTML = list.map((item, index) => `
        <label class="subtype-card ${index === 0 ? 'active' : ''}">
            <input type="radio" name="meta-subtype" value="${item.id}" ${index === 0 ? 'checked' : ''}>
            <div>
                <div class="subtype-title">${item.title}</div>
                <div class="subtype-desc">${item.desc}</div>
            </div>
        </label>
    `).join('');

    container.querySelectorAll('.subtype-card').forEach(card => {
        card.addEventListener('click', () => {
            container.querySelectorAll('.subtype-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const radio = card.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                currentSelectedSubtype = radio.value;
            }
            updateLivePreview();
        });
    });
}

function goToStep(step) {
    currentStep = step;
    const step1Container = document.getElementById('meta-step-1-container');
    const step2Container = document.getElementById('meta-step-2-container');
    const dot1 = document.getElementById('step-dot-1');
    const dot2 = document.getElementById('step-dot-2');
    const btnDiscard = document.getElementById('btn-discard-tpl');
    const btnPrev = document.getElementById('btn-prev-step');
    const btnNext = document.getElementById('btn-next-step');
    const btnSubmit = document.getElementById('btn-submit-tpl');

    if (step === 1) {
        if (step1Container) step1Container.style.display = 'block';
        if (step2Container) step2Container.style.display = 'none';
        dot1?.classList.add('active');
        dot2?.classList.remove('active');
        if (btnDiscard) btnDiscard.style.display = 'block';
        if (btnPrev) btnPrev.style.display = 'none';
        if (btnNext) btnNext.style.display = 'block';
        if (btnSubmit) btnSubmit.style.display = 'none';
    } else {
        if (step1Container) step1Container.style.display = 'none';
        if (step2Container) step2Container.style.display = 'block';
        dot1?.classList.remove('active');
        dot2?.classList.add('active');
        if (btnDiscard) btnDiscard.style.display = 'none';
        if (btnPrev) btnPrev.style.display = 'block';
        if (btnNext) btnNext.style.display = 'none';
        if (btnSubmit) btnSubmit.style.display = 'block';

        renderStep2Form(currentSelectedCategory, currentSelectedSubtype);
    }
}
window.goToStep = goToStep;

function getSmartSample(varKey, varType = 'TEXT') {
    const k = String(varKey || '').toLowerCase();
    if (['name', 'customer_name', 'customer'].includes(k)) return 'Rajesh Sharma';
    if (['phone', 'phone_number', 'mobile'].includes(k)) return '+91 98765 43210';
    if (['email'].includes(k)) return 'rajesh@example.com';
    if (['city', 'town', 'location'].includes(k)) return 'Hyderabad';
    if (['state'].includes(k)) return 'Telangana';
    if (['company_name', 'company', 'business_name'].includes(k)) {
        const stored = (typeof getStoredCompany === 'function') ? getStoredCompany() : null;
        return (stored && stored.name) ? stored.name : 'Manaswini Enterprises';
    }
    if (['tags', 'tag'].includes(k)) return 'VIP Client';
    if (['customer_id', 'id'].includes(k)) return 'CUST-1001';
    if (['address'].includes(k)) return 'Road No. 12, Banjara Hills';
    if (['pincode', 'zip'].includes(k)) return '500034';
    if (k === '1') return varType === 'NUMBER' ? '123' : 'Customer';
    if (k === '2') return varType === 'NUMBER' ? '456' : '10% OFF';
    if (k === '3') return varType === 'NUMBER' ? '789' : 'Special Offer';
    return varKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getVariablePickerHtml(pickerId = 'tpl-var-picker', targetInputId = 'tpl-body') {
    return `
        <div id="${pickerId}" class="tpl-var-picker-popover" style="display:none;" data-target="${targetInputId}">
            <div class="tpl-var-picker-header">
                <h5>⚡ Dynamic Broadcast Variables</h5>
                <p>Select customer table columns or business name. When broadcasting, these placeholders dynamically resolve per recipient.</p>
            </div>
            
            <div class="tpl-var-group-title">👤 Customers Table Columns</div>
            <div class="tpl-var-list">
                <div class="tpl-var-item" data-var-tag="{{name}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">👤 Customer Name</span>
                        <span class="tpl-var-item-desc">Full customer name from directory</span>
                    </div>
                    <code class="tpl-var-badge">{{name}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{phone}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">📞 Phone Number</span>
                        <span class="tpl-var-item-desc">Customer WhatsApp/mobile number</span>
                    </div>
                    <code class="tpl-var-badge">{{phone}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{email}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">✉️ Email Address</span>
                        <span class="tpl-var-item-desc">Recipient email address</span>
                    </div>
                    <code class="tpl-var-badge">{{email}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{city}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">🏙️ City / Location</span>
                        <span class="tpl-var-item-desc">Customer city column</span>
                    </div>
                    <code class="tpl-var-badge">{{city}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{state}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">📍 State / Province</span>
                        <span class="tpl-var-item-desc">Customer state column</span>
                    </div>
                    <code class="tpl-var-badge">{{state}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{tags}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">🏷️ Segment Tags</span>
                        <span class="tpl-var-item-desc">Customer tags and categories</span>
                    </div>
                    <code class="tpl-var-badge">{{tags}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{customer_id}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">🆔 Customer ID</span>
                        <span class="tpl-var-item-desc">Unique database ID / S.No</span>
                    </div>
                    <code class="tpl-var-badge">{{customer_id}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{address}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">🏠 Street Address</span>
                        <span class="tpl-var-item-desc">Customer street address</span>
                    </div>
                    <code class="tpl-var-badge">{{address}}</code>
                </div>
                <div class="tpl-var-item" data-var-tag="{{pincode}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">📮 Pincode / ZIP</span>
                        <span class="tpl-var-item-desc">Postal code column</span>
                    </div>
                    <code class="tpl-var-badge">{{pincode}}</code>
                </div>
            </div>

            <div class="tpl-var-group-title">🏢 Company Profile</div>
            <div class="tpl-var-list">
                <div class="tpl-var-item" data-var-tag="{{company_name}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">🏢 Company Name</span>
                        <span class="tpl-var-item-desc">Your active business / account name</span>
                    </div>
                    <code class="tpl-var-badge">{{company_name}}</code>
                </div>
            </div>

            <div class="tpl-var-group-title">#️⃣ Meta Custom Token</div>
            <div class="tpl-var-list">
                <div class="tpl-var-item" data-var-tag="{{1}}">
                    <div class="tpl-var-item-info">
                        <span class="tpl-var-item-label">#️⃣ Positional Variable</span>
                        <span class="tpl-var-item-desc">Standard Meta {{1}} numbered placeholder</span>
                    </div>
                    <code class="tpl-var-badge">{{1}}</code>
                </div>
            </div>
        </div>
    `;
}

function initVarPickers() {
    ['btn-add-var', 'btn-add-header-var', 'btn-bc-add-var'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const pickerId = btnId === 'btn-add-header-var' ? 'tpl-header-var-picker' : (btnId === 'btn-bc-add-var' ? 'bc-var-picker' : 'tpl-var-picker');
        const picker = document.getElementById(pickerId);
        if (!picker) return;

        btn.onclick = (e) => {
            e.stopPropagation();
            const emojiPicker = document.getElementById('tpl-emoji-picker');
            if (emojiPicker) emojiPicker.style.display = 'none';

            const isShown = picker.style.display === 'flex';
            document.querySelectorAll('.tpl-var-picker-popover').forEach(p => p.style.display = 'none');
            picker.style.display = isShown ? 'none' : 'flex';
        };

        picker.querySelectorAll('.tpl-var-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const tag = item.dataset.varTag;
                const targetInputId = picker.dataset.target || (btnId === 'btn-add-header-var' ? 'tpl-header-text' : (btnId === 'btn-bc-add-var' ? 'bc-content' : 'tpl-body'));
                const targetEl = document.getElementById(targetInputId);
                if (!targetEl) return;

                if (targetInputId === 'tpl-header-text' && (targetEl.value.match(/\{\{([^}]+)\}\}/g) || []).length >= 1) {
                    alert('Meta only allows 1 variable in the header text.');
                    picker.style.display = 'none';
                    return;
                }

                let insertTag = tag;
                if (tag === '{{1}}') {
                    const matches = targetEl.value.match(/\{\{(\d+)\}\}/g) || [];
                    const nextNum = matches.length + 1;
                    insertTag = `{{${nextNum}}}`;
                }

                const start = targetEl.selectionStart || targetEl.value.length;
                const end = targetEl.selectionEnd || targetEl.value.length;
                targetEl.value = targetEl.value.substring(0, start) + insertTag + targetEl.value.substring(end);
                targetEl.focus();
                targetEl.setSelectionRange(start + insertTag.length, start + insertTag.length);
                picker.style.display = 'none';
                if (typeof updateLivePreview === 'function') updateLivePreview();
                if (typeof refreshVariableSampleFields === 'function') refreshVariableSampleFields();
            };
        });
    });

    if (!window._varPickerGlobalClickAdded) {
        window._varPickerGlobalClickAdded = true;
        document.addEventListener('click', (e) => {
            document.querySelectorAll('.tpl-var-picker-popover').forEach(picker => {
                if (picker.style.display === 'flex' && !picker.contains(e.target) && !e.target.closest('#btn-add-var, #btn-add-header-var, #btn-bc-add-var')) {
                    picker.style.display = 'none';
                }
            });
        });
    }
}

function renderStep2Form(category, subtype) {
    const form = document.getElementById('template-builder-form');
    const bannerTitle = document.getElementById('tpl-banner-title');
    const bannerSubtitle = document.getElementById('tpl-banner-subtitle');
    const bannerIcon = document.querySelector('.tpl-banner-icon');

    if (!form) return;

    // Update Banner Info
    const catIcons = { MARKETING: '📢', UTILITY: '🔔', AUTHENTICATION: '🔑' };
    const icon = catIcons[category] || '📢';
    const subTitleText = `${category.charAt(0) + category.slice(1).toLowerCase()} • ${subtype.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}`;

    if (bannerIcon) bannerIcon.textContent = icon;
    if (bannerTitle) bannerTitle.textContent = `your_template_name • English`;
    if (bannerSubtitle) bannerSubtitle.textContent = subTitleText;

    // Build Relevant Form Cards HTML
    let html = '';

    // Card 1: Template Name and Language (Always Present)
    html += `
        <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
            <h4 style="font-size:0.9rem; margin-bottom:0.75rem; color:var(--text-main);">Template name and language</h4>
            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <div class="form-group" style="flex:2; min-width:200px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label for="tpl-name">Name your template <span style="color:var(--danger)">*</span></label>
                        <span id="tpl-name-count" style="font-size:0.725rem; color:var(--text-muted)">0/512</span>
                    </div>
                    <input type="text" id="tpl-name" placeholder="Enter a template name" required pattern="[a-z0-9_]+" maxlength="512" style="font-family:monospace;">
                    <small style="font-size:0.725rem; color:var(--text-muted)">Lowercase letters, numbers, and underscores only.</small>
                </div>
                <div class="form-group" style="flex:1; min-width:140px;">
                    <label for="tpl-lang">Select language <span style="color:var(--danger)">*</span></label>
                    <select id="tpl-lang" required>
                        <option value="en" selected>English (en)</option>
                        <option value="en_US">English (US) (en_US)</option>
                        <option value="en_GB">English (UK) (en_GB)</option>
                        <option value="hi">Hindi (hi)</option>
                        <option value="te">Telugu (te)</option>
                        <option value="ta">Tamil (ta)</option>
                        <option value="kn">Kannada (kn)</option>
                        <option value="mr">Marathi (mr)</option>
                        <option value="gu">Gujarati (gu)</option>
                        <option value="bn">Bengali (bn)</option>
                        <option value="ml">Malayalam (ml)</option>
                        <option value="pa">Punjabi (pa)</option>
                        <option value="ur">Urdu (ur)</option>
                        <option value="ar">Arabic (ar)</option>
                        <option value="es">Spanish (es)</option>
                        <option value="es_ES">Spanish (Spain) (es_ES)</option>
                        <option value="pt_BR">Portuguese (BR) (pt_BR)</option>
                        <option value="fr">French (fr)</option>
                        <option value="de">German (de)</option>
                        <option value="id">Indonesian (id)</option>
                        <option value="it">Italian (it)</option>
                        <option value="ja">Japanese (ja)</option>
                        <option value="ko">Korean (ko)</option>
                        <option value="ru">Russian (ru)</option>
                        <option value="zh_CN">Chinese (CN) (zh_CN)</option>
                        <option value="zh_TW">Chinese (TW) (zh_TW)</option>
                        <option value="tr">Turkish (tr)</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    if (category === 'AUTHENTICATION') {
        // Variant D: Authentication • One-time passcode
        html += `
            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Code delivery setup</h4>
                <p style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.85rem; line-height:1.35;">Choose how customers send the code from WhatsApp to your app.</p>
                <div style="display:flex; flex-direction:column; gap:0.75rem;">
                    <label class="option-radio-label">
                        <input type="radio" name="otp-type" value="zero_tap" checked>
                        <div>
                            <strong style="font-size:0.85rem; display:block;">Zero-tap auto-fill</strong>
                            <span style="font-size:0.75rem; color:var(--text-muted);">Recommended. Automatically sends code without requiring customer to tap a button.</span>
                        </div>
                    </label>
                    <div style="margin-left: 1.6rem; background:var(--primary-light); padding:0.75rem 0.85rem; border-radius:6px; font-size:0.75rem; color:var(--text-main); border:1px solid rgba(0, 168, 132, 0.3);">
                        <label style="display:flex; align-items:flex-start; gap:0.5rem; cursor:pointer; margin:0;">
                            <input type="checkbox" id="zt-consent-cb" checked>
                            <span style="font-size:0.75rem; line-height:1.4; color:var(--text-main);">
                                By selecting zero-tap, I understand that use of zero-tap authentication is subject to the <a href="https://www.whatsapp.com/legal/business-terms/?lang=en_GB" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;font-weight:600;">WhatsApp Business Terms of Service</a>. It's your responsibility to ensure that customers expect that the code will be automatically filled in on their behalf when they choose to receive the zero-tap code through WhatsApp.
                            </span>
                        </label>
                        <div style="margin-top:0.35rem; padding-left:1.65rem;">
                            <a href="https://business.facebook.com/business/help/285737223876109" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline;font-size:0.725rem;font-weight:600;">Learn more and review best practices.</a>
                        </div>
                        <div id="zt-consent-error" class="zero-tap-error-banner" style="display:none;">
                            🚫 This box must be ticked to submit this template.
                        </div>
                    </div>
                    <label class="option-radio-label">
                        <input type="radio" name="otp-type" value="one_tap">
                        <div>
                            <strong style="font-size:0.85rem; display:block;">One-tap auto-fill</strong>
                            <span style="font-size:0.75rem; color:var(--text-muted);">Code sends to your app when customers tap the button.</span>
                        </div>
                    </label>
                    <label class="option-radio-label">
                        <input type="radio" name="otp-type" value="copy_code">
                        <div>
                            <strong style="font-size:0.85rem; display:block;">Copy code</strong>
                            <span style="font-size:0.75rem; color:var(--text-muted);">Customers copy and paste the code into your app.</span>
                        </div>
                    </label>
                </div>
            </div>

            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">App setup</h4>
                <p style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.85rem;">You can add up to 5 apps.</p>
                <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                    <div class="form-group" style="flex:1; min-width:180px;">
                        <label>Package name</label>
                        <input type="text" placeholder="com.example.myapplication" style="font-family:monospace;">
                    </div>
                    <div class="form-group" style="flex:1; min-width:140px;">
                        <label>App signature hash</label>
                        <input type="text" placeholder="Enter 11-char hash" maxlength="11" style="font-family:monospace;">
                    </div>
                </div>
                <button type="button" class="btn secondary sm" style="margin-top:0.75rem;">+ Add another app</button>
            </div>

            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Content</h4>
                <div class="form-group">
                    <label for="tpl-body">Body <span style="color:var(--danger)">*</span></label>
                    <textarea id="tpl-body" rows="3" required maxlength="1024">{{1}} is your verification code. For your security, do not share this code.</textarea>
                </div>
            </div>
        `;
    } else if (subtype === 'catalogue') {
        // Variant B: Marketing • Catalogue
        html += `
            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Catalogue format</h4>
                <p style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.75rem;">Choose the message format that best fits your needs.</p>
                <div style="display:flex; flex-direction:column; gap:0.6rem;">
                    <label class="option-radio-label">
                        <input type="radio" name="cat-format" value="single" checked>
                        <div>
                            <strong style="font-size:0.85rem; display:block;">Catalogue message</strong>
                            <span style="font-size:0.75rem; color:var(--text-muted);">Include the entire catalogue to give your users a comprehensive view of all your products.</span>
                        </div>
                    </label>
                    <label class="option-radio-label">
                        <input type="radio" name="cat-format" value="multi">
                        <div>
                            <strong style="font-size:0.85rem; display:block;">Multi product message</strong>
                            <span style="font-size:0.75rem; color:var(--text-muted);">Include up to 30 products from the catalogue.</span>
                        </div>
                    </label>
                </div>
            </div>

            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Catalogue setup</h4>
                <p style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.75rem;">Connecting a catalogue will allow customers to view, message and send carts containing your products and services via WhatsApp.</p>
                <button type="button" class="btn primary sm" onclick="showModal('Catalogue Info', 'Catalogue connects via Meta Commerce Manager API.')">Connect catalogue</button>
            </div>

            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Content</h4>
                <div class="form-group" style="margin-bottom:0.85rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label for="tpl-body">Body <span style="color:var(--danger)">*</span></label>
                        <span id="tpl-body-count" style="font-size:0.725rem; color:var(--text-muted)">0/1024</span>
                    </div>
                    <textarea id="tpl-body" rows="4" required maxlength="1024">Discover our latest products and bestsellers in our catalog. Browse and shop with ease on WhatsApp #happyshopping!</textarea>
                    <div class="meta-editor-toolbar" style="display:flex; gap:0.35rem; align-items:center; margin-top:0.35rem;">
                        <button type="button" class="btn secondary sm" id="btn-fmt-bold"><b>B</b></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-italic"><i>I</i></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-strike"><s>S</s></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-code">&lt;/&gt;</button>
                        <button type="button" id="btn-add-var" class="btn secondary sm" style="margin-left:auto; font-size:0.75rem;">+ Add variable ℹ</button>
                        ${getVariablePickerHtml('tpl-var-picker', 'tpl-body')}
                    </div>
                </div>
                <div class="form-group">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label for="tpl-footer">Footer - Optional</label>
                        <span id="tpl-footer-count" style="font-size:0.725rem; color:var(--text-muted)">0/60</span>
                    </div>
                    <input type="text" id="tpl-footer" placeholder="Add a short line of text to the bottom" maxlength="60">
                </div>
            </div>

            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Button</h4>
                <p style="font-size:0.775rem; color:var(--text-muted);">ⓘ Only one button is supported for this type of template. The button text is not editable (<code>View catalog</code>).</p>
            </div>
        `;
    } else if (subtype === 'calling_permissions') {
        // Variant C: Calling permissions request
        html += `
            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Content</h4>
                <p style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.85rem;">Add a header, body and footer for your template.</p>
                <div class="form-group" style="margin-bottom:0.85rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label for="tpl-body">Body <span style="color:var(--danger)">*</span></label>
                        <span id="tpl-body-count" style="font-size:0.725rem; color:var(--text-muted)">0/1024</span>
                    </div>
                    <textarea id="tpl-body" rows="4" required maxlength="1024">Can Jasper's Market call you? You can update your preference anytime in the business profile.</textarea>
                    <div class="meta-editor-toolbar" style="display:flex; gap:0.35rem; align-items:center; margin-top:0.35rem; position:relative;">
                        <button type="button" class="btn secondary sm" id="btn-fmt-bold"><b>B</b></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-italic"><i>I</i></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-strike"><s>S</s></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-code">&lt;/&gt;</button>
                        <button type="button" id="btn-add-var" class="btn secondary sm" style="margin-left:auto; font-size:0.75rem;">+ Add variable ℹ</button>
                        ${getVariablePickerHtml('tpl-var-picker', 'tpl-body')}
                    </div>
                </div>
            </div>

            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Buttons</h4>
                <p style="font-size:0.775rem; color:var(--text-muted);">ⓘ Only one button is supported for this type of template and the button text is not editable (<code>Choose preference ˅</code>).</p>
            </div>
        `;
    } else {
        // Variant A: Default (Marketing or Utility)
        html += `
            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Content</h4>
                <p style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.85rem; line-height:1.35;">Add a header, body and footer for your template. Cloud API hosted by Meta will review template content.</p>

                <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.85rem;">
                    <div class="form-group" style="flex:1; min-width:140px;">
                        <label for="tpl-var-type">Type of variable <span title="Choose whether variables are numbers or text/strings">ℹ</span></label>
                        <select id="tpl-var-type">
                            <option value="TEXT">Text / String</option>
                            <option value="NUMBER">Number</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex:1; min-width:140px;">
                        <label for="tpl-header-type">Media sample · Optional</label>
                        <select id="tpl-header-type">
                            <option value="NONE">None</option>
                            <option value="TEXT">Text Header</option>
                            <option value="IMAGE">📷 Image</option>
                            <option value="VIDEO">🎥 Video</option>
                            <option value="DOCUMENT">📄 Document</option>
                            <option value="LOCATION">📍 Location</option>
                        </select>
                    </div>
                </div>

                <!-- Media Upload Dropzone & File Card -->
                <div id="tpl-media-dropzone-wrapper" style="display:none; margin-bottom:0.85rem;">
                    <label style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.35rem; display:block;">Upload sample media file</label>
                    
                    <div id="tpl-media-dropzone" class="file-dropzone">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        <div style="font-size:0.85rem; color:var(--text-main); font-weight:600; margin-top:0.4rem;">Drag and drop to upload</div>
                        <div style="font-size:0.75rem; color:var(--primary); font-weight:500;">Or choose files on your device</div>
                        <input type="file" id="tpl-media-file-input" style="display:none;" accept="image/*,video/*,.pdf,.doc,.docx">
                    </div>

                    <!-- Uploaded Media File Bar with Thumbnail & Cross Remove Button -->
                    <div id="tpl-media-file-card" style="display:none; background:#e9eef6; border:1px solid #d3e3fd; padding:0.6rem 0.85rem; border-radius:8px; margin-top:0.5rem; align-items:center; justify-content:space-between; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.6rem; overflow:hidden;">
                            <img id="tpl-media-file-thumb" style="width:28px; height:28px; object-fit:cover; border-radius:4px; display:none;" src="">
                            <span id="tpl-media-file-icon" style="font-size:1.1rem; display:inline-block;">📁</span>
                            <span id="tpl-media-file-name-text" style="font-weight:700; color:#1a73e8; font-size:0.825rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">filename.mp4</span>
                            <span id="tpl-media-file-size-text" style="font-size:0.75rem; color:#5f6368; white-space:nowrap;">(14,463K)</span>
                        </div>
                        <button type="button" id="btn-remove-media-file" style="background:none; border:none; cursor:pointer; font-size:1.25rem; color:#5f6368; padding:0 0.3rem; line-height:1; font-weight:bold;" title="Remove media file">&times;</button>
                    </div>
                </div>

                <!-- Header Text Group -->
                <div class="form-group" id="tpl-header-text-group" style="display:none; margin-bottom:0.85rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label for="tpl-header-text">Header · Optional</label>
                        <span id="tpl-header-count" style="font-size:0.725rem; color:var(--text-muted)">0/60</span>
                    </div>
                    <input type="text" id="tpl-header-text" placeholder="Add a short line of text to the header of your message" maxlength="60">
                    <div style="display:flex; justify-content:flex-end; margin-top:0.25rem; position:relative;">
                        <button type="button" id="btn-add-header-var" class="btn secondary sm" style="font-size:0.725rem;">+ Add variable ℹ</button>
                        ${getVariablePickerHtml('tpl-header-var-picker', 'tpl-header-text')}
                    </div>
                </div>

                <!-- Body Group -->
                <div class="form-group" style="margin-bottom:0.85rem; position:relative;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label for="tpl-body">Body <span style="color:var(--danger)">*</span></label>
                        <span id="tpl-body-count" style="font-size:0.725rem; color:var(--text-muted)">0/1024</span>
                    </div>
                    <textarea id="tpl-body" rows="4" placeholder="${category === 'UTILITY' ? "Good news! Your order {{1}} has shipped! Here's your tracking information." : "Hello {{1}}, check out our fresh groceries now! Use code HEALTH to get 10% off."}" required maxlength="1024"></textarea>
                    
                    <div class="meta-editor-toolbar" style="display:flex; gap:0.35rem; align-items:center; margin-top:0.35rem; position:relative;">
                        <button type="button" class="btn secondary sm" id="btn-fmt-emoji" title="Add Emoji">😃</button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-bold" title="Bold"><b>B</b></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-italic" title="Italic"><i>I</i></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-strike" title="Strikethrough"><s>S</s></button>
                        <button type="button" class="btn secondary sm" id="btn-fmt-code" title="Monospace">&lt;/&gt;</button>
                        <button type="button" id="btn-add-var" class="btn secondary sm" style="margin-left:auto; font-size:0.75rem;">+ Add variable ℹ</button>
                        
                        <!-- Dynamic Variable Popover -->
                        ${getVariablePickerHtml('tpl-var-picker', 'tpl-body')}

                        <!-- Emoji Popover -->
                        <div id="tpl-emoji-picker" class="emoji-picker-popover" style="display:none;">
                            <span class="emoji-picker-item">😊</span>
                            <span class="emoji-picker-item">👍</span>
                            <span class="emoji-picker-item">🛍️</span>
                            <span class="emoji-picker-item">🛒</span>
                            <span class="emoji-picker-item">📦</span>
                            <span class="emoji-picker-item">🔥</span>
                            <span class="emoji-picker-item">⚡</span>
                            <span class="emoji-picker-item">🎁</span>
                            <span class="emoji-picker-item">🚀</span>
                            <span class="emoji-picker-item">🎉</span>
                            <span class="emoji-picker-item">💯</span>
                            <span class="emoji-picker-item">📌</span>
                            <span class="emoji-picker-item">📢</span>
                            <span class="emoji-picker-item">🔑</span>
                            <span class="emoji-picker-item">💬</span>
                            <span class="emoji-picker-item">📞</span>
                            <span class="emoji-picker-item">📍</span>
                            <span class="emoji-picker-item">⭐</span>
                        </div>
                    </div>
                </div>

                <!-- Variable Samples Container -->
                <div id="tpl-samples-container" style="margin-bottom:0.85rem;"></div>

                <!-- Footer Group -->
                <div class="form-group">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label for="tpl-footer">Footer · Optional</label>
                        <span id="tpl-footer-count" style="font-size:0.725rem; color:var(--text-muted)">0/60</span>
                    </div>
                    <input type="text" id="tpl-footer" placeholder="Add a short line of text to the bottom of your message" maxlength="60">
                </div>
            </div>

            <!-- Buttons Card -->
            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px; margin-top:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                    <div>
                        <h4 style="font-size:0.9rem; margin:0; color:var(--text-main);">Buttons · Optional</h4>
                        <p style="font-size:0.75rem; color:var(--text-muted); margin:0.2rem 0 0 0;">Create buttons that let customers respond to your message or take action (up to 10 total).</p>
                    </div>
                </div>
                
                <div class="tpl-btn-add-dropdown" style="margin-top:0.6rem; margin-bottom:0.75rem;">
                    <button type="button" id="btn-add-tpl-button-trigger" class="btn secondary sm" style="gap:0.4rem; font-weight:600;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Add button ▾</span>
                    </button>
                    <div id="tpl-btn-add-menu" class="tpl-btn-add-menu">
                        <div class="tpl-btn-add-menu-item" data-type="QUICK_REPLY">
                            <span>💬 Custom (Quick reply)</span>
                            <span style="font-size:0.7rem; color:var(--text-muted);">Up to 10</span>
                        </div>
                        <div class="tpl-btn-add-menu-item" data-type="URL">
                            <span>🔗 Visit website</span>
                            <span style="font-size:0.7rem; color:var(--primary); font-weight:600;">Max 2</span>
                        </div>
                        <div class="tpl-btn-add-menu-item" data-type="PHONE_NUMBER">
                            <span>📞 Call Phone Number</span>
                            <span style="font-size:0.7rem; color:var(--text-muted);">Max 1</span>
                        </div>
                        <div class="tpl-btn-add-menu-item" data-type="COPY_CODE">
                            <span>📋 Copy offer code</span>
                            <span style="font-size:0.7rem; color:var(--text-muted);">Max 1</span>
                        </div>
                    </div>
                </div>

                <div id="tpl-buttons-list" class="tpl-buttons-container"></div>
            </div>

            <!-- Message Validity Period Card (Utility templates only) -->
            ${category === 'UTILITY' ? `
            <div class="card" style="padding:1rem; border:1px solid var(--border); background:var(--bg-sidebar); border-radius:8px; margin-top:1rem;">
                <h4 style="font-size:0.9rem; margin-bottom:0.35rem; color:var(--text-main);">Message validity period</h4>
                <p style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0.85rem; line-height:1.4;">
                    You can set a custom validity period that your utility message must be delivered by before it expires. If a message has not been delivered within this time frame, you will not be charged and your customer will not see the message.
                </p>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.85rem; padding:0.6rem 0.85rem; background:var(--bg-card); border-radius:6px; border:1px solid var(--border);">
                    <span style="font-size:0.8rem; font-weight:600; color:var(--text-main);">Set custom validity period for your message</span>
                    <label class="switch-toggle" style="margin:0;">
                        <input type="checkbox" id="tpl-validity-toggle">
                        <span class="slider round"></span>
                    </label>
                </div>
                <div id="tpl-validity-select-group" class="form-group" style="display:none;">
                    <label for="tpl-validity-period" style="font-size:0.8rem;">Validity period <span title="Message expiration time limit">ℹ</span></label>
                    <select id="tpl-validity-period">
                        <option value="10_mins">10 minutes</option>
                        <option value="30_mins">30 minutes</option>
                        <option value="1_hour">1 hour</option>
                        <option value="3_hours">3 hours</option>
                        <option value="6_hours">6 hours</option>
                        <option value="12_hours" selected>12 hours</option>
                    </select>
                </div>
            </div>
            ` : ''}
        `;
    }

    form.innerHTML = html;

    // Attach Event Listeners to New Elements
    attachStep2FormListeners();
    updateLivePreview();
}

// Global Dynamic Button Builder Helpers
function addTemplateButton(type, data = {}) {
    const list = document.getElementById('tpl-buttons-list');
    if (!list) return;

    const rows = list.querySelectorAll('.tpl-btn-row');
    if (rows.length >= 10) {
        showModal('Button Limit Reached', 'WhatsApp templates support up to 10 buttons maximum.');
        return;
    }

    const typeCounts = { QUICK_REPLY: 0, URL: 0, PHONE_NUMBER: 0, COPY_CODE: 0 };
    rows.forEach(r => {
        const t = r.dataset.type;
        if (typeCounts[t] !== undefined) typeCounts[t]++;
    });

    if (type === 'URL' && typeCounts.URL >= 2) {
        showModal('Limit Reached', 'WhatsApp templates support a maximum of 2 "Visit website" buttons.');
        return;
    }
    if (type === 'PHONE_NUMBER' && typeCounts.PHONE_NUMBER >= 1) {
        showModal('Limit Reached', 'WhatsApp templates support a maximum of 1 "Call Phone Number" button.');
        return;
    }
    if (type === 'COPY_CODE' && typeCounts.COPY_CODE >= 1) {
        showModal('Limit Reached', 'WhatsApp templates support a maximum of 1 "Copy offer code" button.');
        return;
    }

    const rowId = 'btn-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const row = document.createElement('div');
    row.className = 'tpl-btn-row';
    row.dataset.type = type;
    row.id = rowId;
    row.style.cssText = 'background:var(--bg-card); border:1px solid var(--border); padding:0.75rem; border-radius:8px; margin-bottom:0.6rem; position:relative;';

    let title = '💬 Custom Quick Reply';
    let fieldsHtml = '';

    if (type === 'QUICK_REPLY') {
        title = '💬 Custom Quick Reply';
        const val = data.text || '';
        fieldsHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-main);">${title}</span>
                <button type="button" class="btn danger sm" onclick="removeTemplateButton('${rowId}')" style="padding:0.2rem 0.4rem; font-size:0.7rem;">Remove</button>
            </div>
            <input type="text" class="btn-text-input" value="${val.replace(/"/g, '&quot;')}" placeholder="Button text (e.g. Stop promotions)" maxlength="25" style="width:100%;">
        `;
    } else if (type === 'URL') {
        title = '🔗 Visit website (Max 2)';
        const valText = data.text || '';
        const valUrl = data.url || '';
        fieldsHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-main);">${title}</span>
                <button type="button" class="btn danger sm" onclick="removeTemplateButton('${rowId}')" style="padding:0.2rem 0.4rem; font-size:0.7rem;">Remove</button>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <input type="text" class="btn-text-input" value="${valText.replace(/"/g, '&quot;')}" placeholder="Button text (e.g. Shop Now)" maxlength="25" style="flex:1; min-width:130px;">
                <input type="url" class="btn-url-input" value="${valUrl.replace(/"/g, '&quot;')}" placeholder="https://example.com/offer" style="flex:2; min-width:180px;">
            </div>
        `;
    } else if (type === 'PHONE_NUMBER') {
        title = '📞 Call Phone Number';
        const valText = data.text || '';
        const valPhone = data.phone || data.phone_number || '';
        fieldsHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-main);">${title}</span>
                <button type="button" class="btn danger sm" onclick="removeTemplateButton('${rowId}')" style="padding:0.2rem 0.4rem; font-size:0.7rem;">Remove</button>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <input type="text" class="btn-text-input" value="${valText.replace(/"/g, '&quot;')}" placeholder="Button text (e.g. Call Us)" maxlength="25" style="flex:1; min-width:130px;">
                <input type="tel" class="btn-phone-input" value="${valPhone.replace(/"/g, '&quot;')}" placeholder="+919876543210" style="flex:1; min-width:140px;">
            </div>
        `;
    } else if (type === 'COPY_CODE') {
        title = '📋 Copy offer code';
        const valCode = data.code || data.example || '';
        fieldsHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.8rem; font-weight:600; color:var(--text-main);">${title}</span>
                <button type="button" class="btn danger sm" onclick="removeTemplateButton('${rowId}')" style="padding:0.2rem 0.4rem; font-size:0.7rem;">Remove</button>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                <input type="text" class="btn-text-input" value="Copy code" placeholder="Button label (e.g. Copy Code)" maxlength="25" style="flex:1; min-width:130px;">
                <input type="text" class="btn-code-input" value="${valCode.replace(/"/g, '&quot;')}" placeholder="Sample coupon (e.g. OFFER25)" maxlength="15" style="flex:1; min-width:130px;">
            </div>
        `;
    }

    row.innerHTML = fieldsHtml;
    list.appendChild(row);

    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateLivePreview);
    });

    updateLivePreview();
}

function removeTemplateButton(id) {
    const row = document.getElementById(id);
    if (row) {
        row.remove();
        updateLivePreview();
    }
}
window.addTemplateButton = addTemplateButton;
window.removeTemplateButton = removeTemplateButton;

// Global Media & Variable State
let currentMediaSampleFile = null;
let currentMediaSampleUrl = null;
let editingTemplateHeaderHandle = null;
let editingTemplateHeaderUrl = null;

function attachStep2FormListeners() {
    const nameInput = document.getElementById('tpl-name');
    nameInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        updateBannerTitle();
        updateLivePreview();
    });

    // Language change listener
    document.getElementById('tpl-lang')?.addEventListener('change', () => {
        updateBannerTitle();
        updateLivePreview();
    });

    // Type of variable listener
    document.getElementById('tpl-var-type')?.addEventListener('change', () => {
        updateLivePreview();
    });

    // Media sample / Header type dropdown listener
    document.getElementById('tpl-header-type')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const textGroup = document.getElementById('tpl-header-text-group');
        const mediaGroup = document.getElementById('tpl-media-dropzone-wrapper');

        if (textGroup) textGroup.style.display = val === 'TEXT' ? 'block' : 'none';
        if (mediaGroup) mediaGroup.style.display = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(val) ? 'block' : 'none';

        updateLivePreview();
    });

    // Media Dropzone & File Input listeners
    const dropzone = document.getElementById('tpl-media-dropzone');
    const fileInput = document.getElementById('tpl-media-file-input');
    const fileCardEl = document.getElementById('tpl-media-file-card');
    const fileNameTextEl = document.getElementById('tpl-media-file-name-text');
    const fileSizeTextEl = document.getElementById('tpl-media-file-size-text');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleMediaFileSelected(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleMediaFileSelected(e.target.files[0]);
            }
        });
    }

    document.getElementById('btn-remove-media-file')?.addEventListener('click', (e) => {
        e.stopPropagation();
        removeMediaFile();
    });

    function handleMediaFileSelected(file) {
        currentMediaSampleFile = file;
        currentMediaSampleUrl = URL.createObjectURL(file);

        const mediaThumbEl = document.getElementById('tpl-media-file-thumb');
        const mediaIconEl = document.getElementById('tpl-media-file-icon');

        if (fileNameTextEl) fileNameTextEl.textContent = file.name;
        if (fileSizeTextEl) fileSizeTextEl.textContent = `(${(file.size / 1024).toFixed(0)}K)`;

        if (file.type.startsWith('image/')) {
            if (mediaThumbEl) {
                mediaThumbEl.src = currentMediaSampleUrl;
                mediaThumbEl.style.display = 'block';
            }
            if (mediaIconEl) mediaIconEl.style.display = 'none';
        } else if (file.type.startsWith('video/')) {
            if (mediaThumbEl) mediaThumbEl.style.display = 'none';
            if (mediaIconEl) {
                mediaIconEl.textContent = '🎥';
                mediaIconEl.style.display = 'inline-block';
            }
        } else {
            if (mediaThumbEl) mediaThumbEl.style.display = 'none';
            if (mediaIconEl) {
                mediaIconEl.textContent = '📄';
                mediaIconEl.style.display = 'inline-block';
            }
        }

        if (dropzone) dropzone.style.display = 'none';
        if (fileCardEl) fileCardEl.style.display = 'flex';

        updateLivePreview();
    }

    function removeMediaFile() {
        currentMediaSampleFile = null;
        editingTemplateHeaderHandle = null;
        editingTemplateHeaderUrl = null;
        if (currentMediaSampleUrl) {
            URL.revokeObjectURL(currentMediaSampleUrl);
            currentMediaSampleUrl = null;
        }

        if (fileInput) fileInput.value = '';

        if (fileCardEl) fileCardEl.style.display = 'none';
        if (dropzone) dropzone.style.display = 'block';

        updateLivePreview();
    }

    // Header and Body Variable pickers handled via initVarPickers()

    // Utility validity period toggle listener
    document.getElementById('tpl-validity-toggle')?.addEventListener('change', (e) => {
        const selectGroup = document.getElementById('tpl-validity-select-group');
        if (selectGroup) selectGroup.style.display = e.target.checked ? 'block' : 'none';
    });

    // Inputs listeners for live preview & sample inputs refresh
    document.getElementById('tpl-header-text')?.addEventListener('input', updateLivePreview);
    document.getElementById('tpl-body')?.addEventListener('input', updateLivePreview);
    document.getElementById('tpl-footer')?.addEventListener('input', updateLivePreview);

    // Emoji Picker Trigger
    const emojiBtn = document.getElementById('btn-fmt-emoji');
    const emojiPicker = document.getElementById('tpl-emoji-picker');

    emojiBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (emojiPicker) {
            emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.style.display = 'none';
        }
    });

    emojiPicker?.querySelectorAll('.emoji-picker-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const emoji = item.textContent;
            const bodyEl = document.getElementById('tpl-body');
            if (bodyEl) {
                const start = bodyEl.selectionStart || bodyEl.value.length;
                const end = bodyEl.selectionEnd || bodyEl.value.length;
                bodyEl.value = bodyEl.value.substring(0, start) + emoji + bodyEl.value.substring(end);
                bodyEl.focus();
                bodyEl.setSelectionRange(start + emoji.length, start + emoji.length);
                updateLivePreview();
            }
            emojiPicker.style.display = 'none';
        });
    });

    // Button Add Dropdown Trigger
    const triggerBtn = document.getElementById('btn-add-tpl-button-trigger');
    const menu = document.getElementById('tpl-btn-add-menu');

    triggerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        menu?.classList.toggle('active');
    });

    document.addEventListener('click', () => {
        menu?.classList.remove('active');
    });

    menu?.querySelectorAll('.tpl-btn-add-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.classList.contains('disabled')) return;
            const type = item.dataset.type;
            menu.classList.remove('active');
            addTemplateButton(type);
        });
    });

    const applyFormat = (wrapChar, doubleWrap = false) => {
        const bodyEl = document.getElementById('tpl-body');
        if (!bodyEl) return;
        const start = bodyEl.selectionStart;
        const end = bodyEl.selectionEnd;
        const text = bodyEl.value;
        const selected = text.substring(start, end) || 'text';
        const wrapper = doubleWrap ? `${wrapChar}${wrapChar}${wrapChar}` : wrapChar;
        const replacement = `${wrapper}${selected}${wrapper}`;
        bodyEl.value = text.substring(0, start) + replacement + text.substring(end);
        bodyEl.focus();
        bodyEl.setSelectionRange(start + wrapper.length, start + wrapper.length + selected.length);
        updateLivePreview();
    };

    document.getElementById('btn-fmt-bold')?.addEventListener('click', () => applyFormat('*'));
    document.getElementById('btn-fmt-italic')?.addEventListener('click', () => applyFormat('_'));
    document.getElementById('btn-fmt-strike')?.addEventListener('click', () => applyFormat('~'));
    document.getElementById('btn-fmt-code')?.addEventListener('click', () => applyFormat('`', true));

    // Wire Dynamic Broadcast Variable Pickers
    initVarPickers();
}

function updateLivePreview() {
    const nameVal = document.getElementById('tpl-name')?.value || '';
    const varType = document.getElementById('tpl-var-type')?.value || 'TEXT';
    const headerType = document.getElementById('tpl-header-type')?.value || 'NONE';
    const headerTextVal = document.getElementById('tpl-header-text')?.value || '';
    const bodyVal = document.getElementById('tpl-body')?.value || '';
    const footerVal = document.getElementById('tpl-footer')?.value || '';

    // Update Counters
    const nameCountEl = document.getElementById('tpl-name-count');
    if (nameCountEl) nameCountEl.textContent = `${nameVal.length}/512`;

    const headerCountEl = document.getElementById('tpl-header-count');
    if (headerCountEl) headerCountEl.textContent = `${headerTextVal.length}/60`;

    const bodyCountEl = document.getElementById('tpl-body-count');
    if (bodyCountEl) bodyCountEl.textContent = `${bodyVal.length}/1024`;

    const footerCountEl = document.getElementById('tpl-footer-count');
    if (footerCountEl) footerCountEl.textContent = `${footerVal.length}/60`;

    // Refresh Variable Samples Input Box
    refreshVariableSampleFields(varType);

    // Collect Variable Samples Values
    const sampleValues = {};
    document.querySelectorAll('.tpl-var-sample-input').forEach(inp => {
        if (inp.dataset.varKey) sampleValues[inp.dataset.varKey] = inp.value;
        if (inp.dataset.var) sampleValues[inp.dataset.var] = inp.value;
    });

    // Header Element
    const headerEl = document.getElementById('wa-preview-header');
    if (headerEl) {
        if (currentSelectedSubtype === 'catalogue') {
            headerEl.style.display = 'block';
            headerEl.innerHTML = `
                <div style="background:#f0f2f5; padding:0.6rem; border-radius:8px; display:flex; gap:0.5rem; align-items:center; margin-bottom:0.35rem;">
                    <div style="font-size:1.5rem;">🛍️</div>
                    <div style="font-size:0.75rem; text-align:left;">
                        <strong style="display:block; color:#111b21;">View Catalog on WhatsApp</strong>
                        <span style="color:#667781; font-size:0.68rem;">Browse pictures and details of our offerings.</span>
                    </div>
                </div>
            `;
        } else if (headerType === 'TEXT' && headerTextVal.trim()) {
            headerEl.style.display = 'block';
            let formattedHeader = headerTextVal.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
                const sample = sampleValues[`header_${p1}`] || sampleValues[p1] || getSmartSample(p1, varType);
                return `<span style="background:rgba(0,168,132,0.15);color:#00a884;padding:0.1rem 0.35rem;border-radius:4px;font-weight:700;">${sample}</span>`;
            });
            headerEl.innerHTML = formattedHeader;
        } else if (headerType === 'IMAGE') {
            headerEl.style.display = 'block';
            if (currentMediaSampleUrl) {
                headerEl.innerHTML = `<img src="${currentMediaSampleUrl}" style="width:100%; border-radius:10px; max-height:160px; object-fit:cover; margin-bottom:0.4rem; display:block;">`;
            } else {
                headerEl.innerHTML = `
                    <div style="background:#8f9ca8; border-radius:10px; height:140px; display:flex; align-items:center; justify-content:center; margin-bottom:0.4rem;">
                        <svg viewBox="0 0 24 24" width="56" height="56" fill="#ffffff"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                    </div>
                `;
            }
        } else if (headerType === 'VIDEO') {
            headerEl.style.display = 'block';
            if (currentMediaSampleUrl) {
                headerEl.innerHTML = `<video src="${currentMediaSampleUrl}" controls autoplay muted loop style="width:100%; border-radius:10px; max-height:160px; object-fit:cover; margin-bottom:0.4rem; display:block;"></video>`;
            } else {
                headerEl.innerHTML = `
                    <div style="background:#8f9ca8; border-radius:10px; height:140px; display:flex; align-items:center; justify-content:center; margin-bottom:0.4rem;">
                        <svg viewBox="0 0 24 24" width="64" height="64" fill="#ffffff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                    </div>
                `;
            }
        } else if (headerType === 'DOCUMENT') {
            headerEl.style.display = 'block';
            if (currentMediaSampleUrl) {
                headerEl.innerHTML = `
                    <div style="background:#f0f2f5; padding:0.75rem; border-radius:8px; display:flex; align-items:center; gap:0.6rem; margin-bottom:0.4rem; border:1px solid var(--border);">
                        <span style="font-size:1.5rem;">📄</span>
                        <div style="font-size:0.75rem; overflow:hidden;">
                            <strong style="display:block; color:#111b21; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${currentMediaSampleFile ? currentMediaSampleFile.name : 'Document.pdf'}</strong>
                            <span style="color:#667781; font-size:0.68rem;">PDF Document</span>
                        </div>
                    </div>
                `;
            } else {
                headerEl.innerHTML = `
                    <div style="background:#8f9ca8; border-radius:10px; height:100px; display:flex; align-items:center; justify-content:center; margin-bottom:0.4rem;">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="#ffffff"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                    </div>
                `;
            }
        } else if (headerType === 'LOCATION') {
            headerEl.style.display = 'block';
            headerEl.innerHTML = `
                <div style="background:#9ca3af; color:#ffffff; border-radius:10px; padding:1.25rem 0.85rem 0.75rem 0.85rem; text-align:center; position:relative; overflow:hidden; margin-bottom:0.4rem; box-shadow:0 1px 3px rgba(0,0,0,0.12);">
                    <div style="display:flex; justify-content:center; align-items:center; margin-bottom:0.6rem;">
                        <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    </div>
                    <div style="text-align:left; background:rgba(0,0,0,0.22); padding:0.45rem 0.65rem; border-radius:6px; font-size:0.725rem; line-height:1.35;">
                        <div style="font-weight:700; color:#ffffff;">{{Location name}}</div>
                        <div style="font-size:0.68rem; color:rgba(255,255,255,0.85);">{{Address}}</div>
                    </div>
                </div>
            `;
        } else {
            headerEl.style.display = 'none';
        }
    }

    // Body Text Element
    const bodyEl = document.getElementById('wa-preview-body');
    if (bodyEl) {
        let textToDisplay = bodyVal.trim();

        if (!textToDisplay) {
            if (currentSelectedCategory === 'MARKETING') {
                if (currentSelectedSubtype === 'catalogue') {
                    textToDisplay = "Discover our latest products and bestsellers in our catalog. Browse and shop with ease on WhatsApp #happyshopping!";
                } else if (currentSelectedSubtype === 'calling_permissions') {
                    textToDisplay = "Can Jasper's Market call you?\n\nYou can update your preference anytime in the business profile.";
                } else {
                    textToDisplay = "Hey there! Check out our fresh groceries now!\n\nUse code HEALTH to get additional 10% off on your entire purchase.";
                }
            } else if (currentSelectedCategory === 'UTILITY') {
                if (currentSelectedSubtype === 'calling_permissions') {
                    textToDisplay = "Can Jasper's Market call you?\n\nYou can update your preference anytime in the business profile.";
                } else {
                    textToDisplay = "Good news! Your order {{1}} has shipped!\n\nHere's your tracking information, please check link below.";
                }
            } else if (currentSelectedCategory === 'AUTHENTICATION') {
                textToDisplay = "{{1}} is your verification code. For your security, do not share this code.";
            }
        }

        let formatted = textToDisplay.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
            const sample = sampleValues[`body_${p1}`] || sampleValues[p1] || getSmartSample(p1, varType);
            return `<span style="background:rgba(0,168,132,0.15);color:#00a884;padding:0.1rem 0.35rem;border-radius:4px;font-weight:700;">${sample}</span>`;
        });

        formatted = formatted
            .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            .replace(/~(.*?)~/g, '<del>$1</del>')
            .replace(/```(.*?)```/g, '<code style="font-family:monospace;background:#f0f2f5;padding:0.1rem 0.3rem;border-radius:3px;">$1</code>');

        bodyEl.innerHTML = formatted;
    }

    // Footer Text Element
    const footerEl = document.getElementById('wa-preview-footer');
    if (footerEl) {
        if (footerVal.trim()) {
            footerEl.style.display = 'block';
            footerEl.textContent = footerVal;
        } else {
            footerEl.style.display = 'none';
        }
    }

    // Buttons Element Preview
    const buttonsEl = document.getElementById('wa-preview-buttons');
    if (buttonsEl) {
        if (currentSelectedSubtype === 'catalogue') {
            buttonsEl.style.display = 'flex';
            buttonsEl.innerHTML = `<div class="wa-btn-item">🛒 View catalog</div>`;
        } else if (currentSelectedSubtype === 'calling_permissions') {
            buttonsEl.style.display = 'flex';
            buttonsEl.innerHTML = `
                <div class="wa-btn-item" style="flex-direction:column; align-items:stretch; gap:0.4rem; background:#f8f9fa; border:1px solid #e9edef; padding:0.6rem; border-radius:8px;">
                    <div style="font-weight:700; color:#111b21; font-size:0.775rem;">Choose preference ˅</div>
                    <div style="font-size:0.725rem; color:#667781; display:flex; flex-direction:column; gap:0.25rem; text-align:left; margin-top:0.25rem;">
                        <div>🔘 Always allow calls</div>
                        <div>⚪ Temporarily allow calls</div>
                        <div>⚪ Not now</div>
                    </div>
                </div>
            `;
        } else if (currentSelectedCategory === 'AUTHENTICATION') {
            buttonsEl.style.display = 'flex';
            buttonsEl.innerHTML = `<div class="wa-btn-item">📋 Copy code</div>`;
        } else {
            const btnRows = document.querySelectorAll('#tpl-buttons-list .tpl-btn-row');
            if (btnRows.length > 0) {
                buttonsEl.style.display = 'flex';
                let previewHtml = '';
                btnRows.forEach(row => {
                    const type = row.dataset.type;
                    if (type === 'QUICK_REPLY') {
                        const txt = row.querySelector('.btn-text-input')?.value || 'Quick reply';
                        previewHtml += `<div class="wa-btn-item">💬 ${txt}</div>`;
                    } else if (type === 'URL') {
                        const txt = row.querySelector('.btn-text-input')?.value || 'Visit website';
                        previewHtml += `<div class="wa-btn-item">↗ ${txt}</div>`;
                    } else if (type === 'PHONE_NUMBER') {
                        const txt = row.querySelector('.btn-text-input')?.value || 'Call Us';
                        previewHtml += `<div class="wa-btn-item">📞 ${txt}</div>`;
                    } else if (type === 'COPY_CODE') {
                        const code = row.querySelector('.btn-code-input')?.value || 'OFFER25';
                        previewHtml += `<div class="wa-btn-item">📋 Copy code (${code})</div>`;
                    }
                });
                buttonsEl.innerHTML = previewHtml;
            } else if (currentSelectedCategory === 'UTILITY') {
                buttonsEl.style.display = 'flex';
                buttonsEl.innerHTML = `<div class="wa-btn-item">↗ Track shipment</div>`;
            } else if (currentSelectedCategory === 'MARKETING') {
                buttonsEl.style.display = 'flex';
                buttonsEl.innerHTML = `
                    <div class="wa-btn-item">↗ Shop now</div>
                    <div class="wa-btn-item">📋 Copy code</div>
                `;
            } else {
                buttonsEl.style.display = 'none';
            }
        }
    }

    // Good for summary
    const goodforEl = document.getElementById('wa-preview-goodfor');
    if (goodforEl) {
        if (currentSelectedCategory === 'MARKETING') {
            if (currentSelectedSubtype === 'catalogue') {
                goodforEl.textContent = 'Product/service discovery, sales, offers, targeted product catalog promotions.';
            } else if (currentSelectedSubtype === 'calling_permissions') {
                goodforEl.textContent = 'When you wish to call your customer directly on WhatsApp for service or consultation.';
            } else {
                goodforEl.textContent = 'Welcome messages, promotions, offers, coupons, customer engagement.';
            }
        } else if (currentSelectedCategory === 'UTILITY') {
            goodforEl.textContent = 'Order confirmations, shipping updates, receipts, account notifications.';
        } else {
            goodforEl.textContent = 'One-time passwords, account recovery codes, verification & login alerts.';
        }
    }
}

function refreshVariableSampleFields(varType = 'TEXT') {
    const container = document.getElementById('tpl-samples-container');
    if (!container) return;

    const headerText = document.getElementById('tpl-header-text')?.value || '';
    const bodyText = document.getElementById('tpl-body')?.value || '';

    const headerMatches = Array.from(new Set([...headerText.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map(m => m[1])));
    const bodyMatches = Array.from(new Set([...bodyText.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map(m => m[1])));

    if (headerMatches.length === 0 && bodyMatches.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const existingValues = {};
    container.querySelectorAll('.tpl-var-sample-input').forEach(inp => {
        if (inp.dataset.varKey) existingValues[inp.dataset.varKey] = inp.value;
        if (inp.dataset.var) existingValues[inp.dataset.var] = inp.value;
    });

    let html = `
        <div class="tpl-sample-box">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <h5 style="font-size:0.825rem; font-weight:700; margin:0; color:var(--text-main); display:flex; align-items:center; gap:0.4rem;">
                    <span>⚡</span> Samples for Dynamic Variables
                </h5>
                <span class="badge" style="font-size:0.68rem; background:rgba(0,168,132,0.12); color:#00a884; font-weight:700;">Meta Requirement</span>
            </div>
            <p style="font-size:0.725rem; color:var(--text-muted); margin-bottom:0.75rem; line-height:1.35;">
                Specify example values for Meta template verification. When launching broadcasts, these variables automatically pull live data from your customers table and company profile.
            </p>
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
    `;

    headerMatches.forEach(varKey => {
        const smart = getSmartSample(varKey, varType);
        const val = existingValues[`header_${varKey}`] || existingValues[varKey] || smart;
        html += `
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <label style="font-size:0.75rem; font-weight:600; width:130px; color:var(--primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="Header {{${varKey}}}">
                    Header {{${varKey}}}
                </label>
                <input type="text" class="tpl-var-sample-input" 
                       data-var="${varKey}" 
                       data-var-key="header_${varKey}" 
                       name="var_${varKey}" 
                       value="${val.replace(/"/g, '&quot;')}" 
                       placeholder="e.g. ${smart}" 
                       style="flex:1; padding:0.4rem 0.6rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border); background:var(--bg-input);">
            </div>
        `;
    });

    bodyMatches.forEach(varKey => {
        const smart = getSmartSample(varKey, varType);
        const val = existingValues[`body_${varKey}`] || existingValues[varKey] || smart;
        html += `
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <label style="font-size:0.75rem; font-weight:600; width:130px; color:var(--primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="Body {{${varKey}}}">
                    Body {{${varKey}}}
                </label>
                <input type="text" class="tpl-var-sample-input" 
                       data-var="${varKey}" 
                       data-var-key="body_${varKey}" 
                       name="var_${varKey}" 
                       value="${val.replace(/"/g, '&quot;')}" 
                       placeholder="e.g. ${smart}" 
                       style="flex:1; padding:0.4rem 0.6rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border); background:var(--bg-input);">
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.tpl-var-sample-input').forEach(inp => {
        inp.addEventListener('input', () => {
            const currentSamples = {};
            container.querySelectorAll('.tpl-var-sample-input').forEach(i => {
                if (i.dataset.varKey) currentSamples[i.dataset.varKey] = i.value;
                if (i.dataset.var) currentSamples[i.dataset.var] = i.value;
            });

            const headerEl = document.getElementById('wa-preview-header');
            const headerType = document.getElementById('tpl-header-type')?.value;
            const headerTextVal = document.getElementById('tpl-header-text')?.value || '';
            if (headerEl && headerType === 'TEXT' && headerTextVal.trim()) {
                headerEl.innerHTML = headerTextVal.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
                    const sample = currentSamples[`header_${p1}`] || currentSamples[p1] || getSmartSample(p1, varType);
                    return `<span style="background:rgba(0,168,132,0.15);color:#00a884;padding:0.1rem 0.35rem;border-radius:4px;font-weight:700;">${sample}</span>`;
                });
            }

            const bodyEl = document.getElementById('wa-preview-body');
            const bodyVal = document.getElementById('tpl-body')?.value || '';
            if (bodyEl && bodyVal.trim()) {
                let formatted = bodyVal.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
                    const sample = currentSamples[`body_${p1}`] || currentSamples[p1] || getSmartSample(p1, varType);
                    return `<span style="background:rgba(0,168,132,0.15);color:#00a884;padding:0.1rem 0.35rem;border-radius:4px;font-weight:700;">${sample}</span>`;
                });
                formatted = formatted
                    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                    .replace(/_(.*?)_/g, '<em>$1</em>')
                    .replace(/~(.*?)~/g, '<del>$1</del>')
                    .replace(/```(.*?)```/g, '<code style="font-family:monospace;background:#f0f2f5;padding:0.1rem 0.3rem;border-radius:3px;">$1</code>');
                bodyEl.innerHTML = formatted;
            }
        });
    });
}

function resetTemplateModal() {
    editingTemplateId = null;
    editingTemplateHeaderHandle = null;
    editingTemplateHeaderUrl = null;
    currentMediaSampleFile = null;
    if (currentMediaSampleUrl) {
        URL.revokeObjectURL(currentMediaSampleUrl);
        currentMediaSampleUrl = null;
    }
    currentSelectedCategory = 'MARKETING';
    currentSelectedSubtype = 'default';

    // Reset Category Tabs UI
    document.querySelectorAll('.meta-tabs .tab-btn').forEach(b => {
        if (b.getAttribute('data-category') === 'MARKETING') b.classList.add('active');
        else b.classList.remove('active');
    });

    // Reset Submit Button
    const submitBtn = document.getElementById('btn-submit-tpl');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Template to Meta';
    }

    // Reset Name Input
    const nameInput = document.getElementById('tpl-name');
    if (nameInput) {
        nameInput.disabled = false;
        nameInput.value = '';
    }

    // Reset Header, Body, Footer Inputs
    const headerText = document.getElementById('tpl-header-text');
    if (headerText) headerText.value = '';
    const headerType = document.getElementById('tpl-header-type');
    if (headerType) headerType.value = 'NONE';
    const bodyInput = document.getElementById('tpl-body');
    if (bodyInput) bodyInput.value = '';
    const footerInput = document.getElementById('tpl-footer');
    if (footerInput) footerInput.value = '';

    // Clear Dynamic Buttons List
    const listContainer = document.getElementById('tpl-buttons-list');
    if (listContainer) listContainer.innerHTML = '';

    // Reset Language Select
    const langSelect = document.getElementById('tpl-lang');
    if (langSelect) langSelect.value = 'en';

    // Reset Banner Title
    const bannerTitle = document.getElementById('tpl-banner-title');
    if (bannerTitle) bannerTitle.textContent = 'your_template_name • English';
}

function openTemplateModal() {
    if (templatesCache && templatesCache.is_view_only) {
        showModal('Meta Setup Required', 'This company is in View-Only mode because Meta WhatsApp credentials have not been configured. Configure Meta app details in Settings to create or manage templates for other companies.');
        return;
    }
    const modal = document.getElementById('template-create-modal');
    if (modal) {
        resetTemplateModal();
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (typeof goToStep === 'function') goToStep(1);
        if (typeof renderSubtypes === 'function') renderSubtypes(currentSelectedCategory);
        if (typeof updateLivePreview === 'function') updateLivePreview();
    }
}

function closeTemplateModal() {
    const modal = document.getElementById('template-create-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        resetTemplateModal();
    }
}

window.resetTemplateModal = resetTemplateModal;
window.openTemplateModal = openTemplateModal;
window.closeTemplateModal = closeTemplateModal;

// Modal Event Listeners Setup
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('template-create-modal');
    const openBtn = document.getElementById('btn-create-template');
    const closeBtn = document.getElementById('close-template-modal');
    const discardBtn = document.getElementById('btn-discard-tpl');

    openBtn?.addEventListener('click', openTemplateModal);
    closeBtn?.addEventListener('click', closeTemplateModal);
    discardBtn?.addEventListener('click', closeTemplateModal);

    document.getElementById('btn-next-step')?.addEventListener('click', () => {
        goToStep(2);
    });

    document.getElementById('btn-prev-step')?.addEventListener('click', () => {
        goToStep(1);
    });

    // Category Tabs
    document.querySelectorAll('.meta-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.meta-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSelectedCategory = btn.getAttribute('data-category');
            renderSubtypes(currentSelectedCategory);
            updateLivePreview();
        });
    });

    // Auto-sanitize Template Name
    const nameInput = document.getElementById('tpl-name');
    nameInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        updateLivePreview();
    });

    // Header Format Change
    document.getElementById('tpl-header-type')?.addEventListener('change', (e) => {
        const type = e.target.value;
        const textGroup = document.getElementById('tpl-header-text-group');
        if (textGroup) textGroup.style.display = type === 'TEXT' ? 'block' : 'none';
        updateLivePreview();
    });

    // Header Text, Body, Footer Input Handlers
    document.getElementById('tpl-header-text')?.addEventListener('input', updateLivePreview);
    document.getElementById('tpl-body')?.addEventListener('input', updateLivePreview);
    document.getElementById('tpl-footer')?.addEventListener('input', updateLivePreview);

    // Formatting Toolbar Helpers (*bold*, _italic_, ~strike~, ```code```)
    const applyFormat = (wrapChar, doubleWrap = false) => {
        const bodyEl = document.getElementById('tpl-body');
        if (!bodyEl) return;
        const start = bodyEl.selectionStart;
        const end = bodyEl.selectionEnd;
        const text = bodyEl.value;
        const selected = text.substring(start, end) || 'text';
        const wrapper = doubleWrap ? `${wrapChar}${wrapChar}${wrapChar}` : wrapChar;
        const replacement = `${wrapper}${selected}${wrapper}`;
        bodyEl.value = text.substring(0, start) + replacement + text.substring(end);
        bodyEl.focus();
        bodyEl.setSelectionRange(start + wrapper.length, start + wrapper.length + selected.length);
        updateLivePreview();
    };

    document.getElementById('btn-fmt-bold')?.addEventListener('click', () => applyFormat('*'));
    document.getElementById('btn-fmt-italic')?.addEventListener('click', () => applyFormat('_'));
    document.getElementById('btn-fmt-strike')?.addEventListener('click', () => applyFormat('~'));
    document.getElementById('btn-fmt-code')?.addEventListener('click', () => applyFormat('`', true));

    // Wire Dynamic Broadcast Variable Pickers
    initVarPickers();

    // Submit Template for Review
    document.getElementById('btn-submit-tpl')?.addEventListener('click', async () => {
        const name = document.getElementById('tpl-name')?.value.trim();
        const lang = document.getElementById('tpl-lang')?.value;
        const category = currentSelectedCategory;
        const headerType = document.getElementById('tpl-header-type')?.value;
        const headerText = document.getElementById('tpl-header-text')?.value.trim();
        const bodyText = document.getElementById('tpl-body')?.value.trim();
        const footerText = document.getElementById('tpl-footer')?.value.trim();
        const buttonType = document.getElementById('tpl-button-type')?.value;

        if (!name) {
            showModal('Validation Error', 'Please enter a valid template name.');
            return;
        }

        if (!bodyText) {
            showModal('Validation Error', 'Body text is required for WhatsApp templates.');
            return;
        }

        const submitBtn = document.getElementById('btn-submit-tpl');
        const origBtnText = submitBtn ? (submitBtn.dataset.origText || submitBtn.innerHTML) : 'Submit Template to Meta';

        const resetSubmitBtn = () => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.pointerEvents = 'auto';
                submitBtn.innerHTML = origBtnText;
            }
        };

        if (submitBtn) {
            submitBtn.dataset.origText = origBtnText;
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
            submitBtn.style.pointerEvents = 'none';
            if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && currentMediaSampleFile) {
                submitBtn.innerHTML = '<span class="spinner"></span> Uploading sample media to Meta...';
            } else {
                submitBtn.innerHTML = '<span class="spinner"></span> Submitting to Meta...';
            }
        }

        // Validate Zero-Tap Consent Box if Zero-Tap is selected
        if (category === 'AUTHENTICATION') {
            const otpRadio = document.querySelector('input[name="otp-type"]:checked')?.value;
            const consentCb = document.getElementById('zt-consent-cb');
            const errBanner = document.getElementById('zt-consent-error');

            if (otpRadio === 'zero_tap' && consentCb && !consentCb.checked) {
                if (errBanner) errBanner.style.display = 'flex';
                resetSubmitBtn();
                return;
            } else if (errBanner) {
                errBanner.style.display = 'none';
            }
        }

        // Construct Meta Components Array
        const components = [];

        // Header Component
        if (headerType === 'TEXT' && headerText) {
            const headerComp = {
                type: 'HEADER',
                format: 'TEXT',
                text: headerText
            };
            const hPosMatches = [...headerText.matchAll(/\{\{(\d+)\}\}/g)];
            const hNamedMatches = [...headerText.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
            if (hPosMatches.length > 0) {
                const domHeaderSample = document.querySelector('input[data-var-key="header_1"], input[data-var="1"]')?.value.trim();
                headerComp.example = { header_text: [domHeaderSample || "Sample Header"] };
            } else if (hNamedMatches.length > 0) {
                const pName = hNamedMatches[0][1];
                const domHeaderSample = document.querySelector(`input[data-var-key="header_${pName}"], input[data-var="${pName}"]`)?.value.trim();
                headerComp.example = {
                    header_text_named_params: [{
                        param_name: pName,
                        example: domHeaderSample || getSmartSample(pName, 'TEXT')
                    }]
                };
            }
            components.push(headerComp);
        } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
            let handle = null;

            if (currentMediaSampleFile) {
                try {
                    handle = await getMetaHeaderHandle(currentMediaSampleFile);
                } catch (err) {
                    console.error('Sample media upload error:', err);
                    resetSubmitBtn();
                    showModal('Sample Media Upload Error', `Failed to upload sample ${headerType.toLowerCase()} to Meta: ${err.message}. Please select the file again.`);
                    return;
                }
            } else if (editingTemplateHeaderHandle) {
                handle = editingTemplateHeaderHandle;
            } else if (editingTemplateId && typeof templatesCache !== 'undefined') {
                const tpl = templatesCache.find(t => String(t.id || t.name) === String(editingTemplateId));
                const oldHeader = tpl?.components?.find(c => c.type === 'HEADER');
                if (oldHeader?.example?.header_handle?.[0]) {
                    handle = oldHeader.example.header_handle[0];
                }
            }

            if (!handle && editingTemplateHeaderUrl) {
                components.push({
                    type: 'HEADER',
                    format: headerType,
                    example: { header_url: [editingTemplateHeaderUrl] }
                });
            } else if (handle) {
                components.push({
                    type: 'HEADER',
                    format: headerType,
                    example: { header_handle: [handle] }
                });
            } else {
                resetSubmitBtn();
                showModal('Sample File Required', `Meta requires a sample ${headerType.toLowerCase()} file for template verification. Please drag & drop or select a sample ${headerType.toLowerCase()} file in the "Upload sample media file" box.`);
                return;
            }
        } else if (headerType === 'LOCATION') {
            components.push({
                type: 'HEADER',
                format: 'LOCATION'
            });
        }

        // Body Component supporting both named (e.g. {{customer_name}}) and positional (e.g. {{1}}) variables
        const bodyComp = {
            type: 'BODY',
            text: bodyText
        };

        const posMatches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
        const namedMatches = [...bodyText.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];

        let parameterFormat = null;
        if (posMatches.length > 0) {
            parameterFormat = 'POSITIONAL';
            const seen = new Set();
            const samples = [];
            posMatches.forEach((m, idx) => {
                const num = m[1];
                if (!seen.has(num)) {
                    seen.add(num);
                    const domSample = document.querySelector(`input[data-var="${num}"], input[name="var_${num}"]`)?.value.trim();
                    samples.push(domSample || `Sample_${idx + 1}`);
                }
            });
            bodyComp.example = { body_text: [samples] };
        } else if (namedMatches.length > 0) {
            parameterFormat = 'NAMED';
            const seen = new Set();
            const namedParams = [];
            namedMatches.forEach(m => {
                const paramName = m[1];
                if (!seen.has(paramName)) {
                    seen.add(paramName);
                    const domSample = document.querySelector(`input[data-var="${paramName}"], input[name="var_${paramName}"]`)?.value.trim();
                    const defaultVal = paramName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    namedParams.push({
                        param_name: paramName,
                        example: domSample || defaultVal
                    });
                }
            });
            bodyComp.example = { body_text_named_params: namedParams };
        }

        components.push(bodyComp);

        // Footer Component
        if (footerText) {
            components.push({
                type: 'FOOTER',
                text: footerText
            });
        }

        // Buttons Component (Collected dynamically from #tpl-buttons-list or category type)
        const buttonRows = document.querySelectorAll('#tpl-buttons-list .tpl-btn-row');
        const buttonsArray = [];

        buttonRows.forEach(row => {
            const type = row.dataset.type;
            if (type === 'QUICK_REPLY') {
                const text = row.querySelector('.btn-text-input')?.value.trim();
                if (text) buttonsArray.push({ type: 'QUICK_REPLY', text });
            } else if (type === 'URL') {
                const text = row.querySelector('.btn-text-input')?.value.trim();
                const url = row.querySelector('.btn-url-input')?.value.trim();
                if (text && url) buttonsArray.push({ type: 'URL', text, url });
            } else if (type === 'PHONE_NUMBER') {
                const text = row.querySelector('.btn-text-input')?.value.trim();
                const phone = row.querySelector('.btn-phone-input')?.value.trim();
                if (text && phone) buttonsArray.push({ type: 'PHONE_NUMBER', text, phone_number: phone });
            } else if (type === 'COPY_CODE') {
                const code = row.querySelector('.btn-code-input')?.value.trim();
                if (code) buttonsArray.push({ type: 'COPY_CODE', example: code });
            }
        });

        if (buttonsArray.length > 0) {
            components.push({
                type: 'BUTTONS',
                buttons: buttonsArray
            });
        } else if (category === 'AUTHENTICATION') {
            const otpRadio = document.querySelector('input[name="otp-type"]:checked')?.value || 'copy_code';
            if (otpRadio === 'copy_code') {
                components.push({
                    type: 'BUTTONS',
                    buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy Code' }]
                });
            } else {
                const pkgInputs = document.querySelectorAll('#template-builder-form input[type="text"]');
                let pkgName = 'com.example.myapplication';
                let sigHash = '1234567890a';
                pkgInputs.forEach(inp => {
                    if (inp.placeholder && inp.placeholder.includes('com.example')) pkgName = inp.value.trim() || pkgName;
                    if (inp.placeholder && inp.placeholder.includes('11-char')) sigHash = inp.value.trim() || sigHash;
                });
                components.push({
                    type: 'BUTTONS',
                    buttons: [{
                        type: 'OTP',
                        otp_type: otpType.toUpperCase(),
                        title: 'Copy Code',
                        autofill_text: 'Autofill',
                        package_name: pkgName,
                        signature_hash: sigHash
                    }]
                });
            }
        } else if (currentSelectedSubtype === 'catalogue') {
            components.push({
                type: 'BUTTONS',
                buttons: [{ type: 'CATALOG' }]
            });
        }

        if (submitBtn) {
            submitBtn.innerHTML = '<span class="spinner"></span> Submitting to Meta...';
        }

        try {
            const isEdit = !!editingTemplateId;
            const endpoint = isEdit ? `/api/templates?action=edit&id=${editingTemplateId}` : '/api/templates';
            const method = isEdit ? 'PUT' : 'POST';

            const payloadObj = {
                id: editingTemplateId,
                name,
                category,
                language: lang,
                components,
                is_edit: isEdit
            };
            if (parameterFormat) {
                payloadObj.parameter_format = parameterFormat;
            }

            const res = await apiFetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadObj)
            });

            const data = await res.json();

            if (data.error) {
                resetSubmitBtn();
                showModal('Meta Submission Error', data.error);
            } else {
                closeTemplateModal();
                editingTemplateId = null;
                const nameInput = document.getElementById('tpl-name');
                if (nameInput) nameInput.disabled = false;
                resetSubmitBtn();
                showModal('Success!', isEdit ? `Template "${name}" updated in Meta Cloud API successfully!` : `Template "${name}" created and submitted to Meta for review successfully! Status: ${data.template?.status || 'PENDING'}`);
                loadTemplates();
            }
        } catch (err) {
            resetSubmitBtn();
            showModal('Error', 'Failed to connect to template API: ' + err.message);
        }
    });
});



// --- Broadcast Logic ---
const bcDisplay = document.getElementById('bc-target-display');
const bcOptions = document.getElementById('bc-target-options');

bcDisplay?.addEventListener('click', () => {
    bcOptions?.classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (bcDisplay && !bcDisplay.contains(e.target) && !bcOptions?.contains(e.target)) {
        bcOptions?.classList.remove('active');
    }
});

document.getElementById('btn-bc-target-done')?.addEventListener('click', () => {
    bcOptions?.classList.remove('active');
});

let broadcastCustomersCache = [];
let activeBroadcastTagFilter = '';
let activeBroadcastRangeFilter = null; // { start: number, end: number, label: string }

// Dynamic customer range generator based on total audience size
function generateCustomerRanges(totalCount) {
    if (!totalCount || totalCount <= 0) return [];
    const ranges = [];
    const step = 250;

    // Standard 250-sized chunks (1 - 250, 251 - 500, etc.)
    for (let start = 1; start <= totalCount; start += step) {
        const end = Math.min(start + step - 1, totalCount);
        ranges.push({
            start,
            end,
            label: `${start} - ${end}`,
            count: end - start + 1
        });
    }

    // Additional common tier buckets (e.g. 501 - 1000, 1 - 500, 1 - 1000)
    if (totalCount > 500) {
        const end501to1000 = Math.min(1000, totalCount);
        if (end501to1000 > 500 && !ranges.some(r => r.start === 501 && r.end === end501to1000)) {
            ranges.push({
                start: 501,
                end: end501to1000,
                label: `501 - ${end501to1000} (Large)`,
                count: end501to1000 - 501 + 1,
                isLarge: true
            });
        }
    }
    if (totalCount >= 1000 && !ranges.some(r => r.start === 1 && r.end === 1000)) {
        ranges.push({
            start: 1,
            end: 1000,
            label: `1 - 1000 (Tier 1 Limit)`,
            count: 1000,
            isLarge: true
        });
    }

    return ranges;
}

// Populate Range Selector in Top Bar & Chips inside Dropdown
function populateBroadcastRangeOptions() {
    const sel = document.getElementById('bc-range-filter-select');
    const chipsContainer = document.getElementById('bc-range-chips-container');
    const totalCount = broadcastCustomersCache.length;

    const ranges = generateCustomerRanges(totalCount);

    if (sel) {
        sel.innerHTML = `<option value="">-- All Customers (1 to ${totalCount}) --</option>`;
        ranges.forEach(r => {
            const opt = document.createElement('option');
            opt.value = `${r.start}-${r.end}`;

            // Count sent vs unsent in this range
            let sentCount = 0;
            for (let i = r.start - 1; i < r.end && i < totalCount; i++) {
                if (parseInt(broadcastCustomersCache[i]?.outbound_count || 0, 10) > 0) sentCount++;
            }
            const unsentCount = r.count - sentCount;

            opt.textContent = `Range ${r.label} (${r.count} total • ${sentCount} sent, ${unsentCount} unsent)`;
            if (activeBroadcastRangeFilter && activeBroadcastRangeFilter.start === r.start && activeBroadcastRangeFilter.end === r.end) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        });
    }

    if (chipsContainer) {
        chipsContainer.innerHTML = '';

        // "All (1 - N)" Chip
        const allChip = document.createElement('button');
        allChip.type = 'button';
        const isAllActive = !activeBroadcastRangeFilter;
        allChip.className = `btn sm ${isAllActive ? 'primary' : 'secondary'}`;
        allChip.style.cssText = 'padding: 0.2rem 0.55rem; font-size: 0.725rem; border-radius: 999px; white-space: nowrap; flex-shrink: 0;';
        allChip.innerHTML = `All (1 - ${totalCount})`;
        allChip.onclick = () => clearBroadcastRangeFilter();
        chipsContainer.appendChild(allChip);

        ranges.forEach(r => {
            const isActive = activeBroadcastRangeFilter && activeBroadcastRangeFilter.start === r.start && activeBroadcastRangeFilter.end === r.end;
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'btn sm';
            chip.style.cssText = `padding: 0.2rem 0.6rem; font-size: 0.725rem; border-radius: 999px; white-space: nowrap; flex-shrink: 0; cursor: pointer; border: 1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}; background: ${isActive ? 'var(--primary-light)' : 'var(--bg-card)'}; color: ${isActive ? 'var(--primary)' : 'var(--text-main)'}; font-weight: ${isActive ? '700' : '500'};`;

            // If a tag filter is active, compute how many matching that tag in this range
            let tagSubtext = '';
            if (activeBroadcastTagFilter) {
                const lowerTag = activeBroadcastTagFilter.toLowerCase();
                let tagInRange = 0;
                for (let i = r.start - 1; i < r.end && i < totalCount; i++) {
                    const c = broadcastCustomersCache[i];
                    if (c && c.tags && c.tags.split(',').map(s => s.trim().toLowerCase()).includes(lowerTag)) {
                        tagInRange++;
                    }
                }
                tagSubtext = ` • ${tagInRange} ${activeBroadcastTagFilter}`;
            }

            chip.innerHTML = `🔢 ${r.label} <span style="opacity:0.75; font-size:0.68rem;">(${r.count}${tagSubtext})</span>`;
            chip.onclick = () => {
                if (isActive) {
                    clearBroadcastRangeFilter();
                } else {
                    applyBroadcastRangeFilter(r, true);
                }
            };
            chipsContainer.appendChild(chip);
        });
    }
}

// Populate Tag Selector in Top Bar & Chips inside Dropdown (co-aware of active range)
function populateBroadcastTagFilterOptions() {
    const sel = document.getElementById('bc-tag-filter-select');
    const chipsContainer = document.getElementById('bc-tag-chips-container');
    const hasRange = !!activeBroadcastRangeFilter;

    // Calculate customer count per tag overall and within active range
    const tagCounts = {};
    const tagCountsInRange = {};
    broadcastCustomersCache.forEach((c, idx) => {
        const srNo = idx + 1;
        const inRange = !hasRange || (srNo >= activeBroadcastRangeFilter.start && srNo <= activeBroadcastRangeFilter.end);
        if (c.tags) {
            c.tags.split(',').forEach(raw => {
                const t = raw.trim();
                if (t) {
                    const lower = t.toLowerCase();
                    tagCounts[lower] = (tagCounts[lower] || 0) + 1;
                    if (inRange) {
                        tagCountsInRange[lower] = (tagCountsInRange[lower] || 0) + 1;
                    }
                }
            });
        }
    });

    if (sel) {
        sel.innerHTML = '<option value="">-- Filter By Tags --</option>';
        availableTags.forEach(t => {
            const lower = (t.name || '').toLowerCase();
            const count = hasRange ? (tagCountsInRange[lower] || 0) : (tagCounts[lower] || 0);
            const totalTag = tagCounts[lower] || 0;
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = hasRange ? `🏷️ ${t.name} (${count} in range / ${totalTag} total)` : `🏷️ ${t.name} (${count})`;
            if (t.name.toLowerCase() === activeBroadcastTagFilter.toLowerCase()) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    if (chipsContainer) {
        chipsContainer.innerHTML = '';

        // "All Tags" Chip
        const allChip = document.createElement('button');
        allChip.type = 'button';
        const isAllActive = !activeBroadcastTagFilter;
        allChip.className = `btn sm ${isAllActive ? 'primary' : 'secondary'}`;
        allChip.style.cssText = 'padding: 0.2rem 0.55rem; font-size: 0.725rem; border-radius: 999px; white-space: nowrap; flex-shrink: 0;';
        const allCount = hasRange
            ? Math.max(0, Math.min(activeBroadcastRangeFilter.end, broadcastCustomersCache.length) - activeBroadcastRangeFilter.start + 1)
            : broadcastCustomersCache.length;
        allChip.innerHTML = `All (${allCount})`;
        allChip.onclick = () => clearBroadcastTagFilter();
        chipsContainer.appendChild(allChip);

        availableTags.forEach(t => {
            const lower = (t.name || '').toLowerCase();
            const count = hasRange ? (tagCountsInRange[lower] || 0) : (tagCounts[lower] || 0);
            if (count === 0 && !t.is_default && !hasRange) return;
            const isActive = t.name.toLowerCase() === activeBroadcastTagFilter.toLowerCase();
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'btn sm';
            chip.style.cssText = `padding: 0.2rem 0.6rem; font-size: 0.725rem; border-radius: 999px; white-space: nowrap; flex-shrink: 0; cursor: pointer; border: 1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}; background: ${isActive ? 'var(--primary-light)' : 'var(--bg-card)'}; color: ${isActive ? 'var(--primary)' : 'var(--text-main)'}; font-weight: ${isActive ? '700' : '500'};`;
            chip.innerHTML = `🏷️ ${escapeHtml(t.name)} <span style="opacity:0.75; font-size:0.68rem;">(${count})</span>`;
            chip.onclick = () => {
                if (isActive) {
                    clearBroadcastTagFilter();
                } else {
                    applyBroadcastTagFilter(t.name, true);
                }
            };
            chipsContainer.appendChild(chip);
        });
    }
}

// Apply Range Selection Filter (e.g. '1-250', '251-500', or {start: 1, end: 250})
window.applyBroadcastRangeFilter = function applyBroadcastRangeFilter(rangeVal, autoSelect = true) {
    if (!rangeVal) {
        clearBroadcastRangeFilter();
        return;
    }

    let start = 1, end = broadcastCustomersCache.length;
    if (typeof rangeVal === 'string') {
        const parts = rangeVal.split('-');
        if (parts.length === 2) {
            start = parseInt(parts[0], 10);
            end = parseInt(parts[1], 10);
        }
    } else if (typeof rangeVal === 'object' && rangeVal.start && rangeVal.end) {
        start = parseInt(rangeVal.start, 10);
        end = parseInt(rangeVal.end, 10);
    }

    if (isNaN(start) || start < 1) start = 1;
    if (isNaN(end) || end < start) end = start;

    activeBroadcastRangeFilter = { start, end, label: `${start} - ${end}` };

    const sel = document.getElementById('bc-range-filter-select');
    if (sel) sel.value = `${start}-${end}`;

    const clearBtn = document.getElementById('btn-bc-clear-range-filter');
    if (clearBtn) clearBtn.style.display = 'inline-flex';

    populateBroadcastRangeOptions();
    populateBroadcastTagFilterOptions();

    // If autoSelect: Check ONLY customers that match the active range AND active tag!
    if (autoSelect) {
        const lowerTag = (activeBroadcastTagFilter || '').toLowerCase().trim();
        let selectedCount = 0;

        document.querySelectorAll('.bc-cust-cb').forEach(cb => {
            const custId = parseInt(cb.value, 10);
            const label = cb.closest('.option-item');
            const srNo = label ? parseInt(label.getAttribute('data-sr'), 10) : 0;
            const cust = broadcastCustomersCache.find(c => c.id === custId);

            const inRange = srNo >= start && srNo <= end;
            const custTags = cust && cust.tags ? cust.tags.split(',').map(s => s.trim().toLowerCase()) : [];
            const hasTag = !lowerTag || custTags.includes(lowerTag);

            if (inRange && hasTag) {
                cb.checked = true;
                selectedCount++;
            } else {
                cb.checked = false;
            }
        });

        const selectAll = document.getElementById('bc-select-all');
        if (selectAll) selectAll.checked = selectedCount > 0;
    }

    filterBroadcastCustomerList();
    updateBcDisplay();
};

window.clearBroadcastRangeFilter = function clearBroadcastRangeFilter() {
    activeBroadcastRangeFilter = null;
    const sel = document.getElementById('bc-range-filter-select');
    if (sel) sel.value = '';

    const clearBtn = document.getElementById('btn-bc-clear-range-filter');
    if (clearBtn) clearBtn.style.display = 'none';

    populateBroadcastRangeOptions();
    populateBroadcastTagFilterOptions();
    filterBroadcastCustomerList();
    updateBcDisplay();
};

// Apply Tag Selection Filter (Combine with active range)
window.applyBroadcastTagFilter = function applyBroadcastTagFilter(tagName, autoSelect = false) {
    activeBroadcastTagFilter = (tagName || '').trim();
    if (!activeBroadcastTagFilter) {
        clearBroadcastTagFilter();
        return;
    }

    const sel = document.getElementById('bc-tag-filter-select');
    if (sel) sel.value = activeBroadcastTagFilter;

    const clearBtn = document.getElementById('btn-bc-clear-tag-filter');
    if (clearBtn) clearBtn.style.display = 'inline-flex';

    populateBroadcastTagFilterOptions();
    populateBroadcastRangeOptions();

    // If autoSelect: Check ONLY customers having this tag AND inside active range!
    if (autoSelect && activeBroadcastTagFilter) {
        const lowerTag = activeBroadcastTagFilter.toLowerCase();
        let matchedCount = 0;

        document.querySelectorAll('.bc-cust-cb').forEach(cb => {
            const custId = parseInt(cb.value, 10);
            const label = cb.closest('.option-item');
            const srNo = label ? parseInt(label.getAttribute('data-sr'), 10) : 0;
            const cust = broadcastCustomersCache.find(c => c.id === custId);

            const inRange = !activeBroadcastRangeFilter || (srNo >= activeBroadcastRangeFilter.start && srNo <= activeBroadcastRangeFilter.end);
            const hasTag = cust && cust.tags && cust.tags.split(',').map(s => s.trim().toLowerCase()).includes(lowerTag);

            if (inRange && hasTag) {
                cb.checked = true;
                matchedCount++;
            } else {
                cb.checked = false;
            }
        });

        const selectAll = document.getElementById('bc-select-all');
        if (selectAll) selectAll.checked = matchedCount > 0;

        updateBcDisplay();
    }

    filterBroadcastCustomerList();
};

window.clearBroadcastTagFilter = function clearBroadcastTagFilter() {
    activeBroadcastTagFilter = '';
    const sel = document.getElementById('bc-tag-filter-select');
    if (sel) sel.value = '';

    const clearBtn = document.getElementById('btn-bc-clear-tag-filter');
    if (clearBtn) clearBtn.style.display = 'none';

    populateBroadcastTagFilterOptions();
    populateBroadcastRangeOptions();
    filterBroadcastCustomerList();
    updateBcDisplay();
};

window.clearBroadcastAudienceSelection = function clearBroadcastAudienceSelection() {
    document.querySelectorAll('.bc-cust-cb').forEach(cb => { cb.checked = false; });
    const selectAll = document.getElementById('bc-select-all');
    if (selectAll) selectAll.checked = false;
    clearBroadcastTagFilter();
    clearBroadcastRangeFilter();
    updateBcDisplay();
};

window.toggleBroadcastCustomRangeInput = function toggleBroadcastCustomRangeInput(forceState) {
    const row = document.getElementById('bc-custom-range-row');
    if (!row) return;
    const shouldShow = (typeof forceState === 'boolean') ? forceState : (row.style.display === 'none');
    row.style.display = shouldShow ? 'flex' : 'none';
    if (shouldShow) {
        const fromInput = document.getElementById('bc-range-custom-from');
        const toInput = document.getElementById('bc-range-custom-to');
        if (fromInput && !fromInput.value) fromInput.value = '1';
        if (toInput && !toInput.value) toInput.value = Math.min(250, broadcastCustomersCache.length || 250);
        fromInput?.focus();
    }
};

window.applyBroadcastCustomRange = function applyBroadcastCustomRange() {
    const fromInput = document.getElementById('bc-range-custom-from');
    const toInput = document.getElementById('bc-range-custom-to');
    const start = parseInt(fromInput?.value, 10);
    const end = parseInt(toInput?.value, 10);

    if (isNaN(start) || start < 1) {
        alert('Please enter a valid starting Serial Number (1 or higher).');
        return;
    }
    if (isNaN(end) || end < start) {
        alert('Ending Serial Number must be greater than or equal to starting Serial Number.');
        return;
    }

    applyBroadcastRangeFilter({ start, end }, true);
};

// Select only customers in active range/tag who have not received outbound messages yet
window.selectUnsentInCurrentFilter = function selectUnsentInCurrentFilter() {
    let checkedCount = 0;
    const lowerTag = (activeBroadcastTagFilter || '').toLowerCase().trim();

    document.querySelectorAll('.bc-cust-cb').forEach(cb => {
        const custId = parseInt(cb.value, 10);
        const label = cb.closest('.option-item');
        const srNo = label ? parseInt(label.getAttribute('data-sr'), 10) : 0;
        const cust = broadcastCustomersCache.find(c => c.id === custId);

        const inRange = !activeBroadcastRangeFilter || (srNo >= activeBroadcastRangeFilter.start && srNo <= activeBroadcastRangeFilter.end);
        const hasTag = !lowerTag || (cust && cust.tags && cust.tags.split(',').map(s => s.trim().toLowerCase()).includes(lowerTag));
        const isUnsent = !cust || !cust.outbound_count || parseInt(cust.outbound_count, 10) === 0;

        if (inRange && hasTag && isUnsent) {
            cb.checked = true;
            checkedCount++;
        } else {
            cb.checked = false;
        }
    });

    const selectAll = document.getElementById('bc-select-all');
    if (selectAll) selectAll.checked = false;

    updateBcDisplay();
};

window.filterBroadcastCustomerList = function filterBroadcastCustomerList() {
    const searchVal = (document.getElementById('bc-customer-search')?.value || '').toLowerCase().trim();
    const lowerFilterTag = activeBroadcastTagFilter.toLowerCase().trim();

    let visibleCount = 0;
    const optionLabels = document.querySelectorAll('#bc-target-list .option-item');

    optionLabels.forEach(label => {
        const custId = label.getAttribute('data-id');
        const srNo = parseInt(label.getAttribute('data-sr'), 10) || 0;
        const cust = broadcastCustomersCache.find(c => String(c.id) === String(custId));
        if (!cust) return;

        const custTags = cust.tags ? cust.tags.split(',').map(s => s.trim().toLowerCase()) : [];
        const matchesTag = !lowerFilterTag || custTags.includes(lowerFilterTag);

        const matchesRange = !activeBroadcastRangeFilter || (
            srNo >= activeBroadcastRangeFilter.start && srNo <= activeBroadcastRangeFilter.end
        );

        const matchesSearch = !searchVal || (
            (cust.name && cust.name.toLowerCase().includes(searchVal)) ||
            (cust.phone && cust.phone.includes(searchVal)) ||
            String(srNo) === searchVal ||
            ('#' + srNo) === searchVal ||
            custTags.some(t => t.includes(searchVal))
        );

        if (matchesTag && matchesRange && matchesSearch) {
            label.style.display = 'flex';
            visibleCount++;
        } else {
            label.style.display = 'none';
        }
    });

    const selectAllLabel = document.getElementById('bc-select-all-label');
    if (selectAllLabel) {
        if (activeBroadcastRangeFilter && activeBroadcastTagFilter) {
            selectAllLabel.textContent = `Select All with Tag "${activeBroadcastTagFilter}" in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end} (${visibleCount})`;
        } else if (activeBroadcastRangeFilter) {
            selectAllLabel.textContent = `Select All in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end} (${visibleCount})`;
        } else if (activeBroadcastTagFilter) {
            selectAllLabel.textContent = `Select All with Tag "${activeBroadcastTagFilter}" (${visibleCount})`;
        } else if (searchVal) {
            selectAllLabel.textContent = `Select All Filtered (${visibleCount})`;
        } else {
            selectAllLabel.textContent = `Select All Customers (${broadcastCustomersCache.length})`;
        }
    }

    const countBadge = document.getElementById('bc-matching-count-badge');
    if (countBadge) {
        countBadge.textContent = `${visibleCount} shown`;
    }

    const summarySpan = document.getElementById('bc-active-filter-summary');
    if (summarySpan) {
        const parts = [];
        if (activeBroadcastRangeFilter) parts.push(`Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end}`);
        if (activeBroadcastTagFilter) parts.push(`Tag: ${activeBroadcastTagFilter}`);
        summarySpan.textContent = parts.join(' • ');
    }
};

async function loadCustomersForSelect() {
    try {
        await loadTags();
        const res = await apiFetch('/api/customers');
        const customers = await res.json();

        if (customers.error) return;

        broadcastCustomersCache = Array.isArray(customers) ? customers : [];

        const list = document.getElementById('bc-target-list');
        if (list && Array.isArray(customers)) {
            list.innerHTML = '';
            customers.forEach((c, idx) => {
                const label = document.createElement('label');
                label.className = 'option-item bc-customer-row';
                label.setAttribute('data-id', c.id);
                label.setAttribute('data-sr', idx + 1);

                const srNo = idx + 1;
                const outboundCount = parseInt(c.outbound_count || 0, 10);
                const isSent = outboundCount > 0;
                const tagsArr = c.tags ? c.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
                const pillsHtml = tagsArr.map(t => renderTagPillHtml(t)).join('');

                label.innerHTML = `
                    <div class="bc-cust-left">
                        <input type="checkbox" class="bc-cust-cb" value="${c.id}">
                        <span class="bc-sr-badge" title="Customer Serial Number">#${srNo}</span>
                        <div class="bc-cust-meta">
                            <span class="bc-cust-name" title="${escapeHtml(c.name || 'Unnamed')}">${escapeHtml(c.name || 'Unnamed')}</span>
                            <span class="bc-cust-phone">(${escapeHtml(c.phone || '')})</span>
                        </div>
                    </div>
                    <div class="bc-cust-right">
                        ${isSent 
                            ? `<span class="bc-sent-badge" title="Sent outbound broadcast/messages previously (${outboundCount} sent)">✓ Sent (${outboundCount})</span>`
                            : `<span class="bc-pending-badge" title="No outbound messages sent yet">• Unsent</span>`
                        }
                        <div class="bc-cust-tags">
                            ${pillsHtml}
                        </div>
                    </div>
                `;
                list.appendChild(label);
            });

            populateBroadcastRangeOptions();
            populateBroadcastTagFilterOptions();

            const selectAll = document.getElementById('bc-select-all');
            const cbs = document.querySelectorAll('.bc-cust-cb');

            selectAll?.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                // Only toggle checkboxes of visible customers (matching active range, tag filter, and search)
                document.querySelectorAll('#bc-target-list .option-item').forEach(item => {
                    if (item.style.display !== 'none') {
                        const cb = item.querySelector('.bc-cust-cb');
                        if (cb) cb.checked = isChecked;
                    }
                });
                updateBcDisplay();
            });

            cbs.forEach(cb => {
                cb.addEventListener('change', () => {
                    if (!cb.checked && selectAll) selectAll.checked = false;
                    updateBcDisplay();
                });
            });

            // ⚡ Select 24h Active (Free Tier) shortcut button
            document.getElementById('btn-bc-select-24h-active')?.addEventListener('click', () => {
                const now = Date.now();
                const twentyFourHoursMs = 24 * 60 * 60 * 1000;

                if (selectAll) selectAll.checked = false;

                cbs.forEach(cb => {
                    const custId = parseInt(cb.value, 10);
                    const cust = broadcastCustomersCache.find(c => c.id === custId);
                    if (cust && cust.last_inbound_at && (now - new Date(cust.last_inbound_at).getTime() <= twentyFourHoursMs)) {
                        cb.checked = true;
                    } else {
                        cb.checked = false;
                    }
                });

                updateBcDisplay();
                setTimeout(() => bcOptions?.classList.remove('active'), 250);
            });
        }
    } catch (e) {
        console.error('Error in loadCustomersForSelect:', e);
    }
}

function updateBcDisplay() {
    const cbs = document.querySelectorAll('.bc-cust-cb:checked');
    selectedCustomerIds = Array.from(cbs).map(cb => cb.value);

    const selectAll = document.getElementById('bc-select-all');
    if (selectedCustomerIds.length === 0) {
        bcDisplay.textContent = "Select Audience...";
    } else if (selectAll?.checked && !activeBroadcastTagFilter && !activeBroadcastRangeFilter) {
        bcDisplay.textContent = `All Customers Selected (${broadcastCustomersCache.length})`;
    } else if (activeBroadcastRangeFilter && activeBroadcastTagFilter) {
        bcDisplay.textContent = `🎯 ${selectedCustomerIds.length} with "${activeBroadcastTagFilter}" in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end} Selected`;
    } else if (activeBroadcastRangeFilter) {
        bcDisplay.textContent = `🎯 ${selectedCustomerIds.length} Customer(s) in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end} Selected`;
    } else if (activeBroadcastTagFilter) {
        bcDisplay.textContent = `🎯 ${selectedCustomerIds.length} Customer(s) with "${activeBroadcastTagFilter}" Selected`;
    } else {
        bcDisplay.textContent = `${selectedCustomerIds.length} Customer(s) Selected`;
    }
}

// Populate Media Library Select in Broadcast View (Filtered by Image vs Video)
async function loadMediaForSelect(targetType) {
    try {
        const res = await apiFetch('/api/media');
        const mediaList = await res.json();
        const select = document.getElementById('bc-media-select');
        const fileInput = document.getElementById('bc-media');
        if (!select || !Array.isArray(mediaList)) return;

        const currentBcType = targetType || document.getElementById('bc-type')?.value;

        // Set file input accept attribute based on message type
        if (fileInput) {
            if (currentBcType === 'image') fileInput.accept = 'image/*';
            else if (currentBcType === 'video') fileInput.accept = 'video/*';
            else fileInput.accept = 'image/*,video/*';
        }

        const typeLabel = currentBcType === 'image' ? 'Image' : currentBcType === 'video' ? 'Video' : 'Media';
        select.innerHTML = `<option value="">-- Select from uploaded ${typeLabel} files --</option>`;

        const filteredMedia = mediaList.filter(m => {
            if (!currentBcType || currentBcType === 'template' || currentBcType === 'text') return true;
            if (currentBcType === 'image') return m.type === 'image' || (m.mime_type && m.mime_type.startsWith('image'));
            if (currentBcType === 'video') return m.type === 'video' || (m.mime_type && m.mime_type.startsWith('video'));
            return true;
        });

        filteredMedia.forEach(m => {
            const val = m.meta_media_id || m.file_url;
            if (val) {
                select.innerHTML += `<option value="${val}">${m.name} (${m.type})</option>`;
            }
        });
    } catch (e) {
        console.error('Error loading media for select:', e);
    }
}

document.getElementById('bc-media-select')?.addEventListener('change', (e) => {
    const url = e.target.value;
    const previewContainer = document.getElementById('bc-media-preview-container');
    const fileInput = document.getElementById('bc-media');

    if (fileInput) fileInput.value = ''; // Reset file input if library item chosen

    if (url && previewContainer) {
        if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) {
            const isVideo = url.endsWith('.mp4');
            previewContainer.style.display = 'block';
            previewContainer.innerHTML = isVideo
                ? `<video src="${url}" controls style="max-height:120px;border-radius:8px;"></video>`
                : `<img src="${url}" style="max-height:120px;border-radius:8px;object-fit:cover;">`;
        } else {
            previewContainer.style.display = 'block';
            previewContainer.innerHTML = `<div style="padding:0.5rem 0.75rem; background:rgba(0,168,132,0.1); color:var(--primary); font-size:0.8rem; border-radius:6px; font-family:monospace; display:inline-flex; align-items:center; gap:0.35rem;">☁️ Meta Cloud Media ID: ${url}</div>`;
        }
    } else if (previewContainer) {
        previewContainer.style.display = 'none';
    }
});

const bcType = document.getElementById('bc-type');
bcType?.addEventListener('change', (e) => {
    window._customMediaOverrideActive = false;
    const type = e.target.value;
    document.getElementById('bc-template-group').style.display = type === 'template' ? 'block' : 'none';
    document.getElementById('bc-content-group').style.display = type === 'template' ? 'none' : 'block';

    if (type === 'image' || type === 'video') {
        document.getElementById('bc-media-group').style.display = 'block';
        const mediaLabel = document.getElementById('bc-media-group-label') || document.getElementById('bc-media-group')?.querySelector('label');
        if (mediaLabel) mediaLabel.textContent = "Attach Media";
        const customWrapper = document.getElementById('bc-custom-media-wrapper');
        if (customWrapper) customWrapper.style.display = 'block';
        const autoContainer = document.getElementById('bc-meta-header-auto-container');
        if (autoContainer) autoContainer.style.display = 'none';
        loadMediaForSelect(type);
    } else {
        checkSelectedTemplateMediaRequirement();
    }
});

document.getElementById('bc-template')?.addEventListener('change', () => {
    window._customMediaOverrideActive = false;
    checkSelectedTemplateMediaRequirement();
});

document.getElementById('bc-media')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const dropzoneText = document.getElementById('dropzone-text');
    const mediaSelect = document.getElementById('bc-media-select');

    if (mediaSelect) mediaSelect.value = ''; // Clear library dropdown if file chosen
    const previewContainer = document.getElementById('bc-media-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';

    if (file && dropzoneText) {
        dropzoneText.textContent = `Attached: ${file.name}`;
    }
});

const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// Obtain Meta Resumable Upload handle (header_handle) for Template Header sample media via server API
async function getMetaHeaderHandle(file) {
    if (!file) return null;
    const base64Data = await getBase64(file);
    const mimeType = file.type || (file.name && file.name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');

    const res = await apiFetch('/api/upload-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            base64Data: base64Data,
            fileName: file.name,
            mimeType: mimeType,
            company_id: getCompanyId()
        })
    });

    const data = await res.json();
    if (data.error) {
        throw new Error(data.error);
    }
    if (data.handle) return data.handle;
    if (data.media_id) return data.media_id;
    return null;
}

// Fast Binary Streaming Upload to Meta Cloud API with Live Progress
function uploadMediaToMetaFast(file, config, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://graph.facebook.com/v19.0/${config.meta_phone_id}/media`);
        xhr.setRequestHeader('Authorization', `Bearer ${config.meta_token}`);

        if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const res = JSON.parse(xhr.responseText);
                    if (res.error) reject(new Error("Meta Upload Error: " + res.error.message));
                    else resolve(res);
                } catch (e) { reject(e); }
            } else {
                reject(new Error(`Meta Upload Failed with status ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error("Network error uploading media to Meta"));

        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        formData.append('file', file);
        xhr.send(formData);
    });
}

// Background sync to GitHub Media Storage (Removed)
function syncToGithubBackground() { }

function resetBroadcastForm() {
    const form = document.getElementById('broadcast-form');
    if (form) form.reset();

    if (typeof clearBroadcastTagFilter === 'function') {
        clearBroadcastTagFilter();
    }

    selectedCustomerIds = [];
    document.querySelectorAll('.bc-cust-cb').forEach(cb => { cb.checked = false; });
    const selectAll = document.getElementById('bc-select-all');
    if (selectAll) selectAll.checked = false;
    const bcDisplay = document.getElementById('bc-target-display');
    if (bcDisplay) bcDisplay.textContent = "Select Audience...";

    document.getElementById('bc-target-options')?.classList.remove('active');

    const mediaSelect = document.getElementById('bc-media-select');
    if (mediaSelect) mediaSelect.value = '';
    const fileInput = document.getElementById('bc-media');
    if (fileInput) fileInput.value = '';
    const previewContainer = document.getElementById('bc-media-preview-container');
    if (previewContainer) {
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
    }
    const dropzoneText = document.getElementById('dropzone-text');
    if (dropzoneText) dropzoneText.textContent = "Drag & Drop media here, or Click to Browse";

    const bcType = document.getElementById('bc-type');
    if (bcType) bcType.value = 'text';
    const tg = document.getElementById('bc-template-group');
    if (tg) tg.style.display = 'none';
    const mg = document.getElementById('bc-media-group');
    if (mg) mg.style.display = 'none';
    const cg = document.getElementById('bc-content-group');
    if (cg) cg.style.display = 'block';
}

window.updateBroadcastSenderPhoneSelect = function updateBroadcastSenderPhoneSelect() {
    const group = document.getElementById('bc-sender-phone-group');
    const select = document.getElementById('bc-sender-phone-select');
    if (!group || !select) return;

    const coId = typeof getCompanyId === 'function' ? getCompanyId() : 'default';
    const comp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;
    const isMaster = !comp || (comp.slug && comp.slug.toLowerCase() === 'inspenox') || (comp.name && comp.name.toLowerCase() === 'inspenox') || comp.is_master;

    let phoneList = [];
    if (comp && Array.isArray(comp.whatsapp_phone_numbers) && comp.whatsapp_phone_numbers.length > 0) {
        phoneList = comp.whatsapp_phone_numbers;
    } else if (comp && comp.whatsapp_phone_number_id) {
        phoneList = [{
            phone: comp.phone || '',
            phone_number_id: comp.whatsapp_phone_number_id,
            verified_name: comp.name || '',
            status: 'Registered',
            is_default: true
        }];
    } else if (isMaster && systemEnvGlobals.whatsapp_phone_number_id) {
        phoneList = [{
            phone: '+91 79816 56294',
            phone_number_id: systemEnvGlobals.whatsapp_phone_number_id,
            verified_name: 'Inspenox Default',
            status: 'Registered',
            is_default: true
        }];
    }

    if (phoneList.length === 0) {
        group.style.display = 'none';
        select.innerHTML = '<option value="">-- No Registered Phone Number --</option>';
        return;
    }

    if (phoneList.length === 1) {
        const single = phoneList[0];
        group.style.display = 'block';
        select.innerHTML = `
            <option value="${single.phone_number_id}">
                ${single.phone ? formatDisplayPhone(single.phone) : 'Phone'} (ID: ${single.phone_number_id}) • Primary
            </option>
        `;
        return;
    }

    // Multiple registered phone numbers available!
    group.style.display = 'block';
    select.innerHTML = phoneList.map(p => `
        <option value="${p.phone_number_id}" ${p.is_default ? 'selected' : ''}>
            ${p.phone ? formatDisplayPhone(p.phone) : 'Phone'} (ID: ${p.phone_number_id}) ${p.is_default ? '★ Primary' : ''} ${p.verified_name ? '• ' + p.verified_name : ''}
        </option>
    `).join('');
};

// --- Broadcast Progress Modal Handler ---
const bcProgressModal = document.getElementById('broadcast-progress-modal');
const bcProgressCircle = document.getElementById('bc-progress-circle-fill');
const bcProgressPercent = document.getElementById('bc-progress-percent');
const bcProgressCounterSub = document.getElementById('bc-progress-counter-sub');
const bcProgressBarFill = document.getElementById('bc-progress-bar-fill');
const bcStatSent = document.getElementById('bc-stat-sent');
const bcStatFailed = document.getElementById('bc-stat-failed');
const bcStatRemaining = document.getElementById('bc-stat-remaining');
const bcProgressLog = document.getElementById('bc-progress-log');
const btnCloseBcProgress = document.getElementById('btn-close-bc-progress');
const btnCloseBcModalX = document.getElementById('btn-close-bc-modal-x');

const handleCloseBcModal = () => {
    bcProgressModal?.classList.add('hidden');
    loadDashboard();
    loadInboxSidebar();
};

btnCloseBcProgress?.addEventListener('click', handleCloseBcModal);
btnCloseBcModalX?.addEventListener('click', handleCloseBcModal);

function updateBcProgress(processed, total, sent, failed, logMsg = '') {
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

    // SVG dashoffset: full circle radius is 50, circumference is 2 * PI * 50 = 314.16
    const dashoffset = 314.16 - (314.16 * (percent / 100));
    if (bcProgressCircle) bcProgressCircle.style.strokeDashoffset = dashoffset;
    if (bcProgressBarFill) bcProgressBarFill.style.width = `${percent}%`;
    if (bcProgressPercent) bcProgressPercent.textContent = `${percent}%`;
    if (bcProgressCounterSub) bcProgressCounterSub.textContent = `${processed} of ${total}`;

    if (bcStatSent) bcStatSent.textContent = sent;
    if (bcStatFailed) bcStatFailed.textContent = failed;
    if (bcStatRemaining) bcStatRemaining.textContent = Math.max(0, total - processed);

    // Instagram-style green verified badge animation toggle at 100%
    const verifiedBadge = document.getElementById('bc-verified-badge');
    const textBox = document.getElementById('bc-progress-text-box');
    const circleSvg = document.getElementById('bc-circle-svg');
    if (percent === 100 && total > 0) {
        if (verifiedBadge) verifiedBadge.style.display = 'flex';
        if (textBox) textBox.style.display = 'none';
        if (circleSvg) circleSvg.style.display = 'none';
    } else {
        if (verifiedBadge) verifiedBadge.style.display = 'none';
        if (textBox) textBox.style.display = 'flex';
        if (circleSvg) circleSvg.style.display = 'block';
    }

    if (logMsg && bcProgressLog) {
        const timeStr = new Date().toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const logLine = document.createElement('div');
        logLine.innerHTML = `<span style="opacity:0.6;">[${timeStr}]</span> ${logMsg}`;
        bcProgressLog.appendChild(logLine);

        // Keep DOM lightweight if processing 1000+ numbers
        if (bcProgressLog.children.length > 400) {
            bcProgressLog.removeChild(bcProgressLog.firstElementChild);
        }

        // Smooth auto-scroll to bottom
        requestAnimationFrame(() => {
            if (bcProgressLog) bcProgressLog.scrollTop = bcProgressLog.scrollHeight;
        });
    }
}

document.getElementById('broadcast-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-broadcast');
    const statusDiv = document.getElementById('broadcast-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending Broadcast...';
    if (statusDiv) statusDiv.textContent = '';

    try {
        let targetList = [];
        const isSelectAll = document.getElementById('bc-select-all')?.checked;

        // Freshly read all checked customer checkboxes
        const checkedCbs = document.querySelectorAll('.bc-cust-cb:checked');
        const checkedIds = Array.from(checkedCbs).map(cb => String(cb.value));

        if (isSelectAll && !activeBroadcastTagFilter && !activeBroadcastRangeFilter) {
            // Truly all customers in the workspace
            const res = await apiFetch('/api/customers');
            const allCust = await res.json();
            if (Array.isArray(allCust)) targetList = allCust;
        } else if (checkedIds.length > 0) {
            // Specific customers checked individually or via range/tag auto-select
            if (broadcastCustomersCache && broadcastCustomersCache.length > 0) {
                targetList = broadcastCustomersCache.filter(c => checkedIds.includes(String(c.id)));
            } else {
                const res = await apiFetch('/api/customers');
                const allCust = await res.json();
                if (Array.isArray(allCust)) {
                    targetList = allCust.filter(c => checkedIds.includes(String(c.id)));
                }
            }
        } else if (activeBroadcastRangeFilter || activeBroadcastTagFilter) {
            // Range or tag selected but no individual checkboxes explicitly ticked
            const pool = (broadcastCustomersCache && broadcastCustomersCache.length > 0)
                ? broadcastCustomersCache
                : await (await apiFetch('/api/customers')).json();
            if (Array.isArray(pool)) {
                targetList = pool.filter((c, idx) => {
                    const sr = idx + 1;
                    const matchesRange = !activeBroadcastRangeFilter || (sr >= activeBroadcastRangeFilter.start && sr <= activeBroadcastRangeFilter.end);
                    const custTags = c.tags ? c.tags.split(',').map(s => s.trim().toLowerCase()) : [];
                    const matchesTag = !activeBroadcastTagFilter || custTags.includes(activeBroadcastTagFilter.toLowerCase().trim());
                    return matchesRange && matchesTag;
                });
            }
        }

        // 🔒 STRICT TAG & RANGE FILTER CHECK:
        // Guarantee that if a tag or range filter is active, only customers satisfying both are included
        if (activeBroadcastTagFilter) {
            const lowerFilterTag = activeBroadcastTagFilter.toLowerCase().trim();
            targetList = targetList.filter(c => {
                if (!c.tags) return false;
                const custTags = c.tags.split(',').map(s => s.trim().toLowerCase());
                return custTags.includes(lowerFilterTag);
            });
        }
        if (activeBroadcastRangeFilter) {
            targetList = targetList.filter(c => {
                const idx = broadcastCustomersCache.findIndex(bc => bc.id === c.id);
                const sr = idx !== -1 ? idx + 1 : 0;
                return sr >= activeBroadcastRangeFilter.start && sr <= activeBroadcastRangeFilter.end;
            });
        }

        if (targetList.length === 0) {
            let errorMsg = "Please select at least one customer, range, or tag.";
            if (activeBroadcastRangeFilter && activeBroadcastTagFilter) {
                errorMsg = `No customers found with tag "${activeBroadcastTagFilter}" in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end}.`;
            } else if (activeBroadcastRangeFilter) {
                errorMsg = `No customers found in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end}.`;
            } else if (activeBroadcastTagFilter) {
                errorMsg = `No customers found with tag "${activeBroadcastTagFilter}".`;
            }
            throw new Error(errorMsg);
        }

        const type = document.getElementById('bc-type').value;
        const content = document.getElementById('bc-content').value;

        let media_id = null;
        if (type === 'image' || type === 'video' || type === 'document') {
            const librarySelectedUrl = document.getElementById('bc-media-select')?.value;
            const fileInput = document.getElementById('bc-media');

            if (librarySelectedUrl) {
                media_id = librarySelectedUrl;
            } else if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const configRes = await apiFetch('/api/config');
                const config = await configRes.json();

                if (statusDiv) statusDiv.innerHTML = `<span class="spinner"></span> Streaming ${file.name} to Meta Cloud...`;
                const metaData = await uploadMediaToMetaFast(file, config, (percent) => {
                    if (statusDiv) statusDiv.innerHTML = `<span class="spinner"></span> Streaming ${file.name} to Meta Cloud (${percent}%)...`;
                });
                media_id = metaData.id;
            } else {
                throw new Error("Please select a media file from Library or upload a new file.");
            }
        } else if (type === 'template') {
            const librarySelectedUrl = document.getElementById('bc-media-select')?.value;
            const fileInput = document.getElementById('bc-media');

            // If user explicitly chose a custom override file
            if (window._customMediaOverrideActive && librarySelectedUrl) {
                media_id = librarySelectedUrl;
            } else if (window._customMediaOverrideActive && fileInput && fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const configRes = await apiFetch('/api/config');
                const config = await configRes.json();

                if (statusDiv) statusDiv.innerHTML = `<span class="spinner"></span> Streaming ${file.name} to Meta Cloud...`;
                const metaData = await uploadMediaToMetaFast(file, config, (percent) => {
                    if (statusDiv) statusDiv.innerHTML = `<span class="spinner"></span> Streaming ${file.name} to Meta Cloud (${percent}%)...`;
                });
                media_id = metaData.id;
            } else {
                // Auto-attach from template metadata (Zero re-upload required!)
                const tSel = document.getElementById('bc-template');
                const tName = tSel ? tSel.value : null;
                const tmpl = (templatesCache || []).find(t => t.name === tName);
                if (tmpl && tmpl.header_media && tmpl.header_media.media_id) {
                    media_id = tmpl.header_media.media_id;
                }
            }
        }

        let template_name, template_language, media_type = null;
        if (type === 'template') {
            const tSel = document.getElementById('bc-template');
            template_name = tSel.value;
            template_language = tSel.options[tSel.selectedIndex].getAttribute('data-lang');

            const tmpl = (templatesCache || []).find(t => t.name === template_name);
            const headerComp = tmpl && tmpl.components ? tmpl.components.find(c => c.type === 'HEADER') : null;
            if (headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                media_type = headerComp.format.toLowerCase();
            }
        }

        // Display Full-Screen Live Progress Overlay Modal
        if (bcProgressModal) {
            bcProgressModal.classList.remove('hidden');
            if (btnCloseBcProgress) btnCloseBcProgress.style.display = 'none';
            if (bcProgressLog) bcProgressLog.innerHTML = '<div>🚀 Initializing Meta WhatsApp Cloud API connection...</div>';
            document.getElementById('bc-progress-title').textContent = 'Broadcasting Campaign...';
            document.getElementById('bc-progress-subtitle').textContent = `Targeting ${targetList.length} selected customer(s)`;
            updateBcProgress(0, targetList.length, 0, 0);
        }

        const campaignNameInput = document.getElementById('bc-campaign-name');
        const customCampaignName = campaignNameInput?.value?.trim() || `Campaign ${new Date().toLocaleDateString('en-GB')}`;
        const ctaTextInput = document.getElementById('bc-cta-text')?.value?.trim() || null;
        const ctaUrlInput = document.getElementById('bc-cta-url')?.value?.trim() || null;
        let launchedCampaignId = null;

        let sentTotal = 0;
        let failedTotal = 0;

        // Process customers in small chunks for live percentage updates
        const BATCH_SIZE = 2;
        for (let i = 0; i < targetList.length; i += BATCH_SIZE) {
            const chunk = targetList.slice(i, i + BATCH_SIZE);
            const chunkIds = chunk.map(c => c.id);
            const chunkNames = chunk.map(c => c.name || c.phone).join(', ');

            updateBcProgress(i, targetList.length, sentTotal, failedTotal, `⏳ Sending to ${chunkNames}...`);

            try {
                const activeCoId = typeof getCompanyId === 'function' ? getCompanyId() : null;
                const senderPhoneId = document.getElementById('bc-sender-phone-select')?.value || null;
                const res = await apiFetch('/api/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        target: chunkIds,
                        type,
                        content,
                        media_id,
                        media_type,
                        template_name,
                        template_language,
                        company_id: activeCoId,
                        phone_number_id: senderPhoneId,
                        campaign_id: launchedCampaignId,
                        campaign_name: customCampaignName,
                        cta_text: ctaTextInput,
                        cta_url: ctaUrlInput
                    })
                });

                const result = await res.json();
                if (result.success) {
                    if (result.campaign_id) {
                        launchedCampaignId = result.campaign_id;
                    }
                    sentTotal += result.sent || 0;
                    failedTotal += result.failed || 0;

                    if (result.errors && result.errors.length > 0) {
                        result.errors.forEach(errStr => {
                            updateBcProgress(i + chunk.length, targetList.length, sentTotal, failedTotal, `<span style="color:#ef4444;">⚠️ Error: ${errStr}</span>`);
                        });
                    }
                    if ((result.sent || 0) > 0) {
                        updateBcProgress(i + chunk.length, targetList.length, sentTotal, failedTotal, `<span style="color:#10b981;">✅ Delivered to ${chunkNames}</span>`);
                    }
                } else {
                    failedTotal += chunk.length;
                    updateBcProgress(i + chunk.length, targetList.length, sentTotal, failedTotal, `<span style="color:#ef4444;">❌ Failed for ${chunkNames}: ${result.error}</span>`);
                }
            } catch (err) {
                failedTotal += chunk.length;
                updateBcProgress(i + chunk.length, targetList.length, sentTotal, failedTotal, `<span style="color:#ef4444;">❌ Network Error for ${chunkNames}: ${err.message}</span>`);
            }
        }

        // Final 100% State
        updateBcProgress(targetList.length, targetList.length, sentTotal, failedTotal, `🎉 Campaign finished! ${sentTotal} sent, ${failedTotal} failed.`);
        document.getElementById('bc-progress-title').textContent = '🎉 Broadcast Campaign Complete!';
        document.getElementById('bc-progress-subtitle').textContent = `Finished processing all ${targetList.length} customers`;
        if (btnCloseBcProgress) btnCloseBcProgress.style.display = 'flex';

        resetBroadcastForm();

        // Refresh campaigns & automatically show newly launched campaign analytics dashboard!
        if (typeof loadCampaigns === 'function') {
            await loadCampaigns(launchedCampaignId);
        }
        if (typeof closeCampaignCreateView === 'function') {
            closeCampaignCreateView();
        }

    } catch (err) {
        if (bcProgressModal && !bcProgressModal.classList.contains('hidden')) {
            updateBcProgress(0, 1, 0, 1, `<span style="color:#ef4444;">⚠️ Error: ${err.message}</span>`);
            if (btnCloseBcProgress) btnCloseBcProgress.style.display = 'flex';
        } else if (statusDiv) {
            statusDiv.textContent = `⚠️ ${err.message}`;
            statusDiv.style.color = 'var(--error)';
            resetBroadcastForm();
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Send Broadcast Campaign`;
    }
});

// ==========================================================================
// Campaign Analytics Dashboard Controller (Image 3 Inspiration)
// ==========================================================================

window.campaignsCache = [];
window.currentActiveCampaign = null;
window.activeCampaignTab = 'clicked';

window.openCreateCampaignModal = function openCreateCampaignModal() {
    const modal = document.getElementById('modal-create-campaign');
    const input = document.getElementById('modal-campaign-name-input');
    if (modal) {
        modal.classList.remove('hidden');
        if (!modal._listenersAttached) {
            modal._listenersAttached = true;
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeCreateCampaignModal();
            });
        }
    }
    if (input) {
        input.value = '';
        if (!input._listenersAttached) {
            input._listenersAttached = true;
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCreateCampaignModal();
                } else if (e.key === 'Escape') {
                    closeCreateCampaignModal();
                }
            });
        }
        setTimeout(() => input.focus(), 100);
    }
};

window.closeCreateCampaignModal = function closeCreateCampaignModal() {
    document.getElementById('modal-create-campaign')?.classList.add('hidden');
};

window.applySuggestedName = function applySuggestedName(name) {
    const input = document.getElementById('modal-campaign-name-input');
    if (input) {
        input.value = name;
        input.focus();
    }
};

window.submitCreateCampaignModal = function submitCreateCampaignModal() {
    const input = document.getElementById('modal-campaign-name-input');
    const rawName = input?.value?.trim();
    const finalName = rawName || `Campaign ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    closeCreateCampaignModal();
    openCampaignCreateView(finalName);
};

window.openCampaignCreateView = function openCampaignCreateView(campaignName) {
    const dashView = document.getElementById('campaign-dashboard-view');
    const listView = document.getElementById('campaign-list-view');
    const createView = document.getElementById('campaign-create-view');
    const nameInput = document.getElementById('bc-campaign-name');
    const heading = document.getElementById('bc-setup-heading');

    if (dashView) dashView.style.display = 'none';
    if (listView) listView.style.display = 'none';
    if (createView) createView.style.display = 'block';

    if (nameInput) {
        nameInput.value = campaignName || '';
    }
    if (heading) {
        heading.textContent = campaignName ? `Setup: ${campaignName}` : 'Setup Broadcast Campaign';
    }

    if (typeof loadCustomersForSelect === 'function') loadCustomersForSelect();
    if (typeof loadTemplatesForSelect === 'function') loadTemplatesForSelect();
    if (typeof updateBroadcastSenderPhoneSelect === 'function') updateBroadcastSenderPhoneSelect();
};

window.closeCampaignCreateView = function closeCampaignCreateView() {
    const dashView = document.getElementById('campaign-dashboard-view');
    const listView = document.getElementById('campaign-list-view');
    const createView = document.getElementById('campaign-create-view');

    if (createView) createView.style.display = 'none';
    if (listView) listView.style.display = 'none';
    if (dashView) dashView.style.display = 'block';
};

window.toggleCampaignsListView = function toggleCampaignsListView() {
    const dashView = document.getElementById('campaign-dashboard-view');
    const listView = document.getElementById('campaign-list-view');
    const createView = document.getElementById('campaign-create-view');

    if (createView) createView.style.display = 'none';
    if (listView && listView.style.display === 'none') {
        if (dashView) dashView.style.display = 'none';
        listView.style.display = 'block';
        renderCampaignsTable();
    } else {
        if (listView) listView.style.display = 'none';
        if (dashView) dashView.style.display = 'block';
    }
};

window.closeCampaignsListView = function closeCampaignsListView() {
    const dashView = document.getElementById('campaign-dashboard-view');
    const listView = document.getElementById('campaign-list-view');
    if (listView) listView.style.display = 'none';
    if (dashView) dashView.style.display = 'block';
};

window.loadCampaigns = async function loadCampaigns(selectedCampaignId = null) {
    try {
        const coId = typeof getCompanyId === 'function' ? getCompanyId() : '1';
        const res = await apiFetch(`/api/broadcast?company_id=${coId}`);
        const data = await res.json();
        const campaigns = (data && data.campaigns) ? data.campaigns : [];
        window.campaignsCache = campaigns;

        // Populate Campaign Switcher Select
        const switcher = document.getElementById('camp-switcher-select');
        if (switcher) {
            if (campaigns.length === 0) {
                switcher.innerHTML = '<option value="">-- No Campaigns Yet --</option>';
            } else {
                switcher.innerHTML = campaigns.map(c => `
                    <option value="${c.id}" ${(selectedCampaignId && String(c.id) === String(selectedCampaignId)) ? 'selected' : ''}>
                        ${c.name || ('Campaign #' + c.id)}
                    </option>
                `).join('');
            }
        }

        renderCampaignsTable();

        // If target ID given, or select the first
        if (selectedCampaignId) {
            await viewCampaignAnalytics(selectedCampaignId);
        } else if (campaigns.length > 0) {
            await viewCampaignAnalytics(campaigns[0].id);
        } else {
            renderSampleCampaign();
        }
    } catch (err) {
        console.error('Error loading campaigns:', err);
        renderSampleCampaign();
    }
};

window.switchActiveCampaign = function switchActiveCampaign(campaignId) {
    if (!campaignId) return;
    viewCampaignAnalytics(campaignId);
};

window.viewCampaignAnalytics = async function viewCampaignAnalytics(campaignId) {
    try {
        const coId = typeof getCompanyId === 'function' ? getCompanyId() : '1';
        const res = await apiFetch(`/api/broadcast?id=${campaignId}&company_id=${coId}`);
        const data = await res.json();
        if (!data || !data.campaign) return;

        window.currentActiveCampaign = data;
        const camp = data.campaign;
        const metrics = data.metrics || {};

        // Switch to Dashboard View
        const dashView = document.getElementById('campaign-dashboard-view');
        const listView = document.getElementById('campaign-list-view');
        const createView = document.getElementById('campaign-create-view');
        if (dashView) dashView.style.display = 'block';
        if (listView) listView.style.display = 'none';
        if (createView) createView.style.display = 'none';

        // Update Header
        const titleEl = document.getElementById('camp-dash-title');
        if (titleEl) titleEl.textContent = (camp.name || 'CAMPAIGN').toUpperCase();
        const switcher = document.getElementById('camp-switcher-select');
        if (switcher) switcher.value = String(camp.id);

        // Update KPI Strip
        updateKpiTabStrip(metrics);

        // Update WhatsApp Preview Chat Bubble
        updateWhatsAppChatPreview(camp);

        // Update Top Meta Info Card & Donut Chart
        updateCampaignMetaCard(camp, metrics);

        // Update Audience Timeline Area Chart
        updateCampaignTimelineChart(camp, metrics, window.activeCampaignTab || 'clicked');

    } catch (err) {
        console.error('Error loading campaign analytics:', err);
    }
};

function formatK(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return String(num);
}

function updateKpiTabStrip(metrics) {
    const overview = metrics.overview || 17861;
    const sent = metrics.sent || 17900;
    const delivered = metrics.delivered || 17300;
    const read = metrics.read || 16600;
    const clicked = metrics.clicked || 7300;
    const replied = metrics.replied || 7500;
    const failed = metrics.failed || 535;

    const el = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };

    el('tab-rate-overview', `${metrics.overview_rate || 100}%`);
    el('tab-count-overview', `(${overview.toLocaleString()})`);

    el('tab-rate-sent', `${metrics.sent_rate || 100}%`);
    el('tab-count-sent', `(${formatK(sent)})`);

    el('tab-rate-delivered', `${metrics.delivered_rate || 97}%`);
    el('tab-count-delivered', `(${formatK(delivered)})`);

    el('tab-rate-read', `${metrics.read_rate || 93}%`);
    el('tab-count-read', `(${formatK(read)})`);

    el('tab-rate-clicked', `${metrics.clicked_rate || 45}%`);
    el('tab-count-clicked', `(${formatK(clicked)})`);

    el('tab-rate-replied', `${metrics.replied_rate || 42}%`);
    el('tab-count-replied', `(${formatK(replied)})`);

    el('tab-rate-failed', `${metrics.failed_rate || 3}%`);
    el('tab-count-failed', `(${failed.toLocaleString()})`);
}

function updateWhatsAppChatPreview(camp) {
    const previewBody = document.getElementById('camp-preview-body');
    const previewTime = document.getElementById('camp-preview-time');
    const ctaBtn = document.getElementById('camp-preview-cta-btn');

    if (previewBody) {
        let contentText = camp.content || 'Hey Shivam 👋\nThe Republic Day 🇮🇳 Sale is LIVE!!\nOrder today win a SHOPPING VOUCHER 💰 worth ₹1000/-';
        if (contentText.startsWith('Template:')) {
            contentText = `Hey Shivam 👋\n${contentText}\nExclusive special offer LIVE! Order now.`;
        }
        // Bold markup format
        const formatted = contentText
            .replace(/\*(.*?)\*/g, '<b>$1</b>')
            .replace(/\n/g, '<br>');
        previewBody.innerHTML = formatted;
    }

    if (previewTime) {
        if (camp.created_at) {
            try {
                const d = new Date(camp.created_at);
                previewTime.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                previewTime.textContent = '4:31 pm';
            }
        } else {
            previewTime.textContent = '4:31 pm';
        }
    }

    if (ctaBtn) {
        const ctaLabel = camp.cta_text || 'Buy Now';
        ctaBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> ${ctaLabel}`;
        if (camp.cta_url) {
            ctaBtn.href = camp.cta_url;
            ctaBtn.target = '_blank';
        }
    }
}

function updateCampaignMetaCard(camp, metrics) {
    const nameEl = document.getElementById('camp-detail-name');
    const dateEl = document.getElementById('camp-detail-date');
    const ctaEl = document.getElementById('camp-detail-cta');
    const durEl = document.getElementById('camp-detail-duration');

    if (nameEl) nameEl.textContent = (camp.name || 'Republic_Day_Sale').replace(/\s+/g, '_');
    if (dateEl) {
        if (camp.created_at) {
            const d = new Date(camp.created_at);
            dateEl.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        } else {
            dateEl.textContent = '23rd January, 2024';
        }
    }
    if (ctaEl) ctaEl.textContent = camp.cta_text || camp.cta_url || 'Shop Now';
    if (durEl) durEl.textContent = '0:00:57';

    // Update Donut Chart
    updateDonutProgress(window.activeCampaignTab || 'clicked', metrics);
}

function updateDonutProgress(tabName, metrics) {
    const donutFill = document.getElementById('camp-donut-fill');
    const badge = document.getElementById('camp-donut-badge');

    let pct = 45;
    if (metrics) {
        if (tabName === 'overview') pct = metrics.overview_rate || 100;
        else if (tabName === 'sent') pct = metrics.sent_rate || 100;
        else if (tabName === 'delivered') pct = metrics.delivered_rate || 97;
        else if (tabName === 'read') pct = metrics.read_rate || 93;
        else if (tabName === 'clicked') pct = metrics.clicked_rate || 45;
        else if (tabName === 'replied') pct = metrics.replied_rate || 42;
        else if (tabName === 'failed') pct = metrics.failed_rate || 3;
    }

    if (badge) badge.textContent = `${pct}%`;

    // Circumference for r=38 is 2 * PI * 38 = 238.76
    const circumference = 238.76;
    const offset = circumference - (pct / 100) * circumference;
    if (donutFill) {
        donutFill.style.strokeDashoffset = String(offset);
    }
}

window.selectCampaignTab = function selectCampaignTab(tabName) {
    window.activeCampaignTab = tabName;

    document.querySelectorAll('.camp-kpi-tab').forEach(tab => {
        if (tab.getAttribute('data-tab') === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    const metrics = (window.currentActiveCampaign && window.currentActiveCampaign.metrics) || {};
    const camp = (window.currentActiveCampaign && window.currentActiveCampaign.campaign) || {};

    updateDonutProgress(tabName, metrics);
    updateCampaignTimelineChart(camp, metrics, tabName);
};

function updateCampaignTimelineChart(camp, metrics, tabName) {
    const tooltipText = document.getElementById('camp-chart-tooltip-text');
    const legendLabel = document.getElementById('camp-legend-label');
    const areaPath = document.getElementById('camp-chart-area');
    const linePath = document.getElementById('camp-chart-line');
    const peakDot = document.getElementById('camp-chart-peak-dot');
    const tooltip = document.getElementById('camp-chart-tooltip');

    const tabUpper = tabName.toUpperCase();
    if (tooltipText) tooltipText.textContent = tabUpper;
    if (legendLabel) legendLabel.textContent = tabName.toLowerCase();

    // Spline wave data
    let dArea, dLine, peakX = 290, peakY = 80;
    if (tabName === 'clicked') {
        dArea = "M 60 195 Q 95 30, 130 50 T 210 110 T 290 80 T 370 115 T 450 75 T 520 195 Z";
        dLine = "M 60 195 Q 95 30, 130 50 T 210 110 T 290 80 T 370 115 T 450 75 T 520 195";
        peakX = 290; peakY = 80;
    } else if (tabName === 'delivered' || tabName === 'sent' || tabName === 'overview') {
        dArea = "M 60 195 Q 100 20, 140 30 T 220 35 T 300 25 T 380 40 T 460 30 T 520 195 Z";
        dLine = "M 60 195 Q 100 20, 140 30 T 220 35 T 300 25 T 380 40 T 460 30 T 520 195";
        peakX = 300; peakY = 25;
    } else if (tabName === 'read') {
        dArea = "M 60 195 Q 100 35, 140 45 T 220 55 T 300 40 T 380 50 T 460 45 T 520 195 Z";
        dLine = "M 60 195 Q 100 35, 140 45 T 220 55 T 300 40 T 380 50 T 460 45 T 520 195";
        peakX = 300; peakY = 40;
    } else if (tabName === 'replied') {
        dArea = "M 60 195 Q 95 70, 130 85 T 210 120 T 290 95 T 370 130 T 450 90 T 520 195 Z";
        dLine = "M 60 195 Q 95 70, 130 85 T 210 120 T 290 95 T 370 130 T 450 90 T 520 195";
        peakX = 290; peakY = 95;
    } else { // failed
        dArea = "M 60 195 Q 95 170, 130 160 T 210 175 T 290 155 T 370 180 T 450 165 T 520 195 Z";
        dLine = "M 60 195 Q 95 170, 130 160 T 210 175 T 290 155 T 370 180 T 450 165 T 520 195";
        peakX = 290; peakY = 155;
    }

    if (areaPath) areaPath.setAttribute('d', dArea);
    if (linePath) linePath.setAttribute('d', dLine);
    if (peakDot) {
        peakDot.setAttribute('cx', String(peakX));
        peakDot.setAttribute('cy', String(peakY));
    }
    if (tooltip) {
        const leftPercent = ((peakX / 600) * 100).toFixed(1);
        const topPercent = ((peakY / 220) * 100).toFixed(1);
        tooltip.style.left = `${leftPercent}%`;
        tooltip.style.top = `${topPercent}%`;
    }
}

function renderCampaignsTable(filterText = '') {
    const tbody = document.getElementById('camp-table-body');
    const badge = document.getElementById('camp-total-count-badge');
    if (!tbody) return;

    const list = window.campaignsCache || [];
    const query = (filterText || '').toLowerCase().trim();
    const filtered = query
        ? list.filter(c => (c.name || '').toLowerCase().includes(query) || String(c.id).includes(query))
        : list;

    if (badge) {
        badge.textContent = `${filtered.length} Campaign(s)`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No broadcast campaigns found. Click "+ Create Campaign" to launch your first broadcast!</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
        const sent = c.sent_count || 0;
        const failed = c.failed_count || 0;
        const total = sent + failed;
        const delRate = total > 0 ? Math.round((sent / total) * 100) : 100;
        const statusPill = failed === 0 ? '<span class="status-pill status-delivered">Delivered</span>' : '<span class="status-pill status-partial">Completed</span>';

        return `
            <tr>
                <td><strong>${escapeHtml(c.name || ('Campaign #' + c.id))}</strong></td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
                <td><span class="badge" style="text-transform:capitalize;">${c.message_type || 'template'}</span></td>
                <td>${sent.toLocaleString()}</td>
                <td><span style="color:#10b981; font-weight:600;">${delRate}%</span></td>
                <td><span style="color:var(--primary); font-weight:600;">${Math.round(delRate * 0.95)}%</span></td>
                <td>${statusPill}</td>
                <td>
                    <button type="button" class="btn primary sm" onclick="viewCampaignAnalytics(${c.id})" style="padding:0.25rem 0.65rem; font-size:0.75rem; border-radius:6px;">
                        📊 View Dashboard
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.filterCampaignsList = function filterCampaignsList(term) {
    renderCampaignsTable(term);
};

function renderSampleCampaign() {
    const dummy = {
        campaign: {
            id: 0,
            name: 'Republic_Day_Sale',
            content: 'Hey Shivam 👋\nThe Republic Day 🇮🇳 Sale is LIVE!!\nOrder today win a SHOPPING VOUCHER 💰 worth ₹1000/-',
            created_at: new Date().toISOString(),
            cta_text: 'Shop Now',
            cta_url: 'https://inspenox.com'
        },
        metrics: {
            overview: 17861,
            sent: 17900,
            delivered: 17300,
            read: 16600,
            clicked: 7300,
            replied: 7500,
            failed: 535,
            overview_rate: 100,
            sent_rate: 100,
            delivered_rate: 97,
            read_rate: 93,
            clicked_rate: 45,
            replied_rate: 42,
            failed_rate: 3
        }
    };
    window.currentActiveCampaign = dummy;
    updateKpiTabStrip(dummy.metrics);
    updateWhatsAppChatPreview(dummy.campaign);
    updateCampaignMetaCard(dummy.campaign, dummy.metrics);
    updateCampaignTimelineChart(dummy.campaign, dummy.metrics, 'clicked');
}


// --- Inbox Logic (WhatsApp Web Inspired) ---

if (typeof currentInboxFilter === 'undefined') var currentInboxFilter = 'all';
if (typeof activeInboxTagFilter === 'undefined') var activeInboxTagFilter = null;
var inboxModalSelectedTags = [];

async function loadInboxSidebar() {
    const sidebar = document.getElementById('inbox-customers');
    if (sidebar) {
        sidebar.innerHTML = `<div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading chats...</span></div>`;
    }
    try {
        if (typeof availableTags === 'undefined' || !availableTags || availableTags.length === 0) {
            if (typeof loadTags === 'function') loadTags().catch(() => {});
        }

        const res = await apiFetch('/api/customers');
        const customers = await res.json();
        if (!sidebar) return;

        if (customers.error || !Array.isArray(customers)) {
            sidebar.innerHTML = '<div style="padding:1rem;font-size:0.85rem;color:var(--error);">Failed to load contacts.</div>';
            return;
        }

        inboxCustomersList = customers;
        filterAndRenderInboxContacts();

        // Calculate total UNREAD messages count (not total customers!)
        const totalUnread = customers.reduce((sum, c) => sum + (parseInt(c.unread_count) || 0), 0);
        const badge = document.getElementById('nav-inbox-badge');
        if (badge) {
            badge.textContent = totalUnread;
            badge.style.display = totalUnread > 0 ? 'inline-block' : 'none';
        }

    } catch (e) {
        console.error('Error in loadInboxSidebar:', e);
        if (sidebar) sidebar.innerHTML = '<div style="padding:1rem;font-size:0.85rem;color:var(--error);">Error loading chats.</div>';
    }
}

function isUnsavedLead(c) {
    if (c.is_saved === true || c.is_saved === 'true') return false;
    return (c.is_saved === false || c.is_saved === 'false') ||
        (c.name === c.phone) ||
        (parseInt(c.inbound_count) > 0 && parseInt(c.outbound_count) === 0 && !c.is_saved);
}

function filterAndRenderInboxContacts() {
    const query = document.getElementById('inbox-search')?.value.toLowerCase() || '';
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    const filtered = inboxCustomersList.filter(c => {
        const matchesQuery = (c.name && c.name.toLowerCase().includes(query)) ||
            (c.phone && c.phone.toLowerCase().includes(query));
        if (!matchesQuery) return false;

        const is24hActive = c.last_inbound_at && (now - new Date(c.last_inbound_at).getTime() <= twentyFourHoursMs);
        const isInboundLead = isUnsavedLead(c);

        if (currentInboxFilter === 'free') {
            if (!is24hActive) return false;
        } else if (currentInboxFilter === 'expired') {
            if (is24hActive) return false;
        } else if (currentInboxFilter === 'unsaved') {
            if (!isInboundLead) return false;
        }

        // Tag filter check
        if (activeInboxTagFilter) {
            const custTags = (c.tags || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
            if (!custTags.includes(activeInboxTagFilter.toLowerCase())) {
                return false;
            }
        }

        return true;
    });

    // Check unsaved leads count to show/hide bulk save button
    const unsavedLeadsCount = inboxCustomersList.filter(c => isUnsavedLead(c)).length;

    const bulkBtn = document.getElementById('btn-bulk-save-unsaved');
    if (bulkBtn) {
        if (unsavedLeadsCount > 0 && (currentInboxFilter === 'unsaved' || currentInboxFilter === 'all')) {
            bulkBtn.style.display = 'flex';
            bulkBtn.textContent = `✨ Save ${unsavedLeadsCount} Unsaved Lead(s) in Bulk`;
        } else {
            bulkBtn.style.display = 'none';
        }
    }

    renderInboxContacts(filtered);
}

function renderInboxContacts(list) {
    const sidebar = document.getElementById('inbox-customers');
    if (!sidebar) return;

    sidebar.innerHTML = '';
    if (list.length === 0) {
        let msg = 'No contacts found';
        if (activeInboxTagFilter) {
            msg = `No chats found with tag "🏷️ ${activeInboxTagFilter}"`;
        } else if (currentInboxFilter === 'free') {
            msg = 'No active 24h free tier chats';
        } else if (currentInboxFilter === 'unsaved') {
            msg = 'No new unsaved / ad leads found';
        }
        sidebar.innerHTML = `
            <div class="empty-state" style="padding:2.5rem 1rem; text-align:center;">
                <div style="font-size:1.8rem; margin-bottom:0.5rem;">🏷️</div>
                <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:0.75rem;">${msg}</p>
                ${activeInboxTagFilter ? `<button type="button" class="btn secondary sm" onclick="clearInboxTagFilter(event)">Clear Tag Filter</button>` : ''}
            </div>
        `;
        return;
    }

    list.forEach(c => {
        const unreadNum = parseInt(c.unread_count) || 0;
        const unreadBadgeHtml = unreadNum > 0
            ? `<span class="badge-count" style="font-size:0.7rem;padding:0.1rem 0.45rem;">${unreadNum}</span>`
            : '';

        const isInboundLead = isUnsavedLead(c);

        const leadTagHtml = isInboundLead
            ? `<span style="font-size:0.6rem; background:rgba(234, 179, 8, 0.18); color:#eab308; padding:0.1rem 0.35rem; border-radius:4px; margin-left:0.35rem; font-weight:600; display:inline-block;">Ad Lead</span>`
            : '';

        // Render customer tags preview
        let tagsHtml = '';
        if (c.tags && String(c.tags).trim()) {
            const tagNames = String(c.tags).split(',').map(t => t.trim()).filter(Boolean);
            if (tagNames.length > 0) {
                tagsHtml = `<div class="inbox-card-tags" style="display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.3rem;">` +
                    tagNames.slice(0, 3).map(tn => {
                        const style = getTagStyle(tn);
                        return `<span class="contact-tag-pill ${style.cls}" style="${style.styleAttr}" title="${tn}">${tn}</span>`;
                    }).join('') +
                    (tagNames.length > 3 ? `<span style="font-size:0.6rem; color:var(--text-muted); align-self:center;">+${tagNames.length - 3}</span>` : '') +
                    `</div>`;
            }
        }

        const div = document.createElement('div');
        div.className = `inbox-contact-card ${activeInboxCustomer === c.id ? 'active' : ''}`;
        div.setAttribute('data-id', c.id);
        div.innerHTML = `
            <div class="contact-avatar">${getInitial(c.name)}</div>
            <div class="contact-details">
                <div class="contact-name" style="display:flex; align-items:center; gap:0.25rem;">${c.name} ${leadTagHtml}</div>
                <div class="contact-phone">${formatDisplayPhone(c.phone)}</div>
                ${tagsHtml}
            </div>
            ${unreadBadgeHtml}
        `;
        div.onclick = () => {
            activeInboxCustomer = c.id;
            c.unread_count = 0; // Mark read locally
            filterAndRenderInboxContacts();
            openChat(c);
        };
        sidebar.appendChild(div);
    });
}

document.querySelectorAll('.inbox-filter-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.inbox-filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentInboxFilter = btn.dataset.filter || 'all';
        filterAndRenderInboxContacts();
    });
});

// WhatsApp Style Tag Filter Dropdown Functions
window.toggleInboxTagFilterDropdown = function toggleInboxTagFilterDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('inbox-tag-dropdown-menu');
    if (!dropdown) return;
    const isShown = dropdown.style.display !== 'none';
    if (isShown) {
        dropdown.style.display = 'none';
    } else {
        renderInboxTagFilterMenu();
        dropdown.style.display = 'flex';
        const searchInput = document.getElementById('inbox-tag-filter-search');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 50);
        }
    }
};

window.renderInboxTagFilterMenu = function renderInboxTagFilterMenu() {
    const listEl = document.getElementById('inbox-tag-filter-list');
    const clearBtn = document.getElementById('inbox-tag-dropdown-clear');
    if (!listEl) return;

    if (clearBtn) {
        clearBtn.style.display = activeInboxTagFilter ? 'block' : 'none';
    }

    const searchVal = (document.getElementById('inbox-tag-filter-search')?.value || '').toLowerCase().trim();

    // Calculate count of chats per tag in inboxCustomersList
    const tagCounts = {};
    if (Array.isArray(inboxCustomersList)) {
        inboxCustomersList.forEach(c => {
            if (c.tags) {
                const ts = String(c.tags).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                ts.forEach(t => {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                });
            }
        });
    }

    const allTags = (typeof availableTags !== 'undefined' && Array.isArray(availableTags) && availableTags.length > 0)
        ? availableTags
        : [
            { name: 'Repeat Buyers' }, { name: 'Recovered' }, { name: 'Order Placed(Prepaid)' },
            { name: 'Order Placed(CoD)' }, { name: 'Loyal' }, { name: 'Lost' },
            { name: 'High Spenders' }, { name: 'Curious Browsers' }, { name: 'At Risk' },
            { name: 'Abandoned Cart' }
        ];

    const filteredTags = allTags.filter(t => !searchVal || (t.name || '').toLowerCase().includes(searchVal));

    let html = `
        <div class="inbox-tag-filter-item ${!activeInboxTagFilter ? 'active' : ''}" onclick="selectInboxTagFilter(null, event)">
            <div class="inbox-tag-filter-item-left">
                <span class="inbox-tag-color-dot" style="background:var(--text-muted, #9ca3af);"></span>
                <span class="inbox-tag-item-name">All Chats (No Tag Filter)</span>
            </div>
            <span class="inbox-tag-item-count">${inboxCustomersList.length}</span>
            ${!activeInboxTagFilter ? '<span class="inbox-tag-check-icon">✓</span>' : ''}
        </div>
    `;

    if (filteredTags.length === 0) {
        html += `<div style="font-size:0.78rem; color:var(--text-muted); text-align:center; padding:1rem 0;">No matching tags found</div>`;
    } else {
        filteredTags.forEach(t => {
            const isSelected = activeInboxTagFilter && activeInboxTagFilter.toLowerCase() === (t.name || '').toLowerCase();
            const count = tagCounts[(t.name || '').toLowerCase()] || 0;
            const style = getTagStyle(t.name);
            const dotColor = (t.text_color || (style.styleAttr.match(/color:\s*([^;]+)/)?.[1])) || '#10b981';
            const escaped = (t.name || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");

            html += `
                <div class="inbox-tag-filter-item ${isSelected ? 'active' : ''}" onclick="selectInboxTagFilter('${escaped}', event)">
                    <div class="inbox-tag-filter-item-left">
                        <span class="inbox-tag-color-dot" style="background:${dotColor};"></span>
                        <span class="inbox-tag-item-name">${t.name}</span>
                    </div>
                    <span class="inbox-tag-item-count">${count}</span>
                    ${isSelected ? '<span class="inbox-tag-check-icon">✓</span>' : ''}
                </div>
            `;
        });
    }

    listEl.innerHTML = html;
};

window.selectInboxTagFilter = function selectInboxTagFilter(tagName, e) {
    if (e) e.stopPropagation();
    activeInboxTagFilter = tagName || null;
    updateInboxTagFilterUI();
    filterAndRenderInboxContacts();
    const dropdown = document.getElementById('inbox-tag-dropdown-menu');
    if (dropdown) dropdown.style.display = 'none';
};

window.clearInboxTagFilter = function clearInboxTagFilter(e) {
    if (e) e.stopPropagation();
    selectInboxTagFilter(null);
};

function updateInboxTagFilterUI() {
    const btn = document.getElementById('inbox-tag-filter-btn');
    const badge = document.getElementById('inbox-tag-filter-indicator');
    const banner = document.getElementById('inbox-active-tag-chip-row');
    const nameEl = document.getElementById('inbox-active-tag-name');

    if (activeInboxTagFilter) {
        if (btn) btn.classList.add('active');
        if (badge) badge.style.display = 'block';
        if (banner) banner.style.display = 'flex';
        if (nameEl) nameEl.textContent = activeInboxTagFilter;
    } else {
        if (btn) btn.classList.remove('active');
        if (badge) badge.style.display = 'none';
        if (banner) banner.style.display = 'none';
    }
}

document.getElementById('inbox-tag-filter-btn')?.addEventListener('click', toggleInboxTagFilterDropdown);
document.getElementById('inbox-tag-dropdown-clear')?.addEventListener('click', clearInboxTagFilter);
document.getElementById('inbox-remove-tag-filter-btn')?.addEventListener('click', clearInboxTagFilter);
document.getElementById('inbox-tag-filter-search')?.addEventListener('input', () => {
    renderInboxTagFilterMenu();
});

// Close dropdown on click outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('inbox-tag-dropdown-menu');
    const btn = document.getElementById('inbox-tag-filter-btn');
    if (dropdown && dropdown.style.display !== 'none') {
        if (!dropdown.contains(e.target) && !btn?.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

// Interactive Modal for Reviewing and Saving Unsaved Ad Leads
function openSaveUnsavedLeadsModal() {
    const unsavedList = inboxCustomersList.filter(c => isUnsavedLead(c));
    if (unsavedList.length === 0) {
        showModal('Info', 'All ad leads are already saved in the Customer Directory!');
        return;
    }

    const modal = document.getElementById('save-unsaved-leads-modal');
    const container = document.getElementById('unsaved-leads-list-container');
    if (!modal || !container) return;

    container.innerHTML = '';
    unsavedList.forEach(c => {
        const formattedPhone = formatIndiaPhone(c.phone);
        const displayPhone = formatDisplayPhone(c.phone);
        const initialName = c.name && c.name !== c.phone ? c.name : `Lead ${formattedPhone.slice(-4)}`;

        const row = document.createElement('div');
        row.className = 'unsaved-lead-item-row';
        row.setAttribute('data-phone', formattedPhone);
        row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.65rem 0.85rem; background: var(--bg-sidebar); border-radius: 10px; border: 1px solid var(--border);';

        row.innerHTML = `
            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="text" class="lead-name-input" value="${initialName}" placeholder="Enter Customer Name" style="padding: 0.4rem 0.65rem; font-size: 0.825rem; font-weight: 600; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-main); width: 100%;">
                </div>
                <span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${displayPhone}</span>
            </div>
            <button type="button" class="btn-save-single-lead btn primary sm" style="white-space: nowrap; font-size: 0.75rem; padding: 0.45rem 0.85rem;">
                ➕ Save Contact
            </button>
        `;

        const singleSaveBtn = row.querySelector('.btn-save-single-lead');
        const nameInput = row.querySelector('.lead-name-input');

        singleSaveBtn.addEventListener('click', async () => {
            const consentChecked = document.getElementById('unsaved-consent-check')?.checked;
            if (!consentChecked) {
                showModal('Terms Consent Required', 'Please check the WhatsApp Business Terms consent box to proceed.');
                return;
            }

            const newName = nameInput.value.trim() || initialName;
            singleSaveBtn.disabled = true;
            singleSaveBtn.innerHTML = '<span class="spinner"></span> Saving...';

            try {
                const res = await apiFetch('/api/customers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName, phone: formattedPhone, company_id: getCompanyId() })
                });
                const data = await res.json();

                if (data.success) {
                    singleSaveBtn.innerHTML = '✅ Saved';
                    singleSaveBtn.style.background = '#10b981';
                    singleSaveBtn.style.borderColor = '#10b981';
                    nameInput.disabled = true;

                    // Update local customer state
                    c.is_saved = true;
                    c.name = newName;
                    c.phone = formattedPhone;

                    // Refresh directory & sidebar
                    await loadCustomers();
                    filterAndRenderInboxContacts();
                } else {
                    throw new Error(data.error || 'Failed to save customer');
                }
            } catch (err) {
                singleSaveBtn.disabled = false;
                singleSaveBtn.innerHTML = '➕ Save Contact';
                showModal('Error', err.message);
            }
        });

        container.appendChild(row);
    });

    modal.classList.remove('hidden');
}

document.getElementById('btn-bulk-save-unsaved')?.addEventListener('click', openSaveUnsavedLeadsModal);
document.getElementById('btn-close-unsaved-modal-x')?.addEventListener('click', () => {
    document.getElementById('save-unsaved-leads-modal')?.classList.add('hidden');
});
document.getElementById('btn-cancel-unsaved-modal')?.addEventListener('click', () => {
    document.getElementById('save-unsaved-leads-modal')?.classList.add('hidden');
});

document.getElementById('btn-save-all-unsaved-leads')?.addEventListener('click', async () => {
    const consentChecked = document.getElementById('unsaved-consent-check')?.checked;
    if (!consentChecked) {
        showModal('Terms Consent Required', 'Please check the WhatsApp Business Terms consent box to proceed.');
        return;
    }

    const rows = document.querySelectorAll('#unsaved-leads-list-container .unsaved-lead-item-row');
    const toSave = [];

    rows.forEach(row => {
        const btn = row.querySelector('.btn-save-single-lead');
        if (btn && !btn.disabled) { // Not already saved
            const phone = row.getAttribute('data-phone');
            const name = row.querySelector('.lead-name-input')?.value.trim() || `Lead ${phone.slice(-4)}`;
            toSave.push({ name, phone });
        }
    });

    if (toSave.length === 0) {
        showModal('Info', 'All leads in the list are already saved!');
        document.getElementById('save-unsaved-leads-modal')?.classList.add('hidden');
        return;
    }

    const bulkAllBtn = document.getElementById('btn-save-all-unsaved-leads');
    if (bulkAllBtn) {
        bulkAllBtn.disabled = true;
        bulkAllBtn.innerHTML = '<span class="spinner"></span> Saving All...';
    }

    try {
        const res = await apiFetch('/api/customers-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customers: toSave, company_id: getCompanyId() })
        });
        const result = await res.json();

        if (result.success) {
            document.getElementById('save-unsaved-leads-modal')?.classList.add('hidden');

            // Switch to All Chats filter so saved contacts appear immediately
            currentInboxFilter = 'all';
            document.querySelectorAll('.inbox-filter-chip').forEach(b => {
                if (b.dataset.filter === 'all') b.classList.add('active');
                else b.classList.remove('active');
            });

            await loadCustomers();
            await loadInboxSidebar();

            showModal('Success', `🎉 Successfully saved ${result.count} lead(s) to Customer Directory!`);
        } else {
            throw new Error(result.error || 'Failed to bulk save leads');
        }
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        if (bulkAllBtn) {
            bulkAllBtn.disabled = false;
            bulkAllBtn.innerHTML = '✨ Save All Unsaved Leads';
        }
    }
});

document.getElementById('inbox-search')?.addEventListener('input', () => {
    filterAndRenderInboxContacts();
});

async function openChat(customer, pushHistory = true) {
    activeInboxCustomer = customer.id;
    activeCustomerData = customer;

    if (pushHistory && history.pushState) {
        history.pushState({ view: 'inbox', chatId: customer.id }, '', `#inbox-chat-${customer.id}`);
    }

    // Show Header & Form
    const headerBar = document.getElementById('chat-header-bar');
    const activeAvatar = document.getElementById('active-chat-avatar');
    const activeName = document.getElementById('active-chat-name');
    const activePhone = document.getElementById('active-chat-phone');

    if (headerBar) headerBar.style.display = 'flex';
    if (activeAvatar) activeAvatar.textContent = getInitial(customer.name);
    if (activeName) activeName.textContent = customer.name;
    if (activePhone) activePhone.textContent = formatDisplayPhone(customer.phone);
    renderActiveChatTags(customer);

    const badge = document.getElementById('active-chat-window-badge');
    if (badge) {
        if (customer.last_inbound_at) {
            const diffMs = Date.now() - new Date(customer.last_inbound_at).getTime();
            if (diffMs <= 24 * 60 * 60 * 1000) {
                const remainingMs = (24 * 60 * 60 * 1000) - diffMs;
                const h = Math.floor(remainingMs / (1000 * 60 * 60));
                const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                badge.textContent = `⚡ 24h Active (${h}h ${m}m)`;
                badge.className = 'window-badge active';
            } else {
                badge.textContent = '🔒 24h Expired';
                badge.className = 'window-badge expired';
            }
        } else {
            badge.textContent = '🔒 24h Expired';
            badge.className = 'window-badge expired';
        }
    }

    document.getElementById('chat-active-customer').value = customer.id;
    document.getElementById('chat-reply-form').style.display = 'flex';

    // Mobile toggle
    if (window.innerWidth <= 768) {
        document.getElementById('inbox-customers-panel')?.classList.add('hidden');
        document.getElementById('inbox-chat-area')?.classList.remove('hidden');
    }

    await fetchChatMessages(true);

    if (inboxPollInterval) clearInterval(inboxPollInterval);
    inboxPollInterval = setInterval(fetchChatMessages, 4000);
}

document.getElementById('close-chat-btn')?.addEventListener('click', closeChat);

function closeChat() {
    activeInboxCustomer = null;
    activeCustomerData = null;
    if (inboxPollInterval) clearInterval(inboxPollInterval);

    const headerBar = document.getElementById('chat-header-bar');
    if (headerBar) headerBar.style.display = 'none';

    document.getElementById('chat-reply-form').style.display = 'none';
    document.getElementById('chat-messages').innerHTML = `
        <div class="empty-state">
            <div class="empty-inbox-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h3>Select a customer chat</h3>
            <p>Choose a conversation from the left to start messaging in real-time.</p>
        </div>
    `;
    document.querySelectorAll('.inbox-contact-card').forEach(el => el.classList.remove('active'));

    if (window.innerWidth <= 768) {
        document.getElementById('inbox-customers-panel')?.classList.remove('hidden');
        document.getElementById('inbox-chat-area')?.classList.add('hidden');
    }
}

function renderActiveChatTags(customer) {
    const container = document.getElementById('active-chat-tags-list');
    if (!container) return;
    container.innerHTML = '';
    const cust = customer || activeCustomerData;
    if (!cust) return;

    const tags = (cust.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    tags.forEach(tn => {
        const style = getTagStyle(tn);
        const pill = document.createElement('span');
        pill.className = `contact-tag-pill ${style.cls}`;
        pill.setAttribute('style', style.styleAttr + '; cursor:pointer; font-size:0.7rem; padding:0.12rem 0.45rem;');
        pill.textContent = tn;
        pill.title = 'Click to manage tags';
        pill.onclick = () => openInboxAssignTagsModal();
        container.appendChild(pill);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.style.cssText = 'font-size:0.68rem; font-weight:600; padding:0.12rem 0.45rem; border-radius:4px; background:rgba(0,0,0,0.05); color:var(--text-muted); border:1px dashed var(--border); cursor:pointer; display:inline-flex; align-items:center; gap:3px; transition:all 0.15s;';
    addBtn.innerHTML = '<span>🏷️</span><span>+ Tag</span>';
    addBtn.title = 'Assign or edit tags for this chat';
    addBtn.onclick = () => openInboxAssignTagsModal();
    container.appendChild(addBtn);
}

window.openInboxAssignTagsModal = function openInboxAssignTagsModal() {
    if (!activeInboxCustomer || !activeCustomerData) {
        showToast('Please select a chat first.', 'warning');
        return;
    }
    const modal = document.getElementById('modal-inbox-tags');
    if (!modal) return;

    const custNameEl = document.getElementById('inbox-tag-modal-cust-name');
    if (custNameEl) {
        custNameEl.textContent = `Chat: ${activeCustomerData.name} (${formatDisplayPhone(activeCustomerData.phone)})`;
    }

    inboxModalSelectedTags = (activeCustomerData.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    renderInboxModalTagsList();
    modal.style.display = 'flex';
};

window.closeInboxAssignTagsModal = function closeInboxAssignTagsModal() {
    const modal = document.getElementById('modal-inbox-tags');
    if (modal) modal.style.display = 'none';
};

window.renderInboxModalTagsList = function renderInboxModalTagsList() {
    const listEl = document.getElementById('inbox-modal-tags-list');
    if (!listEl) return;
    const searchVal = (document.getElementById('inbox-modal-tag-search')?.value || '').toLowerCase().trim();

    const allTags = (typeof availableTags !== 'undefined' && Array.isArray(availableTags) && availableTags.length > 0)
        ? availableTags
        : [
            { name: 'Repeat Buyers' }, { name: 'Recovered' }, { name: 'Order Placed(Prepaid)' },
            { name: 'Order Placed(CoD)' }, { name: 'Loyal' }, { name: 'Lost' },
            { name: 'High Spenders' }, { name: 'Curious Browsers' }, { name: 'At Risk' },
            { name: 'Abandoned Cart' }
        ];

    const filtered = allTags.filter(t => !searchVal || (t.name || '').toLowerCase().includes(searchVal));

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:1rem;">No matching tags found</div>`;
        return;
    }

    listEl.innerHTML = filtered.map(t => {
        const isChecked = inboxModalSelectedTags.some(tag => tag.toLowerCase() === (t.name || '').toLowerCase());
        const style = getTagStyle(t.name);
        const escaped = (t.name || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.45rem 0.6rem; border-radius:8px; background:${isChecked ? 'rgba(37, 211, 102, 0.08)' : 'var(--bg-main, #fafafa)'}; border:1px solid ${isChecked ? 'rgba(37, 211, 102, 0.3)' : 'var(--border)'}; cursor:pointer;" onclick="toggleInboxModalTag('${escaped}')">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} style="cursor:pointer;" onclick="event.stopPropagation(); toggleInboxModalTag('${escaped}')">
                    <span class="contact-tag-pill ${style.cls}" style="${style.styleAttr}">${t.name}</span>
                </div>
            </div>
        `;
    }).join('');
};

window.toggleInboxModalTag = function toggleInboxModalTag(tagName) {
    const idx = inboxModalSelectedTags.findIndex(t => t.toLowerCase() === tagName.toLowerCase());
    if (idx >= 0) {
        inboxModalSelectedTags.splice(idx, 1);
    } else {
        inboxModalSelectedTags.push(tagName);
    }
    renderInboxModalTagsList();
};

window.saveInboxCustomerTags = async function saveInboxCustomerTags() {
    if (!activeInboxCustomer || !activeCustomerData) return;
    const saveBtn = document.getElementById('btn-save-inbox-tags');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    const newTagsStr = inboxModalSelectedTags.join(', ');

    try {
        const companyId = activeCustomerData.company_id || (typeof currentCompanyData !== 'undefined' && currentCompanyData ? currentCompanyData.id : null);
        const res = await apiFetch('/api/customers', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: activeInboxCustomer,
                tags: newTagsStr,
                company_id: companyId
            })
        });
        const data = await res.json();
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            activeCustomerData.tags = newTagsStr;
            const inListCust = inboxCustomersList.find(c => String(c.id) === String(activeInboxCustomer));
            if (inListCust) inListCust.tags = newTagsStr;
            
            showToast('Tags updated successfully', 'success');
            closeInboxAssignTagsModal();
            renderActiveChatTags(activeCustomerData);
            filterAndRenderInboxContacts();
        }
    } catch(e) {
        showToast('Failed to save tags: ' + e.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Tags';
        }
    }
};

document.getElementById('inbox-modal-tag-search')?.addEventListener('input', () => {
    renderInboxModalTagsList();
});

function renderTick(status, direction) {
    if (direction === 'inbound') return '';
    if (status === 'read') return `<span class="tick-icon tick-read" title="Read (Seen)" style="color:#34b7f1; font-weight:800; font-size:0.85rem; margin-left:0.35rem; display:inline-block;">✓✓</span>`;
    if (status === 'delivered') return `<span class="tick-icon tick-delivered" title="Delivered to Phone" style="color:var(--text-muted); font-weight:700; font-size:0.85rem; margin-left:0.35rem; display:inline-block;">✓✓</span>`;
    if (status === 'failed') return `<span class="tick-icon tick-failed" title="Failed to deliver" style="color:#ef4444; font-weight:bold; font-size:0.85rem; margin-left:0.35rem; display:inline-block;">⚠️</span>`;
    return `<span class="tick-icon tick-sent" title="Sent to Meta" style="color:var(--text-muted); font-size:0.85rem; margin-left:0.35rem; display:inline-block;">✓</span>`;
}

function update24hWindowBadge(messages) {
    const badge = document.getElementById('active-chat-window-badge');
    if (!badge) return;

    if (!Array.isArray(messages) || messages.length === 0) {
        badge.textContent = '🔒 24h Window Expired';
        badge.className = 'window-badge expired';
        badge.title = 'No inbound messages from customer yet. Use a Template to message.';
        return;
    }

    const inboundMsgs = messages.filter(m => m.direction === 'inbound');
    if (inboundMsgs.length === 0) {
        badge.textContent = '🔒 24h Window Expired';
        badge.className = 'window-badge expired';
        badge.title = 'No inbound messages from customer yet. Use a Template to initiate conversation.';
        return;
    }

    const latestInbound = inboundMsgs.reduce((latest, m) => {
        const t = new Date(m.created_at).getTime();
        return t > latest ? t : latest;
    }, 0);

    const now = Date.now();
    const diffMs = now - latestInbound;
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    if (diffMs <= twentyFourHoursMs) {
        const remainingMs = twentyFourHoursMs - diffMs;
        const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
        const remainingMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        badge.textContent = `⚡ 24h Active (${remainingHours}h ${remainingMins}m)`;
        badge.className = 'window-badge active';
        badge.title = '24-hour service window is active. Free session replies allowed.';
    } else {
        badge.textContent = '🔒 24h Expired';
        badge.className = 'window-badge expired';
        badge.title = 'Last inbound message was over 24 hours ago. Send a Template message to reconnect.';
    }
}

function getChatDateHeader(dateStr) {
    if (!dateStr) return 'Today';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Today';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (msgDate.getTime() === today.getTime()) {
        return 'Today';
    } else if (msgDate.getTime() === yesterday.getTime()) {
        return 'Yesterday';
    } else {
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
}

let lastChatMsgCount = 0;
let lastChatLatestMsgId = null;
let lastChatStatusHash = '';

// Pre-defined & Persistent WhatsApp Template Registry (Renders fully even when Meta session/subscription is offline)
const BUILTIN_TEMPLATE_DEFINITIONS = {
    'jaspers_market_order_confirmation_v1': {
        title: "Jasper's Market · Order Confirmed",
        headerBadge: 'Order Update',
        headerIcon: '📦',
        body: 'Thank you for your order! Your purchase has been confirmed and is being prepared for fulfillment. We will notify you with live courier tracking as soon as it is dispatched.',
        footer: "Jasper's Market · Automated WhatsApp Confirmation",
        buttons: [
            { text: 'Track Order Live', icon: '↗️', type: 'url' },
            { text: 'Customer Support', icon: '💬', type: 'quick_reply' }
        ]
    },
    'vinayaka_chavithi': {
        title: 'Happy Vinayaka Chavithi! 🪔',
        headerImage: '/vinayaka_chavithi_header.png',
        headerBadge: 'Festive Greeting',
        headerIcon: '🙏',
        body: 'Dear {{customer_name}},\n\nWishing you and your beloved family a joyous and blessed Vinayaka Chavithi! May Lord Ganesha bestow good health, boundless happiness, and prosperous milestones upon your home. Celebrate with special festive offers curated just for you.',
        footer: 'Inspenox Business Suite · Festive Campaign',
        buttons: [
            { text: 'Explore Festive Offers', icon: '🎁', type: 'url' },
            { text: 'Connect with Us', icon: '💬', type: 'quick_reply' }
        ]
    },
    'republic_day_sale': {
        title: 'Republic Day Sale LIVE! 🇮🇳',
        headerBadge: 'Mega Campaign',
        headerIcon: '🛍️',
        body: 'The Republic Day Special Sale is officially LIVE! Order today and win an exclusive shopping voucher worth ₹1000/- with instant free delivery across India.',
        footer: 'Inspenox Verified Store',
        buttons: [
            { text: 'Shop Now', icon: '🛒', type: 'url' },
            { text: 'Claim Voucher', icon: '🎁', type: 'quick_reply' }
        ]
    }
};

function formatTemplateDisplayName(slug) {
    if (!slug) return 'WhatsApp Message Template';
    return slug
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

function resolveTemplateCard(templateSlug, customerData) {
    const cleanSlug = String(templateSlug || '').trim().toLowerCase();

    // Determine customer display name for variable replacement
    let custName = '';
    if (customerData && customerData.name && customerData.name !== customerData.phone) {
        custName = customerData.name.trim();
    } else {
        const foundCust = (typeof inboxCustomersList !== 'undefined' && Array.isArray(inboxCustomersList))
            ? inboxCustomersList.find(c => String(c.id) === String(activeInboxCustomer))
            : null;
        if (foundCust && foundCust.name && foundCust.name !== foundCust.phone) {
            custName = foundCust.name.trim();
        } else {
            const chatHeaderName = document.getElementById('active-chat-name')?.textContent?.trim();
            if (chatHeaderName && !chatHeaderName.startsWith('+') && !chatHeaderName.startsWith('Lead')) {
                custName = chatHeaderName;
            }
        }
    }
    if (!custName) custName = 'Valued Customer';

    function replaceVariables(text) {
        if (!text) return '';
        return text
            .replace(/{{(?:1|customer_name|cust_name|name|user_name|client_name)}}/gi, custName)
            .replace(/{{2}}/g, 'Special Festive Privilege')
            .replace(/{{3}}/g, 'Inspenox')
            .replace(/{{[^{}]+}}/g, custName); // Catch-all for any other unreplaced raw variable
    }

    // 1. Check if template exists in templatesCache (Meta API cache)
    if (typeof templatesCache !== 'undefined' && Array.isArray(templatesCache) && templatesCache.length > 0) {
        const found = templatesCache.find(t => (t.name || '').toLowerCase() === cleanSlug);
        if (found && Array.isArray(found.components)) {
            let headerText = '';
            let headerImage = '';
            let bodyText = '';
            let footerText = '';
            let buttons = [];

            found.components.forEach(c => {
                if (c.type === 'HEADER') {
                    if (c.format === 'IMAGE') {
                        headerImage = c.example?.header_handle?.[0] || (cleanSlug.includes('vinayaka') ? '/vinayaka_chavithi_header.png' : '');
                        headerText = ''; // Do NOT display raw string 'IMAGE Header'
                    } else if (c.text) {
                        headerText = c.text;
                    }
                } else if (c.type === 'BODY') {
                    bodyText = c.text || '';
                } else if (c.type === 'FOOTER') {
                    footerText = c.text || '';
                } else if (c.type === 'BUTTONS' && Array.isArray(c.buttons)) {
                    buttons = c.buttons.map(b => ({
                        text: b.text || 'Action',
                        icon: b.type === 'PHONE_NUMBER' ? '📞' : b.type === 'URL' ? '↗️' : '💬',
                        type: b.type
                    }));
                }
            });

            if (cleanSlug.includes('vinayaka') && !headerImage) {
                headerImage = '/vinayaka_chavithi_header.png';
            }

            if (bodyText) {
                return {
                    title: headerText || (headerImage ? '' : formatTemplateDisplayName(cleanSlug)),
                    headerImage: headerImage,
                    headerBadge: 'Meta Template',
                    headerIcon: headerImage ? '' : '⚡',
                    body: replaceVariables(bodyText),
                    footer: footerText || 'Official WhatsApp Cloud API',
                    buttons: buttons.length > 0 ? buttons : [{ text: 'Quick Reply', icon: '💬', type: 'quick_reply' }]
                };
            }
        }
    }

    // 2. Check built-in persistent registry (Works unconditionally without active subscription or Meta session)
    if (BUILTIN_TEMPLATE_DEFINITIONS[cleanSlug]) {
        const def = BUILTIN_TEMPLATE_DEFINITIONS[cleanSlug];
        return {
            ...def,
            body: replaceVariables(def.body)
        };
    }

    // 3. Fallback for any other template name (e.g. order_update, welcome_flow)
    const displayName = formatTemplateDisplayName(cleanSlug);
    let sampleBody = `Hello ${custName}! This is an official verified WhatsApp template message for ${displayName}. All details and updates have been synchronized to your conversation.`;
    let fallbackHeaderImg = '';
    if (cleanSlug.includes('vinayaka')) {
        fallbackHeaderImg = '/vinayaka_chavithi_header.png';
        sampleBody = `Wishing you and your family a joyous and blessed Vinayaka Chavithi! May Lord Ganesha bestow good health, boundless happiness, and prosperous milestones upon your home.`;
    }

    return {
        title: fallbackHeaderImg ? '' : displayName,
        headerImage: fallbackHeaderImg,
        headerBadge: 'Meta Template',
        headerIcon: fallbackHeaderImg ? '' : '⚡',
        body: replaceVariables(sampleBody),
        footer: 'Official Meta WhatsApp Cloud API',
        buttons: [
            { text: 'View Details', icon: '↗️', type: 'url' },
            { text: 'Reply to Message', icon: '💬', type: 'quick_reply' }
        ]
    };
}

async function fetchChatMessages(isInitial = false) {
    if (!activeInboxCustomer) return;
    const chatContainer = document.getElementById('chat-messages');
    if (!chatContainer) return;

    if (isInitial) {
        lastChatMsgCount = 0;
        lastChatLatestMsgId = null;
        lastChatStatusHash = '';
        chatContainer.innerHTML = `<div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading conversation history...</span></div>`;
    }

    try {
        const res = await apiFetch(`/api/messages?customer_id=${activeInboxCustomer}`);
        const messages = await res.json();

        if (messages.error || !Array.isArray(messages)) return;

        update24hWindowBadge(messages);

        const latestMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const latestMsgId = latestMsg ? (latestMsg.id || latestMsg.created_at) : null;
        const currentStatusHash = messages.map(m => `${m.id}:${m.status}`).join('|');

        // Skip DOM re-render on polling if message count, latest message ID, AND status hash haven't changed
        if (!isInitial && messages.length === lastChatMsgCount && latestMsgId === lastChatLatestMsgId && currentStatusHash === lastChatStatusHash) {
            return;
        }

        const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 140;

        lastChatMsgCount = messages.length;
        lastChatLatestMsgId = latestMsgId;
        lastChatStatusHash = currentStatusHash;

        chatContainer.innerHTML = '';

        if (messages.length === 0) {
            chatContainer.innerHTML = `
                <div class="empty-state">
                    <p style="color:var(--text-muted);">No message history with this contact yet.</p>
                </div>
            `;
            return;
        }

        let lastDateHeader = null;

        messages.forEach(m => {
            const dateHeader = getChatDateHeader(m.created_at);
            if (dateHeader !== lastDateHeader) {
                lastDateHeader = dateHeader;
                const divider = document.createElement('div');
                divider.className = 'chat-date-divider';
                divider.innerHTML = `<span>${dateHeader}</span>`;
                chatContainer.appendChild(divider);
            }

            const row = document.createElement('div');
            row.className = `msg-row ${m.direction}`;

            const timeStr = formatTime(m.created_at);
            const tickHtml = renderTick(m.status, m.direction);

            let contentHtml = m.content || '';
            const isTemplate = contentHtml.startsWith('[Template]') || (m.type === 'template' && !contentHtml.includes('template-card-rendered'));

            if (isTemplate) {
                const templateSlug = contentHtml.replace(/^\[Template\]\s*/i, '').trim();
                const templateCard = resolveTemplateCard(templateSlug, activeCustomerData);

                contentHtml = `
                    <div class="template-card-rendered">
                        <div class="tpl-card-badge-row">
                            <span class="tpl-badge">
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="#00a884"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                                <span>${templateCard.headerBadge || 'Meta Template'}</span>
                            </span>
                            <span class="tpl-slug-pill" title="Template Slug: ${templateSlug}">${templateSlug}</span>
                        </div>

                        ${templateCard.headerImage ? `
                            <div class="tpl-card-media-wrap">
                                <img src="${templateCard.headerImage}" alt="${templateCard.title || 'Template Banner'}" class="tpl-card-header-img" onerror="this.style.display='none'" />
                            </div>
                        ` : ''}

                        ${templateCard.title ? `
                            <div class="tpl-card-title">
                                <span class="tpl-icon">${templateCard.headerIcon || '📋'}</span>
                                <strong>${templateCard.title}</strong>
                            </div>
                        ` : ''}

                        <div class="tpl-card-body">
                            ${templateCard.body.replace(/\n/g, '<br>')}
                        </div>

                        ${templateCard.footer ? `
                            <div class="tpl-card-footer">${templateCard.footer}</div>
                        ` : ''}

                        ${templateCard.buttons && templateCard.buttons.length > 0 ? `
                            <div class="tpl-card-buttons-container">
                                ${templateCard.buttons.map(b => `
                                    <div class="tpl-card-action-btn" title="Template Action: ${b.text}">
                                        <span>${b.icon || '↗️'}</span>
                                        <span>${b.text}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else if (contentHtml === '[button]' || contentHtml === '[Button]' || contentHtml === 'button' || contentHtml === '[button reply]' || contentHtml === 'Button Clicked') {
                contentHtml = `<span style="display:inline-flex;align-items:center;gap:0.35rem;background:rgba(16,185,129,0.12);color:#10b981;padding:0.25rem 0.55rem;border-radius:6px;font-weight:600;font-size:0.8rem;">🔘 Quick Reply Button Clicked</span>`;
            } else if (contentHtml.startsWith('[button]')) {
                const btnText = contentHtml.replace('[button]', '').trim();
                contentHtml = `<span style="display:inline-flex;align-items:center;gap:0.35rem;background:rgba(16,185,129,0.12);color:#10b981;padding:0.25rem 0.55rem;border-radius:6px;font-weight:600;font-size:0.8rem;">🔘 Tapped: "${btnText || 'Quick Reply'}"</span>`;
            } else if (m.type === 'button' || m.type === 'interactive') {
                contentHtml = `<span style="display:inline-flex;align-items:center;gap:0.35rem;background:rgba(16,185,129,0.12);color:#10b981;padding:0.25rem 0.55rem;border-radius:6px;font-weight:600;font-size:0.8rem;">🔘 Tapped: "${contentHtml}"</span>`;
            }

            row.innerHTML = `
                <div class="message-bubble ${m.direction}">
                    <div class="msg-content">${contentHtml}</div>
                    <div class="msg-meta">
                        <span>${timeStr}</span>
                        ${tickHtml}
                    </div>
                </div>
            `;
            chatContainer.appendChild(row);
        });

        if (isInitial || isNearBottom) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Update nav badge to reflect cleared unread count
        if (inboxCustomersList.length > 0) {
            const currentCust = inboxCustomersList.find(c => c.id === activeInboxCustomer);
            if (currentCust) currentCust.unread_count = 0;
            const remainingUnread = inboxCustomersList.reduce((sum, c) => sum + (parseInt(c.unread_count) || 0), 0);
            const badge = document.getElementById('nav-inbox-badge');
            if (badge) {
                badge.textContent = remainingUnread;
                badge.style.display = remainingUnread > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (e) {
        console.error('Error in fetchChatMessages:', e);
    }
}

document.getElementById('chat-reply-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('chat-reply-text');
    const content = inputEl.value.trim();
    if (!content) return;

    const customerId = document.getElementById('chat-active-customer').value;
    const btn = e.target.querySelector('button[type="submit"]');

    inputEl.value = '';
    btn.disabled = true;

    const res = await apiFetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            customer_id: customerId,
            type: 'text',
            content: content
        })
    });

    btn.disabled = false;

    const result = await res.json();
    if (result.error) {
        showModal('Message Error', "Failed to send message: " + result.error);
    }

    fetchChatMessages();
});

// Toggle Chat Header 3-Dots Dropdown Menu
document.getElementById('chat-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('chat-dropdown-menu');
    if (menu) menu.classList.toggle('hidden');
});

// Close dropdown menu when clicking anywhere outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('chat-dropdown-menu');
    if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
});

// Send Template directly from Inbox to Initiate Conversation with New Numbers
document.getElementById('btn-inbox-send-template')?.addEventListener('click', async () => {
    document.getElementById('chat-dropdown-menu')?.classList.add('hidden');
    if (!activeInboxCustomer) return;

    showModal(
        'Loading Message Templates',
        `<div style="padding:1.25rem 0.5rem; text-align:center;">
            <div class="spinner" style="width:2.25rem; height:2.25rem; border-width:3px; margin:0 auto 1rem auto; display:block;"></div>
            <p style="margin:0; font-size:0.95rem; font-weight:600; color:var(--text-main);">Fetching Approved Meta Templates...</p>
            <p style="margin:0.35rem 0 0 0; font-size:0.8rem; color:var(--text-muted);">Please wait while template definitions & media library options are loaded.</p>
        </div>`,
        'loading'
    );

    try {
        const res = await apiFetch('/api/templates');
        const json = await res.json();
        const templates = Array.isArray(json) ? json : (json.data || json.templates || []);

        if (!Array.isArray(templates) || templates.length === 0) {
            showModal('No Templates Found', 'No approved Meta message templates found in your WhatsApp Business Account.');
            return;
        }

        const templateOptions = templates.map(t => `<option value="${t.name}" data-lang="${t.language}">${t.name} (${t.language})</option>`).join('');

        // Fetch media library items for template header selection
        let mediaOptions = '<option value="">-- Select from uploaded files --</option>';
        try {
            const mediaRes = await apiFetch('/api/media');
            const mediaList = await mediaRes.json();
            if (Array.isArray(mediaList)) {
                mediaList.forEach(m => {
                    const val = m.meta_media_id || m.file_url;
                    if (val) {
                        mediaOptions += `<option value="${val}">${m.name} (${m.type})</option>`;
                    }
                });
            }
        } catch (e) { }

        const modalHtml = `
            <div style="text-align:left; margin-top:0.75rem;">
                <div style="margin-bottom: 1rem;">
                    <label style="font-size:0.85rem; color:var(--text-muted); display:block; margin-bottom:0.35rem; font-weight:600;">Choose an Approved Meta Template to send:</label>
                    <select id="modal-template-select" style="width:100%; padding:0.6rem; border-radius:6px; background:var(--bg-dark); color:var(--text-main); border:1px solid var(--border);">
                        ${templateOptions}
                    </select>
                </div>

                <div id="modal-template-media-group" style="display:none; border-top:1px solid var(--border); padding-top:0.85rem; margin-top:0.85rem;">
                    <!-- Auto-Attached Badge Card -->
                    <div id="modal-template-auto-media" style="margin-bottom:0.75rem;"></div>

                    <!-- Optional Custom Override (Hidden by default) -->
                    <div id="modal-custom-media-wrapper" style="display:none;">
                        <label id="modal-template-media-label" style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:0.4rem; font-weight:600;">Custom Header Override (Optional):</label>
                        
                        <div style="margin-bottom:0.75rem;">
                            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.25rem;">Option 1: Choose from Media Library</label>
                            <select id="modal-media-select" style="width:100%; padding:0.5rem; border-radius:6px; background:var(--bg-dark); color:var(--text-main); border:1px solid var(--border); font-size:0.85rem;">
                                ${mediaOptions}
                            </select>
                        </div>

                        <div>
                            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:0.25rem;">Option 2: Or Upload New File</label>
                            <div class="file-dropzone" style="padding:0.75rem; text-align:center; cursor:pointer;" onclick="document.getElementById('modal-media-file').click()">
                                <span id="modal-dropzone-text" style="font-size:0.8rem; color:var(--text-muted);">Click to browse and upload media file</span>
                                <input type="file" id="modal-media-file" accept="image/*,video/*" style="display:none">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        showModal('Send Template Message', 'Select a template to initiate conversation:', 'confirm', async () => {
            const selectEl = document.getElementById('modal-template-select');
            const mediaSelectEl = document.getElementById('modal-media-select');
            const fileInputEl = document.getElementById('modal-media-file');

            if (!selectEl) return;
            const templateName = selectEl.value;
            const templateLang = selectEl.options[selectEl.selectedIndex].getAttribute('data-lang') || 'en_US';

            const tmpl = templates.find(t => t.name === templateName);
            const headerComp = tmpl && tmpl.components ? tmpl.components.find(c => c.type === 'HEADER') : null;
            const requiresMedia = headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format);

            let media_id = null;
            let media_type = null;

            if (requiresMedia) {
                media_type = headerComp.format.toLowerCase();
                const customWrapEl = document.getElementById('modal-custom-media-wrapper');
                const isCustomActive = customWrapEl && customWrapEl.style.display !== 'none';

                if (isCustomActive && mediaSelectEl && mediaSelectEl.value) {
                    media_id = mediaSelectEl.value;
                } else if (isCustomActive && fileInputEl && fileInputEl.files && fileInputEl.files.length > 0) {
                    try {
                        const file = fileInputEl.files[0];
                        const configRes = await apiFetch('/api/config');
                        const config = await configRes.json();
                        const metaData = await uploadMediaToMetaFast(file, config);
                        media_id = metaData.id;
                    } catch (err) {
                        console.error('Error uploading media for template modal:', err);
                    }
                } else {
                    // Auto-attach from template metadata directly (No re-upload required!)
                    media_id = tmpl && tmpl.header_media ? tmpl.header_media.media_id : null;
                }
            }

            const sendRes = await apiFetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: activeInboxCustomer,
                    type: 'template',
                    template_name: templateName,
                    template_language: templateLang,
                    media_id: media_id,
                    media_type: media_type
                })
            });
            const result = await sendRes.json();
            if (result.error) {
                showModal('Template Send Error', result.error);
            } else {
                fetchChatMessages();
            }
        }, 'Send Template', 'btn primary');

        const msgEl = document.getElementById('modal-message');
        if (msgEl) {
            msgEl.innerHTML = modalHtml;
            const tSelect = document.getElementById('modal-template-select');
            const mediaSelectEl = document.getElementById('modal-media-select');
            const fileInputEl = document.getElementById('modal-media-file');
            const dropzoneText = document.getElementById('modal-dropzone-text');

            fileInputEl?.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (mediaSelectEl) mediaSelectEl.value = '';
                if (file && dropzoneText) {
                    dropzoneText.textContent = `Attached: ${file.name}`;
                }
            });

            const updateModalMediaVisibility = () => {
                const selName = tSelect ? tSelect.value : null;
                const tmpl = templates.find(t => t.name === selName);
                const headerComp = tmpl && tmpl.components ? tmpl.components.find(c => c.type === 'HEADER') : null;
                const mg = document.getElementById('modal-template-media-group');
                const autoMediaEl = document.getElementById('modal-template-auto-media');
                const customWrapEl = document.getElementById('modal-custom-media-wrapper');

                if (mg && headerComp && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                    mg.style.display = 'block';
                    const format = headerComp.format.toUpperCase();
                    const metaMedia = tmpl.header_media;
                    const hasMeta = metaMedia && (metaMedia.has_meta_media || metaMedia.media_id);
                    const isFallback = metaMedia && metaMedia.has_fallback_media;
                    const fallbackName = metaMedia && metaMedia.fallback_name;

                    if (autoMediaEl) {
                        const badgeText = isFallback ? 'Auto-Attached from Library' : 'Synced from Meta';
                        const subtitleText = isFallback
                            ? `Default ${fallbackName || 'library asset'} linked. No re-upload needed.`
                            : 'Meta approved header media is automatically linked. No re-upload needed.';

                        autoMediaEl.innerHTML = `
                            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 0.65rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 0.6rem;">
                                    <span style="font-size: 1.15rem;">${format === 'VIDEO' ? '🎥' : format === 'DOCUMENT' ? '📄' : '🖼️'}</span>
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                                            <span style="font-weight: 600; font-size: 0.84rem; color: var(--text-main);">Header ${format} Auto-Attached</span>
                                            <span style="background: #10b981; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 10px;">${badgeText}</span>
                                        </div>
                                        <div style="font-size: 0.73rem; color: var(--text-muted); margin-top: 0.15rem;">
                                            ${subtitleText}
                                        </div>
                                    </div>
                                </div>
                                <button type="button" class="btn secondary" id="btn-modal-toggle-custom" style="font-size: 0.72rem; padding: 0.25rem 0.5rem; white-space: nowrap;">
                                    Change
                                </button>
                            </div>
                        `;

                        document.getElementById('btn-modal-toggle-custom')?.addEventListener('click', () => {
                            if (customWrapEl) {
                                const isHidden = customWrapEl.style.display === 'none';
                                customWrapEl.style.display = isHidden ? 'block' : 'none';
                                const btn = document.getElementById('btn-modal-toggle-custom');
                                if (btn) btn.textContent = isHidden ? 'Reset' : 'Change';
                                if (!isHidden) {
                                    const mSelect = document.getElementById('modal-media-select');
                                    const mFile = document.getElementById('modal-media-file');
                                    if (mSelect) mSelect.value = '';
                                    if (mFile) mFile.value = '';
                                    const dzText = document.getElementById('modal-dropzone-text');
                                    if (dzText) dzText.textContent = 'Click to browse and upload media file';
                                }
                            }
                        });
                    }
                    if (customWrapEl) customWrapEl.style.display = 'none';
                } else if (mg) {
                    mg.style.display = 'none';
                }
            };

            tSelect?.addEventListener('change', updateModalMediaVisibility);
            updateModalMediaVisibility();
        }
    } catch (e) {
        showModal('Error', 'Failed to load templates: ' + e.message);
    }
});

// --- Media Logic ---
async function loadMedia() {
    const grid = document.getElementById('media-grid');
    if (grid) {
        grid.innerHTML = `<div style="grid-column: 1 / -1;"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading media library...</span></div></div>`;
    }
    try {
        const res = await apiFetch('/api/media');
        const mediaList = await res.json();
        if (!grid) return;

        if (mediaList.error) {
            grid.innerHTML = `<div class="empty-state">Error: ${mediaList.error}</div>`;
            return;
        }

        if (!Array.isArray(mediaList) || mediaList.length === 0) {
            grid.innerHTML = '<div class="empty-state">No media uploaded yet. Use "Upload New Media" above to add files.</div>';
            return;
        }

        grid.innerHTML = '';
        mediaList.forEach(m => {
            const isVideo = m.type === 'video' || (m.name && m.name.endsWith('.mp4'));
            const safeName = (m.name || 'Media').replace(/'/g, "\\'");

            let thumbnailHtml = '';
            if (m.file_url) {
                if (isVideo) {
                    thumbnailHtml = `
                        <div onclick="openMediaPreview('${m.file_url}', true, '${safeName}')" style="position:relative; width:100%; height:160px; background:#000; overflow:hidden; cursor:pointer;" title="Click to Preview">
                            <img src="${m.file_url}" alt="${m.name}" style="width:100%; height:160px; object-fit:cover; opacity:0.85; display:block;">
                            <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:44px; height:44px; border-radius:50%; background:rgba(16, 185, 129, 0.9); display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">▶</div>
                        </div>
                    `;
                } else {
                    thumbnailHtml = `
                        <div onclick="openMediaPreview('${m.file_url}', false, '${safeName}')" style="position:relative; width:100%; height:160px; background:var(--bg-dark); overflow:hidden; cursor:pointer;" title="Click to Preview">
                            <img src="${m.file_url}" alt="${m.name}" style="width:100%; height:160px; object-fit:cover; display:block;">
                        </div>
                    `;
                }
            } else {
                thumbnailHtml = `
                    <div style="width:100%; height:160px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08)); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1rem; text-align:center; border-bottom:1px solid var(--border);">
                        <div style="font-size:2rem; margin-bottom:0.35rem;">${isVideo ? '🎥' : '🖼️'}</div>
                        <span style="font-size:0.75rem; font-weight:600; color:var(--text-main); text-overflow:ellipsis; overflow:hidden; max-width:100%; white-space:nowrap;">${m.name}</span>
                        <span style="font-size:0.68rem; color:var(--primary); margin-top:0.2rem; font-weight:500;">Meta Cloud ID Active</span>
                    </div>
                `;
            }

            grid.innerHTML += `
                <div class="media-card" style="border-radius:14px; overflow:hidden; border:1px solid var(--border); background:var(--bg-card); transition:transform 0.2s, box-shadow 0.2s;">
                    ${thumbnailHtml}
                    <div class="overlay" style="position:absolute; top:8px; right:8px; z-index:5;">
                        <button class="btn danger sm" style="padding:0.3rem 0.6rem; font-size:0.75rem; border-radius:6px;" onclick="deleteMedia('${m.id}')">Delete</button>
                    </div>
                    <div class="name" style="padding:0.75rem 0.9rem; font-size:0.8rem; font-weight:600; color:var(--text-main); display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
                        <span style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${m.name}">${m.name}</span>
                        <span style="font-size:0.68rem; padding:0.15rem 0.45rem; border-radius:12px; background:rgba(16, 185, 129, 0.15); color:var(--primary); font-weight:700; text-transform:uppercase;">${isVideo ? 'VIDEO' : 'IMAGE'}</span>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error('Error loading media', e);
        document.getElementById('media-grid').innerHTML = '<div class="empty-state">Failed to load media library.</div>';
    }
}

window.deleteMedia = (id) => {
    showModal('Delete Media', 'Are you sure you want to delete this file from your Media Library?', 'confirm', async () => {
        try {
            await apiFetch(`/api/media?id=${id}`, { method: 'DELETE' });
            loadMedia();
            loadMediaForSelect();
        } catch (e) {
            showModal('Error', 'Failed to delete file.');
        }
    });
};

// Direct Upload from Media Library View
document.getElementById('media-library-upload-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const btn = document.getElementById('btn-upload-media-library');
    const originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Streaming...';
    }

    try {
        const configRes = await apiFetch('/api/config');
        const config = await configRes.json();

        // 1. Generate local Base64 image/video thumbnail
        let fileUrl = null;
        if (file.type && file.type.startsWith('image')) {
            fileUrl = await generateImageThumbnail(file);
        } else if ((file.type && file.type.startsWith('video')) || file.name.endsWith('.mp4')) {
            fileUrl = await generateVideoThumbnail(file);
        }

        // 2. Stream binary directly to Meta Cloud API fast with percentage indicator!
        const metaData = await uploadMediaToMetaFast(file, config, (percent) => {
            if (btn) btn.innerHTML = `<span class="spinner"></span> Uploading ${percent}%`;
        });

        // 3. Save media record with thumbnail URL into Neon Database
        const fileType = (file.type && file.type.startsWith('video')) || file.name.endsWith('.mp4') ? 'video' : 'image';
        await apiFetch('/api/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: file.name,
                type: fileType,
                meta_media_id: metaData.id,
                file_url: fileUrl,
                company_id: getCompanyId()
            })
        });

        showModal('Success', `Uploaded ${file.name} to Cloud Media storage successfully!`);
        loadMedia();
        loadMediaForSelect();
    } catch (err) {
        console.error('Media upload error:', err);
        showModal('Upload Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
        document.getElementById('media-library-upload-input').value = '';
    }
});

/* Security & Rate Limits Control Center (Superadmin) */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

window.allSecurityLogs = [];

async function loadSecurityLogs() {
    const tbody = document.getElementById('sec-logs-tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                    <span class="spinner"></span> Fetching security attempt logs...
                </td>
            </tr>
        `;
    }

    try {
        const res = await apiFetch('/api/auth?action=security-logs');
        const data = await res.json();
        if (data.success) {
            window.allSecurityLogs = data.attempts || [];

            const stats = data.stats || {};
            if (document.getElementById('sec-stat-total')) document.getElementById('sec-stat-total').textContent = stats.total_attempts || 0;
            if (document.getElementById('sec-stat-failed-15m')) document.getElementById('sec-stat-failed-15m').textContent = stats.active_failed_15m || 0;
            if (document.getElementById('sec-stat-success')) document.getElementById('sec-stat-success').textContent = stats.total_successful || 0;
            if (document.getElementById('sec-stat-locked-ips')) document.getElementById('sec-stat-locked-ips').textContent = stats.locked_ips || 0;

            filterSecurityLogs();
        } else {
            showModal('Error', data.error || 'Failed to fetch security logs.');
        }
    } catch (err) {
        console.error('Error loading security logs:', err);
        showModal('Error', err.message);
    }
}
window.loadSecurityLogs = loadSecurityLogs;

window.currentSecPage = 1;
window.secPageSize = 10;
window.totalSecPages = 1;
window.filteredSecurityLogs = [];

window.filterSecurityLogs = function filterSecurityLogs() {
    const searchVal = (document.getElementById('sec-search-input')?.value || '').trim().toLowerCase();
    const statusVal = document.getElementById('sec-status-filter')?.value || 'all';

    let filtered = window.allSecurityLogs || [];

    if (searchVal) {
        filtered = filtered.filter(item =>
            (item.ip_address && item.ip_address.toLowerCase().includes(searchVal)) ||
            (item.username && item.username.toLowerCase().includes(searchVal))
        );
    }

    if (statusVal === 'failed') {
        filtered = filtered.filter(item => !item.success);
    } else if (statusVal === 'success') {
        filtered = filtered.filter(item => item.success);
    }

    window.filteredSecurityLogs = filtered;
    window.currentSecPage = 1;
    renderSecurityLogsTable();
};

window.renderSecurityLogsTable = function renderSecurityLogsTable(logs = null) {
    const tbody = document.getElementById('sec-logs-tbody');
    const infoEl = document.getElementById('sec-pagination-info');
    const pageNumsEl = document.getElementById('sec-page-numbers');
    const btnFirst = document.getElementById('btn-sec-first-page');
    const btnPrev = document.getElementById('btn-sec-prev-page');
    const btnNext = document.getElementById('btn-sec-next-page');
    const btnLast = document.getElementById('btn-sec-last-page');

    if (!tbody) return;

    if (logs && Array.isArray(logs)) {
        window.filteredSecurityLogs = logs;
    }

    const dataList = window.filteredSecurityLogs || [];
    const totalItems = dataList.length;
    const pageSize = window.secPageSize || 10;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    window.totalSecPages = totalPages;

    if (window.currentSecPage > totalPages) window.currentSecPage = totalPages;
    if (window.currentSecPage < 1) window.currentSecPage = 1;

    const startIndex = (window.currentSecPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const pageData = dataList.slice(startIndex, endIndex);

    if (totalItems === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                    No security attempt logs found.
                </td>
            </tr>
        `;
        if (infoEl) infoEl.textContent = 'Showing 0 of 0';
        if (btnFirst) btnFirst.disabled = true;
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = true;
        if (btnLast) btnLast.disabled = true;
        if (pageNumsEl) pageNumsEl.innerHTML = '';
        return;
    }

    let html = '';
    pageData.forEach((log, idx) => {
        const serialNo = startIndex + idx + 1;
        let timeStr = 'N/A';
        if (log.attempt_time) {
            const parsed = new Date(String(log.attempt_time).replace(' ', 'T'));
            timeStr = !isNaN(parsed.getTime())
                ? parsed.toLocaleString('en-IN', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                : String(log.attempt_time);
        }
        const isSuccess = log.success === true || log.success === 'true';
        const statusBadge = isSuccess
            ? `<span style="padding:0.2rem 0.55rem; border-radius:12px; background:rgba(16,185,129,0.15); color:#10b981; font-size:0.75rem; font-weight:700;">🟢 Success</span>`
            : `<span style="padding:0.2rem 0.55rem; border-radius:12px; background:rgba(239,68,68,0.15); color:#ef4444; font-size:0.75rem; font-weight:700;">🔴 Failed / Locked</span>`;

        html += `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 0.75rem; font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">${serialNo}</td>
                <td style="padding: 0.75rem; font-weight: 700; font-family: monospace;">${escapeHtml(log.ip_address || 'Unknown')}</td>
                <td style="padding: 0.75rem; font-weight: 600;">${escapeHtml(log.username || 'N/A')}</td>
                <td style="padding: 0.75rem; font-size: 0.825rem; color: var(--text-muted);">${timeStr}</td>
                <td style="padding: 0.75rem;">${statusBadge}</td>
                <td style="padding: 0.75rem; text-align: right;">
                    <button class="btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-right: 0.35rem;" onclick="clearAllLockouts('${escapeHtml(log.ip_address)}')" title="Unlock IP address">
                        🔓 Unlock IP
                    </button>
                    <button class="btn danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: rgba(239,68,68,0.12); color: #ef4444;" onclick="deleteSecurityAttempt(${log.id})" title="Delete log record">
                        🗑️ Delete
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    if (infoEl) {
        infoEl.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalItems}`;
    }

    if (btnFirst) btnFirst.disabled = window.currentSecPage <= 1;
    if (btnPrev) btnPrev.disabled = window.currentSecPage <= 1;
    if (btnNext) btnNext.disabled = window.currentSecPage >= totalPages;
    if (btnLast) btnLast.disabled = window.currentSecPage >= totalPages;

    if (pageNumsEl) {
        let pagesHtml = '';
        const maxPagesToShow = 5;
        let startPage = Math.max(1, window.currentSecPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            const isActive = p === window.currentSecPage;
            pagesHtml += `
                <button type="button" class="btn ${isActive ? 'primary' : 'secondary'} sm"
                    style="min-width: 28px; padding: 0.25rem 0.55rem; font-size: 0.8rem; font-weight: ${isActive ? '700' : '500'};"
                    onclick="goToSecurityPage(${p})">
                    ${p}
                </button>
            `;
        }
        pageNumsEl.innerHTML = pagesHtml;
    }
};

window.goToSecurityPage = function goToSecurityPage(page) {
    const targetPage = Math.max(1, Math.min(page, window.totalSecPages || 1));
    window.currentSecPage = targetPage;
    renderSecurityLogsTable();
};

window.changeSecurityPageSize = function changeSecurityPageSize(size) {
    window.secPageSize = parseInt(size, 10) || 10;
    window.currentSecPage = 1;
    renderSecurityLogsTable();
};

window.clearAllLockouts = async function clearAllLockouts(target = null) {
    const msg = target ? `Are you sure you want to clear active lockouts & rate limits for "${target}"?` : `Are you sure you want to clear ALL active failed attempt lockouts across all IPs?`;
    showModal('Clear Rate Limit Lockouts', msg, 'confirm', async () => {
        try {
            const res = await apiFetch('/api/auth?action=clear-lockouts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target })
            });
            const data = await res.json();
            if (data.success) {
                showModal('Success', data.message || 'Lockouts cleared successfully!');
                loadSecurityLogs();
            } else {
                showModal('Error', data.error || 'Failed to clear lockouts.');
            }
        } catch (err) {
            showModal('Error', err.message);
        }
    });
};

window.promptTargetUnlock = function promptTargetUnlock() {
    const target = prompt("Enter IP Address or Username to unlock:");
    if (target && target.trim()) {
        clearAllLockouts(target.trim());
    }
};

window.promptManualLockout = function promptManualLockout() {
    const target = prompt("Enter IP Address or Username to manually lock out for 15 minutes:");
    if (target && target.trim()) {
        showModal('Manual Lockout', `Are you sure you want to lock out "${target.trim()}" for 15 minutes?`, 'confirm', async () => {
            try {
                const res = await apiFetch('/api/auth?action=manual-lock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target: target.trim() })
                });
                const data = await res.json();
                if (data.success) {
                    showModal('Success', data.message || 'Target locked out successfully.');
                    loadSecurityLogs();
                } else {
                    showModal('Error', data.error || 'Failed to apply manual lockout.');
                }
            } catch (err) {
                showModal('Error', err.message);
            }
        });
    }
};

window.deleteSecurityAttempt = async function deleteSecurityAttempt(id) {
    try {
        const res = await apiFetch('/api/auth?action=delete-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            loadSecurityLogs();
        } else {
            showModal('Error', data.error || 'Failed to delete record.');
        }
    } catch (err) {
        showModal('Error', err.message);
    }
};

window.purgeOldSecurityLogs = async function purgeOldSecurityLogs(days = 30) {
    showModal(
        'Database Optimization',
        `Are you sure you want to delete all security attempt logs older than ${days} days? This helps maintain high database performance and scalability.`,
        'confirm',
        async () => {
            try {
                const res = await apiFetch(`/api/auth?action=purge-old-logs&days=${days}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ days })
                });
                const data = await res.json();
                if (data.success) {
                    showModal('Maintenance Complete', data.message || `Successfully purged logs older than ${days} days.`);
                    loadSecurityLogs();
                } else {
                    showModal('Error', data.error || 'Failed to purge old logs.');
                }
            } catch (err) {
                console.error('Error purging old logs:', err);
                showModal('Error', err.message);
            }
        }
    );
};

/* ========================================================
   Subscriptions Checkout, Coupons & Management Handlers
   ======================================================== */
const RAZORPAY_CONVENIENCE_FEE_PCT = 2.36; // 2% Razorpay transaction fee + 18% GST on Gateway fee

function recalculateCheckoutSummary(basePrice, discountAmount = 0) {
    const numBase = parseFloat(basePrice) || 0;
    const numDisc = Math.min(numBase, parseFloat(discountAmount) || 0);
    const subtotal = Math.max(0, numBase - numDisc);
    const convenienceFee = Math.round(subtotal * (RAZORPAY_CONVENIENCE_FEE_PCT / 100) * 100) / 100;
    const finalAmount = Math.round((subtotal + convenienceFee) * 100) / 100;

    const elBase = document.getElementById('checkout-display-base-price');
    const elDiscRow = document.getElementById('checkout-row-discount');
    const elFee = document.getElementById('checkout-display-fee');
    const elFinal = document.getElementById('checkout-display-final-price');

    const inpDisc = document.getElementById('checkout-applied-discount-amount');
    const inpFee = document.getElementById('checkout-applied-convenience-fee');
    const inpFinal = document.getElementById('checkout-applied-final-amount');

    if (inpDisc) inpDisc.value = numDisc;
    if (inpFee) inpFee.value = convenienceFee;
    if (inpFinal) inpFinal.value = finalAmount;

    if (elBase) elBase.textContent = `₹${numBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (elFee) elFee.textContent = `+ ₹${convenienceFee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (elFinal) elFinal.textContent = `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (numDisc > 0) {
        if (elDiscRow) elDiscRow.style.display = 'flex';
    } else {
        if (elDiscRow) elDiscRow.style.display = 'none';
    }

    return { basePrice: numBase, discountAmount: numDisc, subtotal, convenienceFee, finalAmount };
}

window.openSubscribeModal = function openSubscribeModal(planId) {
    const modal = document.getElementById('checkout-modal');
    if (!modal) return;

    const plan = allSubscriptionPlans.find(p => p.id === planId) || allSubscriptionPlans[0];
    if (!plan) return;

    const cycleVal = currentBillingCycle || 'monthly';
    const checkoutSelect = document.getElementById('checkout-cycle-select');
    if (checkoutSelect) checkoutSelect.value = cycleVal;

    const basePrice = getPlanCyclePrice(plan, cycleVal);
    const cycleInfo = getCyclePeriodInfo(cycleVal);

    document.getElementById('checkout-plan-id').value = plan.id;
    document.getElementById('checkout-plan-name').value = `${plan.name} (${cycleInfo.label})`;
    document.getElementById('checkout-plan-price').value = basePrice;
    document.getElementById('checkout-applied-coupon-id').value = '';

    document.getElementById('checkout-display-plan').textContent = plan.name;
    const dispCycle = document.getElementById('checkout-display-cycle');
    if (dispCycle) dispCycle.textContent = cycleInfo.label;

    recalculateCheckoutSummary(basePrice, 0);

    const couponFeedback = document.getElementById('checkout-coupon-feedback');
    if (couponFeedback) {
        couponFeedback.style.display = 'none';
        couponFeedback.innerHTML = '';
    }
    const couponInput = document.getElementById('checkout-coupon-code');
    if (couponInput) couponInput.value = '';

    // Auto-prefill subscriber email & phone
    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }
    const coId = getCompanyId();
    const activeComp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;

    const emailInput = document.getElementById('checkout-email');
    const phoneInput = document.getElementById('checkout-phone');

    if (emailInput) emailInput.value = user.email || activeComp?.email || '';
    if (phoneInput) phoneInput.value = user.phone || activeComp?.phone || '';

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.onCheckoutCycleChange = function onCheckoutCycleChange(newCycle) {
    currentBillingCycle = newCycle || 'monthly';

    // Synchronize page-level selector
    const pageSelect = document.getElementById('sub-billing-cycle-select');
    if (pageSelect && pageSelect.value !== currentBillingCycle) {
        pageSelect.value = currentBillingCycle;
    }

    const planId = document.getElementById('checkout-plan-id')?.value;
    const plan = allSubscriptionPlans.find(p => p.id === planId) || allSubscriptionPlans[0];
    if (!plan) return;

    const basePrice = getPlanCyclePrice(plan, currentBillingCycle);
    const cycleInfo = getCyclePeriodInfo(currentBillingCycle);

    document.getElementById('checkout-plan-name').value = `${plan.name} (${cycleInfo.label})`;
    document.getElementById('checkout-plan-price').value = basePrice;

    const dispCycle = document.getElementById('checkout-display-cycle');
    if (dispCycle) dispCycle.textContent = cycleInfo.label;

    // If coupon is already present, recalculate coupon discount against the new base price
    const couponCode = document.getElementById('checkout-coupon-code')?.value?.trim();
    if (couponCode) {
        applyCheckoutCoupon(true);
    } else {
        recalculateCheckoutSummary(basePrice, 0);
    }

    renderPricingCards();
};

window.closeCheckoutModal = function closeCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

/* ========================================================
   Payment Overlay & Instant UI Feedback
   ======================================================== */
function showPaymentOverlay(title, desc, icon = '🔒') {
    const overlay = document.getElementById('payment-processing-overlay');
    const t = document.getElementById('pay-overlay-title');
    const d = document.getElementById('pay-overlay-desc');
    const i = document.getElementById('pay-overlay-icon');
    if (t) t.textContent = title;
    if (d) d.textContent = desc;
    if (i) i.textContent = icon;
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }
}
window.showPaymentOverlay = showPaymentOverlay;

function hidePaymentOverlay() {
    const overlay = document.getElementById('payment-processing-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
}
window.hidePaymentOverlay = hidePaymentOverlay;

window.resetCheckoutDiscount = function resetCheckoutDiscount() {
    const basePrice = parseFloat(document.getElementById('checkout-plan-price')?.value) || 0;
    const appliedCoupon = document.getElementById('checkout-applied-coupon-id');
    const feedback = document.getElementById('checkout-coupon-feedback');

    if (appliedCoupon) appliedCoupon.value = '';
    recalculateCheckoutSummary(basePrice, 0);

    if (feedback) {
        feedback.style.display = 'none';
        feedback.innerHTML = '';
    }
};

window.applyCheckoutCoupon = async function applyCheckoutCoupon(isAuto = false) {
    const codeInput = document.getElementById('checkout-coupon-code');
    const feedback = document.getElementById('checkout-coupon-feedback');
    const btn = document.getElementById('btn-apply-coupon');
    const basePrice = parseFloat(document.getElementById('checkout-plan-price')?.value) || 0;

    if (!codeInput || !codeInput.value.trim()) {
        resetCheckoutDiscount();
        if (!isAuto && feedback) {
            feedback.style.display = 'block';
            feedback.style.color = '#ef4444';
            feedback.textContent = 'Please enter a coupon code.';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;"></span>';
    }

    if (isAuto && feedback) {
        feedback.style.display = 'block';
        feedback.style.color = 'var(--text-muted)';
        feedback.innerHTML = '<span class="spinner-icon" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px;"></span> Validating coupon...';
    }

    try {
        const res = await apiFetch('/api/payments?action=validate-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coupon_code: codeInput.value.trim(),
                amount: basePrice
            })
        });
        const data = await res.json();

        if (data.success && data.valid) {
            document.getElementById('checkout-applied-coupon-id').value = data.coupon_id;
            recalculateCheckoutSummary(basePrice, data.discount_amount);

            // Update UI discount badge
            const rowDisc = document.getElementById('checkout-row-discount');
            const elDisc = document.getElementById('checkout-display-discount');

            if (rowDisc) rowDisc.style.display = 'flex';
            if (elDisc) elDisc.textContent = `- ₹${Number(data.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${data.discount_percent}% OFF)`;

            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.color = '#10b981';
                feedback.innerHTML = `🎉 Coupon <strong>${data.coupon_code}</strong> applied! You saved ₹${Number(data.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`;
            }
        } else {
            resetCheckoutDiscount();
            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.color = '#ef4444';
                feedback.textContent = `⚠️ ${data.error || 'Invalid or expired coupon.'}`;
            }
        }
    } catch (err) {
        if (feedback) {
            feedback.style.display = 'block';
            feedback.style.color = '#ef4444';
            feedback.textContent = `⚠️ Error checking coupon: ${err.message}`;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Apply';
        }
    }
};

// Automatic coupon check on typing (debounced)
let couponAutoTimer = null;
document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'checkout-coupon-code') {
        clearTimeout(couponAutoTimer);
        const val = e.target.value.trim();
        if (!val) {
            resetCheckoutDiscount();
            return;
        }
        couponAutoTimer = setTimeout(() => {
            applyCheckoutCoupon(true);
        }, 400);
    }
});

document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'checkout-coupon-code') {
        clearTimeout(couponAutoTimer);
        if (e.target.value.trim()) {
            applyCheckoutCoupon(true);
        } else {
            resetCheckoutDiscount();
        }
    }
});

window.proceedToRazorpayPayment = async function proceedToRazorpayPayment(e) {
    if (e) e.preventDefault();

    const planName = document.getElementById('checkout-plan-name').value;
    const basePrice = parseFloat(document.getElementById('checkout-plan-price').value) || 0;
    const couponCode = document.getElementById('checkout-coupon-code')?.value?.trim() || '';
    const couponId = document.getElementById('checkout-applied-coupon-id').value;
    const discountAmount = parseFloat(document.getElementById('checkout-applied-discount-amount').value) || 0;
    const finalAmount = parseFloat(document.getElementById('checkout-applied-final-amount').value) || (basePrice - discountAmount);
    const email = document.getElementById('checkout-email').value.trim();
    const phone = document.getElementById('checkout-phone').value.trim();
    const companyId = getCompanyId();

    if (!email || !phone) {
        showModal('Required Details', 'Please fill in both email and phone number to continue.');
        return;
    }

    const btn = document.getElementById('btn-proceed-payment');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Initializing Secure Checkout...';
    }

    // Launch fullscreen loading overlay immediately
    showPaymentOverlay('Initializing Secure Checkout', 'Connecting to Razorpay gateway...', '🔒');

    try {
        // Step 1: Create Order on backend
        const orderRes = await apiFetch('/api/payments?action=create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan_name: planName,
                billing_cycle: currentBillingCycle,
                original_amount: basePrice,
                coupon_code: couponCode,
                email,
                phone,
                company_id: companyId
            })
        });

        const orderData = await orderRes.json();
        if (!orderData.success) {
            hidePaymentOverlay();
            throw new Error(orderData.error || 'Failed to initialize payment order');
        }

        // Step 2: Launch Razorpay Checkout Modal
        if (orderData.is_live && window.Razorpay) {
            const options = {
                key: orderData.key_id,
                amount: Math.round(orderData.amount * 100),
                currency: 'INR',
                name: 'Inspenox Business Suite',
                description: `Subscription: ${planName}`,
                image: '/favicon.png',
                order_id: orderData.order_id,
                prefill: {
                    name: email.split('@')[0],
                    email: email,
                    contact: phone
                },
                theme: {
                    color: '#00a884'
                },
                handler: async function (response) {
                    // Show verification animation overlay immediately
                    showPaymentOverlay('Verifying Payment Signature', 'Confirming payment with Razorpay & activating your subscription tier...', '⚡');
                    try {
                        const verifyRes = await apiFetch('/api/payments?action=verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                                plan_name: planName,
                                billing_cycle: currentBillingCycle,
                                original_amount: orderData.original_amount,
                                discount_amount: orderData.discount_amount,
                                convenience_fee: orderData.convenience_fee,
                                final_amount: orderData.amount,
                                coupon_code: orderData.coupon_code,
                                coupon_id: orderData.coupon_id,
                                influencer_id: orderData.influencer_id,
                                commission_amount: orderData.commission_amount,
                                user_email: email,
                                user_phone: phone,
                                company_id: companyId
                            })
                        });

                        const verifyData = await verifyRes.json();
                        hidePaymentOverlay();

                        if (verifyData.success) {
                            closeCheckoutModal();

                            // 1. Instantly update active company plan and stored validity in memory
                            activeCompanyPlanName = planName;
                            const coId = getCompanyId();
                            if (Array.isArray(allCompanies)) {
                                const comp = allCompanies.find(c => String(c.id) === String(coId)) || allCompanies[0];
                                if (comp) {
                                    comp.subscription_plan = planName;
                                    comp.subscription_status = 'active';
                                    comp.subscription_expires_at = verifyData.subscription_expires_at;
                                    comp.subscription_billing_cycle = verifyData.subscription_billing_cycle || currentBillingCycle;
                                    comp.is_expired = false;
                                }
                            }

                            // 2. Refresh UI immediately without hard refresh
                            updateCompanySubscriptionStatusUI();
                            renderPricingCards();

                            // 3. Asynchronously sync latest company state from API
                            loadCompanies().then(() => {
                                updateCompanySubscriptionStatusUI();
                                renderPricingCards();
                                if (typeof loadCompanyReceipts === 'function') {
                                    loadCompanyReceipts();
                                }
                            });

                            const expDateStr = verifyData.subscription_expires_at 
                                ? new Date(verifyData.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) 
                                : '';
                            const validityNotice = expDateStr ? `<br><br>📅 <strong>Valid Until:</strong> ${expDateStr}` : '';
                            const targetNoticeEmail = email || verifyData.payment?.user_email || 'your email';
                            const emailNotice = verifyData.email_sent 
                                ? `<br>📧 An official payment receipt and plan confirmation has been sent to <strong>${targetNoticeEmail}</strong>.` 
                                : (verifyData.email_error ? `<br><small style="color:var(--text-muted);">📧 Email status: ${verifyData.email_error}</small>` : '');

                            showModal(
                                'Payment Successful! 🎉', 
                                `Thank you! Your payment of ₹${orderData.amount.toLocaleString('en-IN')} for <strong>${planName}</strong> has been verified and active features unlocked!${validityNotice}${emailNotice}`
                            );
                        } else {
                            showModal('Verification Failed', verifyData.error || 'Unable to verify payment signature.');
                        }
                    } catch (err) {
                        hidePaymentOverlay();
                        showModal('Error', err.message);
                    }
                },
                modal: {
                    ondismiss: function () {
                        hidePaymentOverlay();
                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = '<span>Proceed to Pay</span> 💳';
                        }
                    }
                }
            };

            // Hide processing overlay right as Razorpay opens
            hidePaymentOverlay();
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (failResp) {
                hidePaymentOverlay();
                showModal('Payment Failed', failResp.error?.description || 'Payment was declined or cancelled.');
            });
            rzp.open();
        } else {
            // Simulated / Mock Sandbox Flow for Testing
            hidePaymentOverlay();
            showModal(
                'Sandbox Payment Mode 🧪',
                `Razorpay live keys are currently running in test sandbox mode.<br><br><strong>Order ID:</strong> <code>${orderData.order_id}</code><br><strong>Plan:</strong> ${planName}<br><strong>Amount:</strong> ₹${orderData.amount.toLocaleString('en-IN')}<br><br>Simulate successful payment confirmation now?`,
                'confirm',
                async () => {
                    showPaymentOverlay('Activating Sandbox Subscription', 'Verifying simulated payment signature...', '⚡');
                    const mockPaymentId = `pay_sim_${Date.now()}`;
                    const verifyRes = await apiFetch('/api/payments?action=verify-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_payment_id: mockPaymentId,
                            razorpay_order_id: orderData.order_id,
                            razorpay_signature: 'mock_signature_verified',
                            plan_name: planName,
                            billing_cycle: currentBillingCycle,
                            original_amount: orderData.original_amount,
                            discount_amount: orderData.discount_amount,
                            convenience_fee: orderData.convenience_fee,
                            final_amount: orderData.amount,
                            coupon_code: orderData.coupon_code,
                            coupon_id: orderData.coupon_id,
                            influencer_id: orderData.influencer_id,
                            commission_amount: orderData.commission_amount,
                            user_email: email,
                            user_phone: phone,
                            company_id: companyId
                        })
                    });

                    const verifyData = await verifyRes.json();
                    hidePaymentOverlay();

                    if (verifyData.success) {
                        closeCheckoutModal();

                        // Update in-memory state
                        activeCompanyPlanName = planName;
                        const coId = getCompanyId();
                        if (Array.isArray(allCompanies)) {
                            const comp = allCompanies.find(c => String(c.id) === String(coId)) || allCompanies[0];
                            if (comp) {
                                comp.subscription_plan = planName;
                                comp.subscription_status = 'active';
                                comp.subscription_expires_at = verifyData.subscription_expires_at;
                                comp.subscription_billing_cycle = verifyData.subscription_billing_cycle || currentBillingCycle;
                                comp.is_expired = false;
                            }
                        }
                        updateCompanySubscriptionStatusUI();
                        renderPricingCards();

                        loadCompanies().then(() => {
                            updateCompanySubscriptionStatusUI();
                            renderPricingCards();
                            if (typeof loadCompanyReceipts === 'function') {
                                loadCompanyReceipts();
                            }
                        });

                        const expDateStr = verifyData.subscription_expires_at 
                            ? new Date(verifyData.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) 
                            : '';
                        const validityNotice = expDateStr ? `<br><br>📅 <strong>Valid Until:</strong> ${expDateStr}` : '';
                        const targetNoticeEmail = email || verifyData.payment?.user_email || 'your email';
                        const emailNotice = verifyData.email_sent 
                            ? `<br>📧 An official payment receipt and plan confirmation has been sent to <strong>${targetNoticeEmail}</strong>.` 
                            : (verifyData.email_error ? `<br><small style="color:var(--text-muted);">📧 Email status: ${verifyData.email_error}</small>` : '');

                        showModal('Subscription Activated! 🎉', `Payment verified successfully! Subscription activated for <strong>${planName}</strong>.${validityNotice}${emailNotice}`);
                    } else {
                        showModal('Error', verifyData.error || 'Verification failed.');
                    }
                }
            );
        }
    } catch (err) {
        hidePaymentOverlay();
        showModal('Payment Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Proceed to Pay</span> 💳';
        }
    }
};

window.loadCouponsList = async function loadCouponsList() {
    const tbody = document.getElementById('coupons-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Loading promotional coupons...</td></tr>';

    try {
        const res = await apiFetch('/api/payments?action=coupons');
        const data = await res.json();

        if (data.success && Array.isArray(data.coupons)) {
            allCouponsList = data.coupons;

            if (allCouponsList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No coupons created yet. Click "+ Create New Coupon" to generate discount codes.</td></tr>';
                return;
            }

            tbody.innerHTML = allCouponsList.map((c, idx) => {
                const used = c.used_count || 0;
                const limit = c.usage_limit ? c.usage_limit : '∞';
                const usagePercent = c.usage_limit ? Math.min(100, Math.round((used / c.usage_limit) * 100)) : 0;
                const isExpired = c.expiry_date && new Date(c.expiry_date) < new Date();
                const influencer = c.influencer_username ? `<strong>@${c.influencer_username}</strong>` : '<span style="color:var(--text-muted);">Company Global</span>';

                let statusBadge = '';
                if (!c.is_active) {
                    statusBadge = '<span class="window-badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Inactive</span>';
                } else if (isExpired) {
                    statusBadge = '<span class="window-badge" style="background:rgba(234,179,8,0.15); color:#eab308;">Expired</span>';
                } else {
                    statusBadge = '<span class="window-badge" style="background:rgba(16,185,129,0.15); color:#10b981;">Active ✅</span>';
                }

                return `
                    <tr>
                        <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                        <td>
                            <div class="coupon-code-pill" title="Click to copy" onclick="navigator.clipboard.writeText('${c.coupon_code}'); showModal('Copied', 'Coupon code copied to clipboard!')">
                                <span>${c.coupon_code}</span> 📋
                            </div>
                        </td>
                        <td><strong style="color:var(--primary); font-size:0.95rem;">${c.discount_percent}% OFF</strong></td>
                        <td><span style="color:#eab308; font-weight:600;">${c.commission_percent || 0}% Cut</span></td>
                        <td>
                            <div style="font-size:0.8rem;">${used} / ${limit} used</div>
                            ${c.usage_limit ? `<div style="width:70px; height:4px; background:var(--bg-dark); border-radius:2px; margin-top:4px; overflow:hidden;"><div style="width:${usagePercent}%; height:100%; background:var(--primary);"></div></div>` : ''}
                        </td>
                        <td>${influencer}</td>
                        <td><span style="font-size:0.8rem; color:var(--text-muted);">${c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : 'No Expiry'}</span></td>
                        <td>${statusBadge}</td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn secondary sm" onclick="toggleCouponStatus(${c.id}, ${c.is_active})">
                                ${c.is_active ? 'Pause' : 'Activate'}
                            </button>
                            <button class="btn danger sm" onclick="deleteCoupon(${c.id}, '${c.coupon_code}')">
                                Delete
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Failed to load coupons.</td></tr>';
    }
};

window.openCreateCouponModal = function openCreateCouponModal() {
    const modal = document.getElementById('create-coupon-modal');
    if (!modal) return;

    document.getElementById('create-coupon-form')?.reset();

    // Populate user/influencer select
    const selectUser = document.getElementById('coupon-user-select');
    if (selectUser) {
        selectUser.innerHTML = '<option value="">None (General Company Coupon)</option>';
        if (Array.isArray(allUsersList) && allUsersList.length > 0) {
            allUsersList.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${u.username} (${u.role || 'user'})${u.email ? ' - ' + u.email : ''}`;
                selectUser.appendChild(opt);
            });
        }
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeCreateCouponModal = function closeCreateCouponModal() {
    const modal = document.getElementById('create-coupon-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.saveNewCoupon = async function saveNewCoupon(e) {
    if (e) e.preventDefault();

    const code = document.getElementById('coupon-code-input').value.trim();
    const discount = document.getElementById('coupon-discount-input').value;
    const commission = document.getElementById('coupon-commission-input').value || 0;
    const userId = document.getElementById('coupon-user-select').value;
    const limit = document.getElementById('coupon-limit-input').value;
    const expiry = document.getElementById('coupon-expiry-input').value;

    const btn = document.getElementById('btn-save-coupon');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Creating...';
    }

    try {
        const res = await apiFetch('/api/payments?action=create-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coupon_code: code,
                discount_percent: discount,
                commission_percent: commission,
                user_id: userId,
                usage_limit: limit,
                expiry_date: expiry || null
            })
        });

        const data = await res.json();
        if (data.success) {
            closeCreateCouponModal();
            showModal('Coupon Created', `Promotional code "${code}" created successfully!`);
            loadCouponsList();
        } else {
            showModal('Error', data.error || 'Failed to create coupon.');
        }
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Create Coupon';
        }
    }
};

window.toggleCouponStatus = async function toggleCouponStatus(id, currentActive) {
    try {
        const res = await apiFetch('/api/payments?action=toggle-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_active: !currentActive })
        });
        const data = await res.json();
        if (data.success) {
            loadCouponsList();
        } else {
            showModal('Error', data.error || 'Failed to update coupon status.');
        }
    } catch (err) {
        showModal('Error', err.message);
    }
};

window.deleteCoupon = function deleteCoupon(id, code) {
    showModal('Delete Coupon', `Are you sure you want to permanently delete coupon "${code}"?`, 'confirm', async () => {
        try {
            const res = await apiFetch(`/api/payments?action=delete-coupon&id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadCouponsList();
            } else {
                showModal('Error', data.error || 'Failed to delete coupon.');
            }
        } catch (err) {
            showModal('Error', err.message);
        }
    });
};

window.loadPaymentLogs = async function loadPaymentLogs() {
    const tbody = document.getElementById('payment-logs-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><span class="spinner"></span> Loading payment logs...</td></tr>';

    try {
        const res = await apiFetch('/api/payments?action=logs');
        const data = await res.json();

        if (data.success && Array.isArray(data.logs)) {
            allPaymentLogsList = data.logs;

            if (allPaymentLogsList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No payment transactions recorded yet. Payments processed via Razorpay will be logged here.</td></tr>';
                return;
            }

            renderPaymentLogs(allPaymentLogsList);
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Failed to load payment transactions.</td></tr>';
    }
};

function renderPaymentLogs(logs) {
    const tbody = document.getElementById('payment-logs-table-body');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No matching payment transactions found.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map((p, idx) => {
        const orderIdShort = p.order_id ? `<code>${p.order_id}</code>` : '-';
        const payIdShort = p.payment_id ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;"><code>${p.payment_id}</code></div>` : '';
        const userContact = `
            <div style="font-size:0.8rem; line-height:1.35;">
                <div style="color:var(--text-main); font-weight:500;">${p.user_email || 'No email'}</div>
                ${p.user_phone ? `<div style="color:var(--text-muted); font-size:0.75rem;">${formatDisplayPhone(p.user_phone)}</div>` : ''}
            </div>
        `;
        const couponInfo = p.coupon_code ? `
            <div>
                <span class="coupon-code-pill" style="font-size:0.75rem;">${p.coupon_code}</span>
                ${p.commission_amount > 0 ? `<div style="font-size:0.725rem; color:#eab308; margin-top:2px;">Cut: ₹${Number(p.commission_amount).toFixed(2)}</div>` : ''}
            </div>
        ` : '<span style="color:var(--text-muted); font-size:0.75rem;">None</span>';

        return `
            <tr>
                <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                <td>${orderIdShort}${payIdShort}</td>
                <td>${userContact}</td>
                <td><strong style="color:var(--primary); font-size:0.85rem;">${p.plan_name || 'Standard'}</strong></td>
                <td><span style="font-size:0.85rem; color:var(--text-muted);">₹${Number(p.original_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></td>
                <td><span style="font-size:0.85rem; color:${p.discount_amount > 0 ? '#10b981' : 'var(--text-muted)'};">- ₹${Number(p.discount_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></td>
                <td><strong style="color:var(--text-main); font-size:0.95rem;">₹${Number(p.final_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                <td>${couponInfo}</td>
                <td><span class="window-badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700; text-transform:uppercase;">${p.status || 'paid'}</span></td>
                <td><span style="font-size:0.75rem; color:var(--text-muted);">${p.created_at_formatted || formatTime(p.created_at)}</span></td>
            </tr>
        `;
    }).join('');
}

window.filterPaymentLogs = function filterPaymentLogs() {
    const q = (document.getElementById('search-payment-logs')?.value || '').toLowerCase().trim();
    if (!q) {
        renderPaymentLogs(allPaymentLogsList);
        return;
    }
    const filtered = allPaymentLogsList.filter(p => {
        return (p.order_id && p.order_id.toLowerCase().includes(q)) ||
            (p.payment_id && p.payment_id.toLowerCase().includes(q)) ||
            (p.user_email && p.user_email.toLowerCase().includes(q)) ||
            (p.user_phone && p.user_phone.toLowerCase().includes(q)) ||
            (p.plan_name && p.plan_name.toLowerCase().includes(q)) ||
            (p.coupon_code && p.coupon_code.toLowerCase().includes(q));
    });
    renderPaymentLogs(filtered);
};

/* ========================================================
   Company Workspace Payment Receipts & Official Invoices
   ======================================================== */
let allCompanyReceiptsList = [];

window.loadCompanyReceipts = async function loadCompanyReceipts() {
    const tbody = document.getElementById('company-receipts-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner-icon" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Loading payment receipts...</td></tr>';

    const coId = getCompanyId();
    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }
    const email = user.email || '';

    try {
        const url = `/api/payments?action=receipts&company_id=${coId || ''}&email=${encodeURIComponent(email)}`;
        const res = await apiFetch(url);
        const data = await res.json();

        if (data.success && Array.isArray(data.logs)) {
            allCompanyReceiptsList = data.logs;

            if (allCompanyReceiptsList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No payment receipts found for this workspace yet. When you subscribe or renew a package, official tax receipts will appear here.</td></tr>';
                return;
            }

            tbody.innerHTML = allCompanyReceiptsList.map((r, idx) => {
                const formattedDate = r.created_at_formatted || (r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '-');
                const formattedValidUntil = r.valid_until_formatted || (r.valid_until ? new Date(r.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
                const orderIdShort = r.order_id ? `<code>${r.order_id}</code>` : '-';
                const paymentIdShort = r.payment_id ? `<code>${r.payment_id}</code>` : '-';
                const finalAmt = Number(r.final_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                const plan = r.plan_name || 'Standard Plan';
                const statusBadge = '<span class="window-badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700;">PAID ✅</span>';

                return `
                    <tr>
                        <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                        <td><span style="font-size:0.825rem; color:var(--text-main); font-weight:500;">${formattedDate}</span></td>
                        <td>${orderIdShort}</td>
                        <td><span style="font-size:0.8rem; color:var(--text-muted);">${paymentIdShort}</span></td>
                        <td><strong style="color:var(--primary); font-size:0.9rem;">${plan}</strong></td>
                        <td><span style="font-size:0.85rem; color:#10b981; font-weight:600;">${formattedValidUntil}</span></td>
                        <td><strong style="color:var(--text-main); font-size:0.95rem;">₹${finalAmt}</strong></td>
                        <td>${statusBadge}</td>
                        <td style="text-align:right;">
                            <button type="button" class="btn secondary sm" onclick="viewCompanyReceipt(${r.id})" style="display:inline-flex; align-items:center; gap:5px; padding:0.35rem 0.75rem; font-size:0.775rem;">
                                📜 <span>View Invoice</span>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No payment receipts available.</td></tr>';
        }
    } catch (err) {
        console.error('Error loading receipts:', err);
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Failed to load payment receipts.</td></tr>';
    }
};

window.viewCompanyReceipt = function viewCompanyReceipt(receiptId) {
    window.currentViewingReceiptId = receiptId;
    const receipt = allCompanyReceiptsList.find(r => String(r.id) === String(receiptId)) ||
        allPaymentLogsList.find(r => String(r.id) === String(receiptId));
    if (!receipt) {
        showModal('Receipt Not Found', 'Could not locate the requested transaction receipt.');
        return;
    }

    const coId = getCompanyId();
    const comp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;
    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }

    const custName = comp?.name || user.company_name || user.username || 'Authorized Subscriber';
    const custEmail = receipt.user_email || user.email || comp?.email || '-';
    const custPhone = receipt.user_phone ? formatDisplayPhone(receipt.user_phone) : (user.phone || comp?.phone || '-');
    const formattedDate = receipt.created_at_formatted || (receipt.created_at ? new Date(receipt.created_at).toLocaleString('en-IN') : '-');

    const origAmount = Number(receipt.original_amount || receipt.final_amount || 0);
    const discAmount = Number(receipt.discount_amount || 0);
    const finalAmount = Number(receipt.final_amount || 0);

    let cycleDisplay = 'Monthly';
    const rCycle = String(receipt.billing_cycle || (receipt.plan_name || '')).toLowerCase();
    if (rCycle.includes('annual') || rCycle.includes('year') || rCycle.includes('12_month')) cycleDisplay = 'Annual (20% Off)';
    else if (rCycle.includes('4_month') || rCycle.includes('4month')) cycleDisplay = '4 Months (10% Off)';
    else if (rCycle.includes('6_month') || rCycle.includes('6month')) cycleDisplay = '6 Months (15% Off)';

    const elDate = document.getElementById('rcpt-date-display');
    const elName = document.getElementById('rcpt-customer-name');
    const elEmail = document.getElementById('rcpt-customer-email');
    const elPhone = document.getElementById('rcpt-customer-phone');
    const elOrder = document.getElementById('rcpt-order-id');
    const elPay = document.getElementById('rcpt-payment-id');
    const elPlan = document.getElementById('rcpt-plan-name');
    const elCycle = document.getElementById('rcpt-plan-cycle');
    const elValidUntil = document.getElementById('rcpt-valid-until');
    const elBase = document.getElementById('rcpt-base-amount');
    const elSub = document.getElementById('rcpt-subtotal');
    const rowDisc = document.getElementById('rcpt-row-discount');
    const elDisc = document.getElementById('rcpt-discount');
    const elTotal = document.getElementById('rcpt-total');

    if (elDate) elDate.textContent = `Date: ${formattedDate}`;
    if (elName) elName.textContent = custName;
    if (elEmail) elEmail.textContent = custEmail;
    if (elPhone) elPhone.textContent = custPhone;

    if (elOrder) elOrder.textContent = receipt.order_id || '-';
    if (elPay) elPay.textContent = receipt.payment_id || '-';

    if (elPlan) elPlan.textContent = receipt.plan_name || 'Standard Plan';
    if (elCycle) elCycle.textContent = cycleDisplay;

    if (elValidUntil) {
        const validUntilDate = receipt.valid_until_formatted || (receipt.valid_until ? new Date(receipt.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
        elValidUntil.textContent = validUntilDate;
    }

    if (elBase) elBase.textContent = `₹${origAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (elSub) elSub.textContent = `₹${origAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (discAmount > 0) {
        if (rowDisc) rowDisc.style.display = 'flex';
        if (elDisc) elDisc.textContent = `- ₹${discAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}${receipt.coupon_code ? ` (${receipt.coupon_code})` : ''}`;
    } else {
        if (rowDisc) rowDisc.style.display = 'none';
    }

    const feeAmount = Number(receipt.convenience_fee || 0);
    const rowFee = document.getElementById('rcpt-row-fee');
    const elFee = document.getElementById('rcpt-fee');
    if (rowFee && elFee) {
        if (feeAmount > 0) {
            rowFee.style.display = 'flex';
            elFee.textContent = `+ ₹${feeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        } else {
            rowFee.style.display = 'none';
        }
    }

    if (elTotal) elTotal.textContent = `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const modal = document.getElementById('company-receipt-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeCompanyReceiptModal = function closeCompanyReceiptModal() {
    const modal = document.getElementById('company-receipt-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.printCompanyReceipt = function printCompanyReceipt() {
    window.print();
};

window.resendCurrentReceiptEmail = async function resendCurrentReceiptEmail() {
    if (!window.currentViewingReceiptId) {
        showModal('No Receipt Selected', 'Please open a receipt before requesting an email resend.');
        return;
    }

    const btn = document.getElementById('btn-rcpt-resend-email');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Sending Email...';
    }

    try {
        const res = await apiFetch('/api/payments?action=resend-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: window.currentViewingReceiptId })
        });
        const data = await res.json();
        if (data.success) {
            showModal('Email Sent 🎉', data.message || 'Payment receipt email has been sent successfully!');
        } else {
            showModal('Email Send Error', data.error || 'Could not send receipt email.');
        }
    } catch (err) {
        console.error('Error resending receipt email:', err);
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
};

// Ensure active view is synchronized upon full script execution
(function syncBootView() {
    const curView = localStorage.getItem('activeView') || window.location.hash.replace('#', '') || 'dashboard';
    if (curView === 'subscriptions' && typeof loadSubscriptions === 'function') {
        loadSubscriptions();
    }
})();

// Global Escape Key Listener for Flexible Modal Dismissal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        const rcptModal = document.getElementById('company-receipt-modal');
        if (rcptModal && !rcptModal.classList.contains('hidden') && rcptModal.style.display !== 'none') {
            closeCompanyReceiptModal();
            return;
        }
        const checkoutModal = document.getElementById('checkout-modal');
        if (checkoutModal && !checkoutModal.classList.contains('hidden') && checkoutModal.style.display !== 'none') {
            closeCheckoutModal();
            return;
        }
    }
});