/**
 * ==========================================================================
 * INBOXCONTROLLER.JS - WhatsApp Web Live Inbox Controller (24h Service Window, Threads & Media Attachments)
 * ==========================================================================
 * Powers the real-time WhatsApp Web replica inbox: active 24-hour customer service window tracking, chat filters (All, 24h Active, 24h Expired), searchable contact list, multi-format message bubble rendering (text, images, audio, video, documents, location, interactive button replies), file staging & sending, Escape key to close chat, and in-chat lead status and notes updating.
 * 
 * Module Components:
 *  - Lines 9403 to 11340 in original app.js (Inbox Customer List, 24h Window Tracking, Chat Message Threads, Media Attachments, Escape Shortcut & Notes)
 * ==========================================================================
 */

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

function getCustomerActivityTimestamp(c) {
    if (!c) return 0;
    const tMsg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
    const tInbound = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0;
    const tCreated = c.created_at ? new Date(c.created_at).getTime() : 0;
    return Math.max(isNaN(tMsg) ? 0 : tMsg, isNaN(tInbound) ? 0 : tInbound, isNaN(tCreated) ? 0 : tCreated);
}

function filterAndRenderInboxContacts() {
    const query = document.getElementById('inbox-search')?.value.toLowerCase() || '';
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    const filtered = (inboxCustomersList || []).filter(c => {
        const matchesQuery = (c.name && c.name.toLowerCase().includes(query)) ||
            (c.phone && c.phone.toLowerCase().includes(query));
        if (!matchesQuery) return false;

        const is24hActive = c.last_inbound_at && (now - new Date(c.last_inbound_at).getTime() <= twentyFourHoursMs);
        const isInboundLead = isUnsavedLead(c);
        const custStatus = c.status || 'Open - Not Contacted';

        if (currentInboxFilter === 'free') {
            if (!is24hActive) return false;
        } else if (currentInboxFilter === 'expired') {
            if (is24hActive) return false;
        } else if (currentInboxFilter === 'unsaved') {
            if (!isInboundLead) return false;
        } else if (currentInboxFilter === 'status-open') {
            if (custStatus !== 'Open - Not Contacted') return false;
        } else if (currentInboxFilter === 'status-working') {
            if (custStatus !== 'Working - Contacted') return false;
        } else if (currentInboxFilter === 'status-closed') {
            if (custStatus !== 'Closed - Not Converted') return false;
        } else if (currentInboxFilter === 'status-converted') {
            if (custStatus !== 'Converted') return false;
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

    // Ensure recently messaged or reply customer is on top as recent conversations
    filtered.sort((a, b) => getCustomerActivityTimestamp(b) - getCustomerActivityTimestamp(a));

    // Check unsaved leads count to show/hide bulk save button
    const unsavedLeadsCount = (inboxCustomersList || []).filter(c => isUnsavedLead(c)).length;

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
        } else if (currentInboxFilter === 'expired') {
            msg = 'No 24h expired chats';
        } else if (currentInboxFilter === 'unsaved') {
            msg = 'No new unsaved / ad leads found';
        } else if (currentInboxFilter === 'status-open') {
            msg = 'No chats in "Open - Not Contacted"';
        } else if (currentInboxFilter === 'status-working') {
            msg = 'No chats in "Working - Contacted"';
        } else if (currentInboxFilter === 'status-closed') {
            msg = 'No chats in "Closed - Not Converted"';
        } else if (currentInboxFilter === 'status-converted') {
            msg = 'No chats in "Converted"';
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

        const custStatus = c.status || 'Open - Not Contacted';
        const statusKey = getStatusKey(custStatus);
        const statusShort = getStatusShort(custStatus);
        const statusPillHtml = `<span class="status-pill status-${statusKey}">${statusShort}</span>`;

        let lastMsgHtml = '';
        if (c.last_message_content || c.last_message_at) {
            let preview = c.last_message_content || (c.last_message_direction === 'inbound' ? 'Inbound message' : 'Message');
            if (preview.startsWith('[Template]')) {
                preview = '📋 ' + preview.replace(/^\[Template\]\s*/i, '');
            } else if (preview.length > 26) {
                preview = preview.slice(0, 26) + '...';
            }
            const timeStr = formatTime(c.last_message_at || c.last_inbound_at);
            lastMsgHtml = `
                <div class="contact-last-msg">
                    <span class="contact-last-msg-text">${escapeHtml(preview)}</span>
                    <span class="contact-last-msg-time">${timeStr}</span>
                </div>
            `;
        }

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
        div.className = `inbox-contact-card ${String(activeInboxCustomer) === String(c.id) ? 'active' : ''}`;
        div.setAttribute('data-id', c.id);
        div.innerHTML = `
            <div class="contact-avatar">${getInitial(c.name)}</div>
            <div class="contact-details">
                <div class="contact-name" style="display:flex; align-items:center; justify-content:space-between; gap:0.25rem;">
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(c.name)}</span>
                    ${leadTagHtml}
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.4rem; margin-top:0.2rem;">
                    <div class="contact-phone">${formatDisplayPhone(c.phone)}</div>
                    ${statusPillHtml}
                </div>
                ${lastMsgHtml}
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

// Enable smooth horizontal wheel scrolling over filter chips
const filterChipsContainer = document.getElementById('inbox-filter-chips');
filterChipsContainer?.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
        e.preventDefault();
        filterChipsContainer.scrollLeft += e.deltaY;
    }
}, { passive: false });

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

    // Initialize Status Dropdown & Notes in Chat Header
    const headerStatusSelect = document.getElementById('chat-header-status-select');
    if (headerStatusSelect) {
        const custStatus = customer.status || 'Open - Not Contacted';
        headerStatusSelect.value = custStatus;
        headerStatusSelect.className = `chat-header-status-select status-${getStatusKey(custStatus)}`;
    }

    // Sync conversation notes strip
    syncChatNotesUI(customer);

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

document.getElementById('chat-header-status-select')?.addEventListener('change', async (e) => {
    if (!activeInboxCustomer) return;
    const newStatus = e.target.value;
    await updateCustomerStatus(activeInboxCustomer, newStatus, e.target);
});

document.getElementById('btn-chat-notes')?.addEventListener('click', () => {
    if (activeInboxCustomer) {
        openCustomerNoteModal(activeInboxCustomer);
    }
});

document.getElementById('btn-edit-chat-strip-note')?.addEventListener('click', () => {
    if (activeInboxCustomer) {
        openCustomerNoteModal(activeInboxCustomer);
    }
});

document.getElementById('close-chat-btn')?.addEventListener('click', closeChat);

function closeChat() {
    activeInboxCustomer = null;
    activeCustomerData = null;
    if (inboxPollInterval) clearInterval(inboxPollInterval);

    const headerBar = document.getElementById('chat-header-bar');
    if (headerBar) headerBar.style.display = 'none';

    const strip = document.getElementById('chat-note-strip');
    if (strip) strip.style.display = 'none';

    const replyForm = document.getElementById('chat-reply-form');
    if (replyForm) replyForm.style.display = 'none';

    const replyInput = document.getElementById('chat-reply-text');
    if (replyInput) replyInput.value = '';

    const activeCustInput = document.getElementById('chat-active-customer');
    if (activeCustInput) activeCustInput.value = '';

    if (typeof clearChatAttachment === 'function') {
        clearChatAttachment();
    }

    const chatDropdown = document.getElementById('chat-dropdown-menu');
    if (chatDropdown) chatDropdown.classList.add('hidden');

    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="empty-state">
                <div class="empty-inbox-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <h3>Select a customer chat</h3>
                <p>Choose a conversation from the left to start messaging in real-time.</p>
            </div>
        `;
    }
    document.querySelectorAll('.inbox-contact-card').forEach(el => el.classList.remove('active'));

    if (window.innerWidth <= 768) {
        document.getElementById('inbox-customers-panel')?.classList.remove('hidden');
        document.getElementById('inbox-chat-area')?.classList.add('hidden');
    }

    if (window.location.hash && window.location.hash.startsWith('#inbox-chat-')) {
        if (history.replaceState) {
            history.replaceState({ view: 'inbox' }, '', '#inbox');
        }
    }
}
window.closeChat = closeChat;

// ⌨️ WhatsApp Web Style Escape Key Handler: Closes active chat window & refocuses search
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        // 1. If media lightbox is active, let it close first
        const lightbox = document.getElementById('modal-media-lightbox');
        if (lightbox && lightbox.style.display !== 'none') {
            if (typeof window.closeMediaLightbox === 'function') {
                window.closeMediaLightbox();
            } else {
                lightbox.style.display = 'none';
            }
            return;
        }

        // 2. If chat options dropdown menu is open, close it
        const chatDropdown = document.getElementById('chat-dropdown-menu');
        if (chatDropdown && !chatDropdown.classList.contains('hidden')) {
            chatDropdown.classList.add('hidden');
            return;
        }

        // 3. If inbox tag filter dropdown is open, close it
        const tagDropdown = document.getElementById('inbox-tag-dropdown-menu');
        if (tagDropdown && tagDropdown.style.display !== 'none') {
            tagDropdown.style.display = 'none';
            return;
        }

        // 4. If conversation notes modal is open, close it
        const openNotesModal = document.getElementById('modal-note');
        if (openNotesModal && openNotesModal.style.display !== 'none') {
            openNotesModal.style.display = 'none';
            return;
        }

        // 5. If assign tags modal is open, close it
        const openInboxTagsModal = document.getElementById('modal-inbox-tags');
        if (openInboxTagsModal && openInboxTagsModal.style.display !== 'none') {
            openInboxTagsModal.style.display = 'none';
            return;
        }

        // 6. If send template modal is open, close it
        const openSendTplModal = document.getElementById('modal-inbox-send-template');
        if (openSendTplModal && openSendTplModal.style.display !== 'none') {
            openSendTplModal.style.display = 'none';
            return;
        }

        // 7. If an attachment is staged in the chat input, clear attachment preview first
        if (typeof stagedChatFile !== 'undefined' && stagedChatFile) {
            clearChatAttachment();
            return;
        }

        // 8. WhatsApp Web behavior: If chat is open (customer selected), close chat on Escape!
        if (activeInboxCustomer) {
            e.preventDefault();
            closeChat();

            // Focus on inbox search input just like WhatsApp Web
            const searchInput = document.getElementById('inbox-search');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
            return;
        }

        // 9. If focus is on the inbox search bar and has text, clear search query
        const searchInput = document.getElementById('inbox-search');
        if (document.activeElement === searchInput && searchInput.value) {
            searchInput.value = '';
            if (typeof filterAndRenderInboxContacts === 'function') {
                filterAndRenderInboxContacts();
            }
            return;
        }
    }
});

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

window.showToast = function showToast(message, type = 'info') {
    if (!message) return;
    let toastContainer = document.getElementById('global-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'global-toast-container';
        toastContainer.style.cssText = 'position:fixed; top:20px; right:20px; z-index:999999; display:flex; flex-direction:column; gap:8px; pointer-events:none; max-width:380px; width:calc(100% - 40px);';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast-popup toast-${type}`;
    
    let bg = '#0f172a';
    let border = '#334155';
    let text = '#f8fafc';
    let icon = 'ℹ️';

    if (type === 'success') {
        bg = '#064e3b';
        border = '#10b981';
        text = '#ecfdf5';
        icon = '✅';
    } else if (type === 'error') {
        bg = '#7f1d1d';
        border = '#ef4444';
        text = '#fef2f2';
        icon = '⚠️';
    } else if (type === 'warning') {
        bg = '#78350f';
        border = '#f59e0b';
        text = '#fffbeb';
        icon = '⚡';
    }

    toast.style.cssText = `
        background: ${bg};
        border: 1px solid ${border};
        color: ${text};
        padding: 0.65rem 0.95rem;
        border-radius: 8px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 0.85rem;
        font-weight: 600;
        backdrop-filter: blur(8px);
        pointer-events: auto;
        opacity: 0;
        transform: translateY(-8px);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const safeMsg = (typeof escapeHtml === 'function') ? escapeHtml(message) : String(message);
    toast.innerHTML = `
        <span style="font-size: 1rem; line-height: 1;">${icon}</span>
        <span style="flex: 1; word-break: break-word;">${safeMsg}</span>
        <button type="button" style="background:none; border:none; color:inherit; opacity:0.75; cursor:pointer; font-size:1rem; padding:0; line-height:1;" onclick="this.parentElement.remove()">✕</button>
    `;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
        setTimeout(() => toast.remove(), 200);
    }, 3200);
};

window.saveInboxCustomerTags = async function saveInboxCustomerTags() {
    if (!activeInboxCustomer || !activeCustomerData) {
        if (typeof showToast === 'function') showToast('Please select a chat first.', 'warning');
        return;
    }
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
            // 1. Immediately update active customer object reference
            activeCustomerData.tags = newTagsStr;
            
            // 2. Immediately update in inboxCustomersList
            if (typeof inboxCustomersList !== 'undefined' && Array.isArray(inboxCustomersList)) {
                const inListCust = inboxCustomersList.find(c => String(c.id) === String(activeInboxCustomer));
                if (inListCust) inListCust.tags = newTagsStr;
            }

            // 3. Update in allCustomers directory list if present
            if (typeof allCustomers !== 'undefined' && Array.isArray(allCustomers)) {
                const inAllCust = allCustomers.find(c => String(c.id) === String(activeInboxCustomer));
                if (inAllCust) inAllCust.tags = newTagsStr;
            }
            
            // 4. Close modal immediately
            closeInboxAssignTagsModal();

            // 5. Re-render active chat header tags pills immediately
            renderActiveChatTags(activeCustomerData);

            // 6. Directly update the sidebar contact card tags preview in place
            const activeCard = document.querySelector(`.inbox-contact-card[data-id="${activeInboxCustomer}"]`);
            if (activeCard) {
                let tagsContainer = activeCard.querySelector('.inbox-card-tags');
                if (newTagsStr.trim()) {
                    const tagNames = newTagsStr.split(',').map(t => t.trim()).filter(Boolean);
                    const tagsHtml = tagNames.slice(0, 3).map(tn => {
                        const style = getTagStyle(tn);
                        return `<span class="contact-tag-pill ${style.cls}" style="${style.styleAttr}" title="${tn}">${tn}</span>`;
                    }).join('') + (tagNames.length > 3 ? `<span style="font-size:0.6rem; color:var(--text-muted); align-self:center;">+${tagNames.length - 3}</span>` : '');
                    
                    if (tagsContainer) {
                        tagsContainer.innerHTML = tagsHtml;
                    } else {
                        const details = activeCard.querySelector('.contact-details');
                        if (details) {
                            const newTagDiv = document.createElement('div');
                            newTagDiv.className = 'inbox-card-tags';
                            newTagDiv.style.cssText = 'display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.3rem;';
                            newTagDiv.innerHTML = tagsHtml;
                            details.appendChild(newTagDiv);
                        }
                    }
                } else if (tagsContainer) {
                    tagsContainer.remove();
                }
            }

            // 7. Refresh sidebar filters so active tag filter accounts for change
            if (typeof filterAndRenderInboxContacts === 'function') {
                filterAndRenderInboxContacts();
            }

            showToast('Tags updated successfully', 'success');
        }
    } catch(e) {
        console.error('Failed to save inbox tags:', e);
        showToast('Failed to save tags: ' + (e.message || 'Unknown error'), 'error');
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
                    `<div class="media-placeholder-title">Video</div>
                    <div class="media-placeholder-subtitle">${caption ? escapeHtml(caption) : 'Video received on WhatsApp'}</div>
                </div>
            </div>
        `;
    }

    if (isAudio) {
        if (mediaUrl) {
            return `
                <div class="chat-media-wrapper chat-media-audio-card">
                    <div class="audio-header-tag">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>
                        <span>Voice Note</span>
                    </div>
                    <audio src="${escapeHtml(mediaUrl)}" controls class="chat-audio-player" preload="metadata"></audio>
                    ${caption && caption !== 'Voice Note' ? `<div class="chat-media-caption">${escapeHtml(caption)}</div>` : ''}
                </div>
            `;
        }
        return `
            <div class="chat-media-placeholder audio-placeholder">
                <div class="media-placeholder-icon">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>
                </div>
                <div class="media-placeholder-info">
                    <div class="media-placeholder-title">Voice Note</div>
                    <div class="media-placeholder-subtitle">Audio received on WhatsApp</div>
                </div>
            </div>
        `;
    }

    if (isSticker) {
        if (mediaUrl) {
            return `
                <div class="chat-media-sticker-box">
                    <img src="${escapeHtml(mediaUrl)}" alt="Sticker" class="chat-media-sticker" loading="lazy">
                </div>
            `;
        }
        return `<span style="font-size:1.5rem;" title="Sticker">🎨 [Sticker]</span>`;
    }

    // Default: Document / Attachment
    let docName = 'Document';
    if (mediaUrl) {
        try {
            const urlObj = new URL(mediaUrl, window.location.origin);
            const fnParam = urlObj.searchParams.get('filename');
            if (fnParam) docName = fnParam;
            else {
                const parts = urlObj.pathname.split('/');
                const last = parts[parts.length - 1];
                if (last && last.includes('.')) docName = decodeURIComponent(last);
            }
        } catch(e) {}
    }
    if (docName === 'Document' && caption && caption.includes('.')) {
        docName = caption;
        caption = '';
    }

    const docExt = (docName.includes('.') ? docName.split('.').pop() : 'FILE').toLowerCase();
    let badgeClass = 'generic';
    if (docExt === 'pdf') badgeClass = 'pdf';
    else if (docExt === 'doc' || docExt === 'docx') badgeClass = 'doc';
    else if (docExt === 'xls' || docExt === 'xlsx' || docExt === 'csv') badgeClass = 'xls';

    if (mediaUrl) {
        const downloadUrl = mediaUrl.includes('?') ? `${mediaUrl}&download=1` : `${mediaUrl}?download=1`;
        return `
            <div class="chat-media-wrapper">
                <div onclick="downloadChatMedia('${escapeHtml(mediaUrl)}', '${escapeHtml(docName)}')" class="chat-media-doc-card" title="Click to download ${escapeHtml(docName)}">
                    <div class="doc-icon-badge ${badgeClass}">
                        ${escapeHtml(docExt.toUpperCase().slice(0, 4))}
                    </div>
                    <div class="doc-details">
                        <div class="doc-name" title="${escapeHtml(docName)}">${escapeHtml(docName)}</div>
                        <div class="doc-meta">
                            <span>${escapeHtml(docExt.toUpperCase())} File</span>
                            <span>•</span>
                            <span style="color:#00a884; font-weight:600;">Download</span>
                        </div>
                    </div>
                    <div class="doc-download-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </div>
                </div>
                ${caption && caption !== docName ? `<div class="chat-media-caption">${escapeHtml(caption).replace(/\n/g, '<br>')}</div>` : ''}
            </div>
        `;
    }

    return `
        <div class="chat-media-placeholder doc-placeholder">
            <div class="media-placeholder-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            </div>
            <div class="media-placeholder-info">
                <div class="media-placeholder-title">${escapeHtml(docName || 'Document')}</div>
                <div class="media-placeholder-subtitle">${caption && caption !== docName ? escapeHtml(caption) : 'Document attachment received on WhatsApp'}</div>
            </div>
        </div>
    `;
}

function handleMediaImgError(imgEl, fallbackTitle) {
    if (!imgEl) return;
    const box = imgEl.closest('.chat-media-wrapper') || imgEl.parentElement;
    if (box) {
        box.innerHTML = `
            <div class="chat-media-placeholder image-placeholder" style="border: 1px solid rgba(239, 68, 68, 0.25); background: rgba(239, 68, 68, 0.05);">
                <div class="media-placeholder-icon" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                </div>
                <div class="media-placeholder-info">
                    <div class="media-placeholder-title" style="color: #ef4444;">${fallbackTitle || 'Media'} Unavailable</div>
                    <div class="media-placeholder-subtitle">Meta Access Token expired • Update in Settings</div>
                </div>
            </div>
        `;
    }
}

window.downloadChatMedia = async function(url, defaultFilename) {
    if (!url) return;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            let errMsg = 'Failed to download media file.';
            try {
                const data = await res.json();
                if (data.code === 190 || data.is_auth_error) {
                    errMsg = 'Meta WhatsApp Access Token has expired. Please update your permanent System User Access Token in Workspace / Company Settings to view and download customer media.';
                } else if (data.error) {
                    errMsg = data.error;
                }
            } catch(e) {}
            showModal('Download Error', errMsg);
            return;
        }

        const blob = await res.blob();
        const contentType = (res.headers.get('content-type') || blob.type || '').toLowerCase();
        let ext = '.jpg';
        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
        else if (contentType.includes('png')) ext = '.png';
        else if (contentType.includes('webp')) ext = '.webp';
        else if (contentType.includes('gif')) ext = '.gif';
        else if (contentType.includes('mp4') || contentType.includes('video')) ext = '.mp4';
        else if (contentType.includes('pdf')) ext = '.pdf';
        else if (contentType.includes('ogg') || contentType.includes('opus')) ext = '.ogg';
        else if (contentType.includes('mp3') || contentType.includes('audio')) ext = '.mp3';
        else if (contentType.includes('csv')) ext = '.csv';
        else if (contentType.includes('sheet') || contentType.includes('excel') || contentType.includes('xls')) ext = '.xlsx';
        else if (contentType.includes('word') || contentType.includes('docx')) ext = '.docx';
        else if (contentType.includes('plain')) ext = '.txt';

        let filename = '';
        const disposition = res.headers.get('content-disposition');
        if (disposition && disposition.includes('filename=')) {
            const match = disposition.match(/filename="?([^";]+)"?/);
            if (match && match[1]) filename = match[1].trim();
        }
        if (!filename) {
            filename = defaultFilename || 'whatsapp_media';
        }

        // Guarantee filename has an extension
        if (!filename.includes('.')) {
            filename += ext;
        }

        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            window.URL.revokeObjectURL(blobUrl);
            a.remove();
        }, 1000);
    } catch (e) {
        showModal('Download Error', e.message || 'Could not download media.');
    }
};

window.openMediaLightbox = function(url, type) {
    const modal = document.getElementById('modal-media-lightbox');
    const container = document.getElementById('lightbox-media-container');
    const downloadBtn = document.getElementById('lightbox-download-btn');
    if (!modal || !container) return;

    container.innerHTML = '';
    if (downloadBtn) {
        downloadBtn.onclick = (e) => {
            e.preventDefault();
            downloadChatMedia(url, `whatsapp_${type || 'media'}`);
        };
    }

    if (type === 'video' || /\.(mp4|mov|webm)($|\?)/i.test(url)) {
        container.innerHTML = `<video src="${escapeHtml(url)}" controls autoplay style="max-width:88vw; max-height:78vh; border-radius:10px;"></video>`;
    } else {
        container.innerHTML = `<img src="${escapeHtml(url)}" alt="Full view" style="max-width:88vw; max-height:78vh; object-fit:contain; border-radius:10px;" onerror="handleMediaImgError(this, 'Photo')">`;
    }

    modal.style.display = 'flex';
};

window.closeMediaLightbox = function() {
    const modal = document.getElementById('modal-media-lightbox');
    const container = document.getElementById('lightbox-media-container');
    if (modal) modal.style.display = 'none';
    if (container) {
        const vid = container.querySelector('video');
        if (vid) vid.pause();
        container.innerHTML = '';
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeMediaLightbox();
    }
});


// --- WhatsApp Chat UI Helpers (Date Headers, WhatsApp Markdown, Media & Templates) ---
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
window.getChatDateHeader = getChatDateHeader;

function formatWhatsAppMarkdown(text) {
    if (!text) return '';
    let html = (typeof escapeHtml === 'function' ? escapeHtml(String(text)) : String(text));
    // Code blocks ```code```
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline code `code`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // Bold *text*
    html = html.replace(/\*([^\*\n]+)\*/g, '<strong>$1</strong>');
    // Italic _text_
    html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    // Strikethrough ~text~
    html = html.replace(/~([^~\n]+)~/g, '<del>$1</del>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
}
window.formatWhatsAppMarkdown = formatWhatsAppMarkdown;

function resolveTemplateCard(templateSlug, activeCustomerData, m) {
    const slug = (templateSlug || '').trim();
    let title = slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let body = m && m.content ? m.content.replace(/^\[Template\]\s*/i, '') : `Hello ${activeCustomerData?.name || 'Customer'}, thank you for contacting us!`;
    let headerImage = null;
    let headerBadge = 'Meta Template';
    let headerIcon = '📋';
    let footer = null;
    let buttons = [];

    if (typeof templatesCache !== 'undefined' && Array.isArray(templatesCache)) {
        const found = templatesCache.find(t => t.name === slug || t.id === slug || (t.name && t.name.toLowerCase() === slug.toLowerCase()));
        if (found) {
            title = found.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (found.category) headerBadge = `Meta ${found.category}`;
            
            if (Array.isArray(found.components)) {
                for (const comp of found.components) {
                    if (comp.type === 'HEADER') {
                        if (comp.format === 'IMAGE' && comp.example?.header_handle?.[0]) {
                            headerImage = comp.example.header_handle[0];
                        } else if (comp.text) {
                            title = comp.text;
                        }
                    } else if (comp.type === 'BODY') {
                        if (comp.text) body = comp.text;
                    } else if (comp.type === 'FOOTER') {
                        footer = comp.text;
                    } else if (comp.type === 'BUTTONS' && Array.isArray(comp.buttons)) {
                        buttons = comp.buttons.map(b => ({
                            text: b.text || 'View',
                            url: b.url || null,
                            phone_number: b.phone_number || null,
                            icon: b.type === 'PHONE_NUMBER' ? '📞' : (b.type === 'URL' ? '↗️' : '💬')
                        }));
                    }
                }
            }
        }
    }

    if (activeCustomerData?.name) {
        body = body.replace(/\{\{1\}\}/g, activeCustomerData.name);
    }

    return {
        slug,
        title,
        body,
        headerImage,
        headerBadge,
        headerIcon,
        footer,
        buttons
    };
}
window.resolveTemplateCard = resolveTemplateCard;

function renderChatMessageMedia(m) {
    const rawUrl = (m.media_url || '').trim();
    const msgType = (m.type || '').toLowerCase();
    const content = (m.content || '').trim();
    const fileName = m.filename || content || 'Document';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s || '');

    if (!rawUrl) {
        if (msgType === 'image' || content.toLowerCase().includes('image')) return '📷 [Image]';
        if (msgType === 'video' || content.toLowerCase().includes('video')) return '🎥 [Video]';
        if (msgType === 'audio' || content.toLowerCase().includes('audio')) return '🎵 [Audio]';
        if (msgType === 'document' || content.toLowerCase().includes('document')) return `📄 ${esc(fileName)}`;
        return esc(content);
    }

    const safeUrl = esc(rawUrl);

    if (msgType === 'image' || rawUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || content.toLowerCase().includes('[image]')) {
        return `
            <div class="chat-media-wrap">
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">
                    <img src="${safeUrl}" alt="Photo" class="chat-media-img" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='📷 [Image]';" />
                </a>
            </div>
        `;
    }
    if (msgType === 'video' || rawUrl.match(/\.(mp4|mov|webm|m4v)(\?.*)?$/i) || content.toLowerCase().includes('[video]')) {
        return `
            <div class="chat-media-wrap">
                <video src="${safeUrl}" controls class="chat-media-video" preload="metadata"></video>
            </div>
        `;
    }
    if (msgType === 'audio' || rawUrl.match(/\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i) || content.toLowerCase().includes('[audio]') || content.toLowerCase().includes('voice note')) {
        return `
            <div class="chat-media-wrap audio-wrap">
                <audio src="${safeUrl}" controls class="chat-media-audio" preload="metadata"></audio>
            </div>
        `;
    }
    // Document fallback
    return `
        <div class="chat-media-wrap doc-wrap">
            <a href="${safeUrl}" target="_blank" download class="chat-media-doc-link" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <div class="chat-doc-info">
                    <span class="chat-doc-name">${esc(fileName)}</span>
                    <span class="chat-doc-action">Download Document</span>
                </div>
            </a>
        </div>
    `;
}
window.renderChatMessageMedia = renderChatMessageMedia;

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

        // Keep active customer's latest message activity up to date
        if (latestMsg && activeCustomerData) {
            const numId = parseInt(activeCustomerData.id, 10);
            const inList = (inboxCustomersList || []).find(c => c.id === numId || c.id === activeCustomerData.id);
            if (inList) {
                const hadChange = inList.last_message_at !== latestMsg.created_at || inList.last_message_content !== latestMsg.content;
                inList.last_message_at = latestMsg.created_at;
                inList.last_message_content = latestMsg.content;
                inList.last_message_direction = latestMsg.direction;
                if (latestMsg.direction === 'inbound') {
                    inList.last_inbound_at = latestMsg.created_at;
                }
                if (hadChange && typeof filterAndRenderInboxContacts === 'function') {
                    filterAndRenderInboxContacts();
                }
            }
        }

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
            const rawContentTrimmed = (m.content || '').trim();
            const msgType = (m.type || '').toLowerCase();
            const mediaUrl = (m.media_url || '').trim();
            let isMedia = false;

            const isTemplate = contentHtml.startsWith('[Template]') || (m.type === 'template' && !contentHtml.includes('template-card-rendered'));

            if (isTemplate) {
                const templateSlug = contentHtml.replace(/^\[Template\]\s*/i, '').trim();
                const templateCard = resolveTemplateCard(templateSlug, activeCustomerData, m);

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
                                <img src="${escapeHtml(templateCard.headerImage)}" alt="${escapeHtml(templateCard.title || 'Template Banner')}" class="tpl-card-header-img" onerror="this.style.display='none'" />
                            </div>
                        ` : ''}

                        ${templateCard.title ? `
                            <div class="tpl-card-title">
                                <span class="tpl-icon">${templateCard.headerIcon || '📋'}</span>
                                <strong>${escapeHtml(templateCard.title)}</strong>
                            </div>
                        ` : ''}

                        <div class="tpl-card-body">
                            ${formatWhatsAppMarkdown(templateCard.body)}
                        </div>

                        ${templateCard.footer ? `
                            <div class="tpl-card-footer">${escapeHtml(templateCard.footer)}</div>
                        ` : ''}

                        ${templateCard.buttons && templateCard.buttons.length > 0 ? `
                            <div class="tpl-card-buttons-container">
                                ${templateCard.buttons.map(b => {
                                    if (b.url) {
                                        return `
                                            <a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer" class="tpl-card-action-btn" title="Template Action: ${escapeHtml(b.text)}" style="text-decoration:none;">
                                                <span>${b.icon || '↗️'}</span>
                                                <span>${escapeHtml(b.text)}</span>
                                            </a>
                                        `;
                                    }
                                    if (b.phone_number) {
                                        return `
                                            <a href="tel:${escapeHtml(b.phone_number)}" class="tpl-card-action-btn" title="Call: ${escapeHtml(b.phone_number)}" style="text-decoration:none;">
                                                <span>${b.icon || '📞'}</span>
                                                <span>${escapeHtml(b.text)}</span>
                                            </a>
                                        `;
                                    }
                                    return `
                                        <div class="tpl-card-action-btn" title="Template Action: ${escapeHtml(b.text)}">
                                            <span>${b.icon || '💬'}</span>
                                            <span>${escapeHtml(b.text)}</span>
                                        </div>
                                    `;
                                }).join('')}
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
            } else if (
                msgType === 'image' || rawContentTrimmed === '[Image]' || rawContentTrimmed === '[image]' ||
                msgType === 'video' || rawContentTrimmed === '[Video]' || rawContentTrimmed === '[video]' ||
                msgType === 'document' || rawContentTrimmed === '[Document]' || rawContentTrimmed === '[document]' ||
                msgType === 'audio' || rawContentTrimmed === '[Audio]' || rawContentTrimmed === '[audio]' || rawContentTrimmed.toLowerCase().includes('voice note') ||
                msgType === 'sticker' || rawContentTrimmed === '[Sticker]' || rawContentTrimmed === '[sticker]' ||
                (mediaUrl && !mediaUrl.startsWith('/api/messages'))
            ) {
                isMedia = true;
                contentHtml = renderChatMessageMedia(m);
            }

            row.innerHTML = `
                <div class="message-bubble ${m.direction}${isMedia ? ' has-media' : ''}">
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

// Staged file attachment handling for chat input
var stagedChatFile = null;

document.getElementById('chat-attach-btn')?.addEventListener('click', () => {
    document.getElementById('chat-file-input')?.click();
});

document.getElementById('chat-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 16 * 1024 * 1024) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        showModal('File Size Exceeds 16 MB Limit', `The selected file "${escapeHtml(file.name)}" is ${sizeMb} MB. Meta allows media files up to 16 MB. Please select a file under 16 MB.`);
        e.target.value = '';
        return;
    }

    stagedChatFile = file;
    const previewChip = document.getElementById('chat-attachment-preview');
    const previewName = document.getElementById('chat-attachment-name');
    const previewIcon = document.getElementById('chat-attachment-icon');

    if (previewChip && previewName) {
        previewName.textContent = file.name;
        if (file.type.startsWith('image/')) previewIcon.textContent = '📷';
        else if (file.type.startsWith('video/')) previewIcon.textContent = '🎥';
        else if (file.type.includes('pdf')) previewIcon.textContent = '📄';
        else previewIcon.textContent = '📎';
        previewChip.style.display = 'inline-flex';
        document.getElementById('chat-reply-text')?.removeAttribute('required');
    }
});

document.getElementById('chat-attachment-remove')?.addEventListener('click', () => {
    clearChatAttachment();
});

function clearChatAttachment() {
    stagedChatFile = null;
    const fileInput = document.getElementById('chat-file-input');
    if (fileInput) fileInput.value = '';
    const previewChip = document.getElementById('chat-attachment-preview');
    if (previewChip) previewChip.style.display = 'none';
    document.getElementById('chat-reply-text')?.setAttribute('required', 'required');
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.getElementById('chat-reply-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('chat-reply-text');
    const content = inputEl.value.trim();
    if (!content && !stagedChatFile) return;

    const customerId = document.getElementById('chat-active-customer').value;
    const btn = e.target.querySelector('button[type="submit"]');

    const originalBtnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:1rem;height:1rem;border-width:2px;display:inline-block;"></span>`;

    try {
        let mediaId = null;
        let msgType = 'text';

        if (stagedChatFile) {
            const base64Data = await readFileAsBase64(stagedChatFile);
            const uploadRes = await apiFetch('/api/upload-media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base64Data,
                    fileName: stagedChatFile.name,
                    mimeType: stagedChatFile.type || 'application/octet-stream'
                })
            });
            const uploadResult = await uploadRes.json();
            if (uploadResult.error) {
                showModal('Upload Error', 'Failed to upload media attachment: ' + uploadResult.error);
                btn.disabled = false;
                btn.innerHTML = originalBtnHtml;
                return;
            }
            mediaId = uploadResult.media_id || uploadResult.handle;
            if (stagedChatFile.type.startsWith('image/')) msgType = 'image';
            else if (stagedChatFile.type.startsWith('video/')) msgType = 'video';
            else msgType = 'document';
        }

        const payload = {
            customer_id: customerId,
            type: msgType,
            content: content || (stagedChatFile ? stagedChatFile.name : '')
        };
        if (mediaId) {
            payload.media_id = mediaId;
            if (stagedChatFile) {
                payload.filename = stagedChatFile.name;
                payload.media_type = msgType;
            }
        }

        const res = await apiFetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();
        if (result.error) {
            showModal('Message Error', "Failed to send message: " + result.error);
        } else {
            inputEl.value = '';
            clearChatAttachment();
            const numId = parseInt(customerId, 10);
            const cust = (inboxCustomersList || []).find(c => c.id === numId || c.id === customerId);
            if (cust) {
                cust.last_message_at = new Date().toISOString();
                cust.last_message_content = content || (stagedChatFile ? stagedChatFile.name : 'Message');
                cust.last_message_direction = 'outbound';
                if (typeof filterAndRenderInboxContacts === 'function') {
                    filterAndRenderInboxContacts();
                }
            }
        }

        fetchChatMessages();
    } catch (err) {
        showModal('Error', err.message || 'Failed to send message');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
    }
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
        const rawTemplates = Array.isArray(json) ? json : (json.data || json.templates || []);
        templatesCache = rawTemplates;
        try {
            const coId = (typeof currentCompanyId !== 'undefined' && currentCompanyId) ? currentCompanyId : 'default';
            sessionStorage.setItem(`templates_cache_${coId}`, JSON.stringify(rawTemplates));
        } catch (e) {}
        // Strictly show ONLY approved templates (exclude PENDING, REJECTED, PAUSED)
        const templates = Array.isArray(rawTemplates)
            ? rawTemplates.filter(t => (t.status || '').toUpperCase() === 'APPROVED')
            : [];

        if (templates.length === 0) {
            showModal('No Approved Templates Found', 'No approved Meta message templates found in your WhatsApp Business Account. Pending or rejected templates cannot be sent.');
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
                    media_id = tmpl && tmpl.header_media ? (tmpl.header_media.cached_meta_media_id || tmpl.header_media.media_id) : null;
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
                const numId = parseInt(activeInboxCustomer, 10);
                const cust = (inboxCustomersList || []).find(c => c.id === numId || c.id === activeInboxCustomer);
                if (cust) {
                    cust.last_message_at = new Date().toISOString();
                    cust.last_message_content = `[Template] ${templateName}`;
                    cust.last_message_direction = 'outbound';
                    if (typeof filterAndRenderInboxContacts === 'function') {
                        filterAndRenderInboxContacts();
                    }
                }
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
                if (!file) return;

                if (file.size > 16 * 1024 * 1024) {
                    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
                    showModal('File Size Exceeds 16 MB Limit', `The selected file "${escapeHtml(file.name)}" is ${sizeMb} MB. Meta allows media files up to 16 MB. Please select a file under 16 MB.`);
                    fileInputEl.value = '';
                    if (dropzoneText) dropzoneText.textContent = 'Click to browse and upload media file';
                    return;
                }

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

