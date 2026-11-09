/**
 * ==========================================================================
 * CORECONTROLLER.JS - Core Application Controller (Helpers, Globals, UI Modals, Navigation & Routing)
 * ==========================================================================
 * Provides foundational utility functions, customer maturation helpers, shared global state, global modal dialogs (alert/confirm), theme toggle, sidebar navigation accordion, and single-page application (SPA) routing (switchView).
 * 
 * Module Components:
 *  - Lines 1 to 316 in original app.js (Core Utility Functions, Empty State Generator, Maturation Helpers, Thumbnails & Audio)
 *  - Lines 2508 to 2848 in original app.js (Shared Globals, Global Modal System (showModal/closeModal), Theme & Navigation UI Logic)
 *  - Lines 3370 to 3539 in original app.js (SPA View Switcher (switchView), Global Navigation Delegation, Popstate/Hashchange & App Initialization)
 * ==========================================================================
 */

// --- Helper Functions ---
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
}

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

// --- Table Empty State Generator (100% Responsive & Cross-Viewport Table Dimensions) ---
function renderTableEmptyStateHtml(colspan, title = 'No records found', subtitle = '', icon = '🔍') {
    return `<tr>
        <td colspan="${colspan}" class="empty-state">
            <div class="empty-state-content">
                <div class="empty-state-icon">${icon}</div>
                <div class="empty-state-title">${escapeHtml(title)}</div>
                ${subtitle ? `<div class="empty-state-desc">${escapeHtml(subtitle)}</div>` : ''}
            </div>
        </td>
    </tr>`;
}
if (typeof window !== 'undefined') {
    window.renderTableEmptyStateHtml = renderTableEmptyStateHtml;
}

// --- Customer Maturation / Quarantine Cooldown Helper (Meta 6-Hour Contact Delivery Maturation) ---
function getCustomerMaturationInfo(cust) {
    if (!cust || !cust.created_at) return { isMaturing: false, remainingHours: 0, remainingMinutes: 0, timeText: '' };
    const createdTime = new Date(cust.created_at).getTime();
    if (isNaN(createdTime) || createdTime <= 0) return { isMaturing: false, remainingHours: 0, remainingMinutes: 0, timeText: '' };

    const sixHoursMs = 6 * 60 * 60 * 1000;
    const ageMs = Date.now() - createdTime;
    if (ageMs < sixHoursMs) {
        const remainingMs = Math.max(0, sixHoursMs - ageMs);
        const totalMinutes = Math.ceil(remainingMs / (1000 * 60));
        const remainingHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        const timeText = remainingHours > 0 
            ? (remainingMinutes > 0 ? `${remainingHours}h ${remainingMinutes}m` : `${remainingHours}h`)
            : `${remainingMinutes}m`;
        return { isMaturing: true, remainingHours, remainingMinutes, timeText };
    }
    return { isMaturing: false, remainingHours: 0, remainingMinutes: 0, timeText: '' };
}

// 🛡️ Quarantine Info Tooltip & Modal Logic
let quarantineTooltipTimeout = null;
let isQuarantineModalPinned = false;

function showQuarantineTooltip(event, timeText) {
    if (isQuarantineModalPinned) return;
    clearTimeout(quarantineTooltipTimeout);

    // On narrow touch screens (<=600px), avoid hover tooltips jumping on touch
    if (typeof window !== 'undefined' && window.innerWidth <= 600) return;

    const popover = document.getElementById('quarantine-info-popover');
    const timerEl = document.getElementById('quarantine-popover-timer-text');
    if (!popover) return;

    if (timerEl) {
        timerEl.textContent = timeText ? `Cooldown Remaining: ${timeText}` : '6-Hour Cooldown in progress';
    }

    const trigger = event.currentTarget || event.target;
    const rect = trigger.getBoundingClientRect();

    popover.classList.remove('mobile-modal');
    popover.style.display = 'block';

    const popoverRect = popover.getBoundingClientRect();
    const padding = 12;

    let left = rect.left + (rect.width / 2) - (popoverRect.width / 2);
    if (left < padding) left = padding;
    if (left + popoverRect.width > window.innerWidth - padding) {
        left = window.innerWidth - popoverRect.width - padding;
    }

    let top = rect.top - popoverRect.height - 10;
    if (top < padding) {
        top = rect.bottom + 10;
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
}

function hideQuarantineTooltip() {
    if (isQuarantineModalPinned) return;
    clearTimeout(quarantineTooltipTimeout);
    quarantineTooltipTimeout = setTimeout(() => {
        const popover = document.getElementById('quarantine-info-popover');
        if (popover && !isQuarantineModalPinned) {
            popover.style.display = 'none';
        }
    }, 120);
}

function openQuarantineInfoModal(event, timeText) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    clearTimeout(quarantineTooltipTimeout);
    isQuarantineModalPinned = true;

    const popover = document.getElementById('quarantine-info-popover');
    const backdrop = document.getElementById('quarantine-popover-backdrop');
    const timerEl = document.getElementById('quarantine-popover-timer-text');
    if (!popover) return;

    if (timerEl) {
        timerEl.textContent = timeText ? `Cooldown Remaining: ${timeText}` : '6-Hour Cooldown in progress';
    }

    if (typeof window !== 'undefined' && window.innerWidth <= 600) {
        popover.classList.add('mobile-modal');
        popover.style.display = 'block';
        popover.style.left = '50%';
        popover.style.top = '50%';
        if (backdrop) backdrop.style.display = 'block';
    } else {
        popover.classList.remove('mobile-modal');
        if (backdrop) backdrop.style.display = 'none';
        popover.style.display = 'block';

        const trigger = (event && (event.currentTarget || event.target)) ? (event.currentTarget || event.target) : document.body;
        const rect = trigger.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const padding = 12;

        let left = rect.left + (rect.width / 2) - (popoverRect.width / 2);
        if (left < padding) left = padding;
        if (left + popoverRect.width > window.innerWidth - padding) {
            left = window.innerWidth - popoverRect.width - padding;
        }

        let top = rect.top - popoverRect.height - 10;
        if (top < padding) {
            top = rect.bottom + 10;
        }

        popover.style.left = `${Math.round(left)}px`;
        popover.style.top = `${Math.round(top)}px`;
    }
}

function closeQuarantineInfo() {
    isQuarantineModalPinned = false;
    clearTimeout(quarantineTooltipTimeout);
    const popover = document.getElementById('quarantine-info-popover');
    const backdrop = document.getElementById('quarantine-popover-backdrop');
    if (popover) popover.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
}

if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isQuarantineModalPinned) {
            closeQuarantineInfo();
        }
    });

    document.addEventListener('click', (e) => {
        if (isQuarantineModalPinned) {
            const popover = document.getElementById('quarantine-info-popover');
            if (popover && !popover.contains(e.target) && !e.target.closest('.quarantine-info-btn') && !e.target.closest('.quarantine-badge')) {
                closeQuarantineInfo();
            }
        }
    });

    const popoverEl = document.getElementById('quarantine-info-popover');
    if (popoverEl) {
        popoverEl.addEventListener('mouseenter', () => clearTimeout(quarantineTooltipTimeout));
        popoverEl.addEventListener('mouseleave', () => {
            if (!isQuarantineModalPinned) hideQuarantineTooltip();
        });
    }
}

if (typeof window !== 'undefined') {
    window.getCustomerMaturationInfo = getCustomerMaturationInfo;
    window.showQuarantineTooltip = showQuarantineTooltip;
    window.hideQuarantineTooltip = hideQuarantineTooltip;
    window.openQuarantineInfoModal = openQuarantineInfoModal;
    window.closeQuarantineInfo = closeQuarantineInfo;
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


/* --------------------------------------------------------------------------
 * Shared Globals, Global Modal System (showModal/closeModal), Theme & Navigation UI Logic
 * -------------------------------------------------------------------------- */

// --- Globals ---
let templatesCache = [];
let isFetchingTemplatesCache = false;

async function ensureTemplatesCacheLoaded(force = false) {
    if (!force && ((templatesCache && Array.isArray(templatesCache) && templatesCache.length > 0) || isFetchingTemplatesCache)) {
        return;
    }

    if (!force) {
        try {
            const coId = (typeof currentCompanyId !== 'undefined' && currentCompanyId) ? currentCompanyId : 'default';
            const stored = sessionStorage.getItem(`templates_cache_${coId}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Invalidate stale cache if it contains un-resolved scontent.whatsapp.net media_id
                const hasStaleMedia = Array.isArray(parsed) && parsed.some(t => {
                    const mid = t.header_media && t.header_media.media_id;
                    return typeof mid === 'string' && mid.includes('scontent.whatsapp.net') && !t.header_media.cached_meta_media_id;
                });
                if (!hasStaleMedia && Array.isArray(parsed) && parsed.length > 0) {
                    templatesCache = parsed;
                    return;
                }
            }
        } catch (e) {}
    }

    isFetchingTemplatesCache = true;
    try {
        const res = await apiFetch('/api/templates');
        const json = await res.json();
        const rawTemplates = Array.isArray(json) ? json : (json.data || json.templates || []);
        if (Array.isArray(rawTemplates) && rawTemplates.length > 0) {
            templatesCache = rawTemplates;
            try {
                const coId = (typeof currentCompanyId !== 'undefined' && currentCompanyId) ? currentCompanyId : 'default';
                sessionStorage.setItem(`templates_cache_${coId}`, JSON.stringify(rawTemplates));
            } catch (e) {}

            // Re-render chat if active so templates switch from fallback to real rich cards
            if (activeInboxCustomer) {
                lastChatStatusHash = '';
                if (typeof fetchChatMessages === 'function') {
                    fetchChatMessages(false);
                }
            }
        }
    } catch (e) {
        console.error('Failed to pre-load templates cache:', e);
    } finally {
        isFetchingTemplatesCache = false;
    }
}

// Global cache clear helper
window.clearTemplatesCache = () => {
    try {
        const coId = (typeof currentCompanyId !== 'undefined' && currentCompanyId) ? currentCompanyId : 'default';
        sessionStorage.removeItem(`templates_cache_${coId}`);
        templatesCache = [];
        ensureTemplatesCacheLoaded(true);
    } catch (e) {}
};

let selectedCustomerIds = [];
let activeInboxCustomer = null;
var stagedChatFile = null;

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

    // Dynamic icon badge & styling
    const iconBadge = document.getElementById('modal-icon-badge');
    const iconSvg = document.getElementById('modal-icon-svg');
    if (iconBadge && iconSvg) {
        iconBadge.style.display = type === 'loading' ? 'none' : 'flex';
        iconBadge.className = 'modal-icon-badge';
        const titleLower = (title || '').toLowerCase();
        if (type === 'confirm' || titleLower.includes('delete') || titleLower.includes('warning') || titleLower.includes('remove')) {
            if (titleLower.includes('delete') || titleLower.includes('remove')) {
                iconBadge.classList.add('icon-danger');
                iconSvg.innerHTML = '<path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>';
            } else {
                iconBadge.classList.add('icon-warning');
                iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
            }
        } else if (titleLower.includes('error') || titleLower.includes('fail')) {
            iconBadge.classList.add('icon-danger');
            iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>';
        } else if (titleLower.includes('export') || titleLower.includes('download') || titleLower.includes('pdf') || titleLower.includes('excel')) {
            iconSvg.innerHTML = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>';
        } else {
            // Success / Info default checkmark
            iconSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
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
        newConfirm.textContent = confirmText || 'OK';
        newConfirm.className = confirmClass || 'btn primary';
    }

    const closeModal = () => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    };

    newCancel.addEventListener('click', closeModal);
    newConfirm.addEventListener('click', async () => {
        if (onConfirm) {
            newConfirm.innerHTML = '<span class="spinner"></span> Processing...';
            newConfirm.disabled = true;
            try { await onConfirm(); } catch (e) { console.error(e); }
            newConfirm.disabled = false;
        }
        closeModal();
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
    if (!group) return;

    const isCollapsed = group.classList.contains('collapsed');
    if (isCollapsed) {
        // Accordion behavior: collapse all other groups
        document.querySelectorAll('#sidebar-nav .nav-group').forEach(g => {
            if (g !== group) {
                g.classList.add('collapsed');
                const hasActive = g.querySelector('.nav-subitem.active');
                if (!hasActive) g.classList.remove('active-group');
            }
        });
        group.classList.remove('collapsed');
    } else {
        group.classList.add('collapsed');
    }
};


/* --------------------------------------------------------------------------
 * SPA View Switcher (switchView), Global Navigation Delegation, Popstate/Hashchange & App Initialization
 * -------------------------------------------------------------------------- */

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

    const link = document.querySelector(`[data-view="${target}"]`);
    const activeParentGroup = link ? link.closest('.nav-group') : null;

    // Collapse any nav-group that does not contain the active submenu!
    document.querySelectorAll('#sidebar-nav .nav-group').forEach(g => {
        if (g === activeParentGroup) {
            g.classList.add('active-group');
            g.classList.remove('collapsed');
        } else {
            g.classList.remove('active-group');
            g.classList.add('collapsed');
        }
    });

    if (link) {
        link.classList.add('active');
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
    if (target === 'inbox') {
        loadInboxSidebar();
        ensureTemplatesCacheLoaded();
    }
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
    if (target === 'automation') {
        if (typeof loadAutomationBoard === 'function') {
            loadAutomationBoard();
        } else if (typeof window.loadAutomationBoard === 'function') {
            window.loadAutomationBoard();
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

function initApp() {
    const initialHash = window.location.hash.replace('#', '').trim();
    const savedView = (initialHash && document.getElementById(`view-${initialHash}`))
        ? initialHash
        : (localStorage.getItem('activeView') || 'dashboard');
    
    if (history.replaceState) {
        history.replaceState({ view: savedView }, '', `#${savedView}`);
    }
    if (typeof updateSuperAdminNavVisibility === 'function') updateSuperAdminNavVisibility();
    if (typeof loadCompanies === 'function') loadCompanies();
    if (typeof switchView === 'function') switchView(savedView, false);
    if (typeof initVarPickers === 'function') initVarPickers();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        setTimeout(initApp, 0);
    }
}
if (typeof window !== 'undefined') {
    window.initApp = initApp;
}
