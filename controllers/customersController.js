/**
 * ==========================================================================
 * CUSTOMERSCONTROLLER.JS - Customers & CRM Contacts Controller (Tags, Lead Status Pipeline & Data Export)
 * ==========================================================================
 * Controls the Customer CRM directory, table rendering with pagination and search, customer tags management & color palettes, lead status workflow pipeline (Open, Contacted, Qualified, Converted, Lost), customer add/edit modal, quick conversation notes sync, and filtered data exports to CSV, Excel, and PDF.
 * 
 * Module Components:
 *  - Lines 3540 to 4753 in original app.js (Customer Tags, Lead Status Helpers, Customers Table, Add/Edit Customer, Conversation Notes & CSV/PDF Export)
 * ==========================================================================
 */

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

// --- Lead Status Helpers ---
function getStatusKey(status) {
    if (!status) return 'open';
    const s = String(status).toLowerCase();
    if (s.includes('working')) return 'working';
    if (s.includes('closed')) return 'closed';
    if (s.includes('converted')) return 'converted';
    return 'open';
}

function getStatusShort(status) {
    if (!status) return 'Open';
    const s = String(status).toLowerCase();
    if (s.includes('working')) return 'Working';
    if (s.includes('closed')) return 'Closed';
    if (s.includes('converted')) return 'Converted';
    return 'Open';
}

window.updateCustomerStatus = async function updateCustomerStatus(id, newStatus, selectEl = null) {
    if (!id || !newStatus) return;

    const numId = parseInt(id, 10);
    const key = getStatusKey(newStatus);

    if (selectEl) {
        selectEl.className = selectEl.classList.contains('chat-header-status-select')
            ? `chat-header-status-select status-${key}`
            : `status-select-badge status-${key}`;
    }

    // Optimistic local state updates
    const targetCust = (allCustomers || []).find(c => c.id === numId || c.id === id);
    if (targetCust) targetCust.status = newStatus;

    const targetFiltered = (filteredCustomers || []).find(c => c.id === numId || c.id === id);
    if (targetFiltered) targetFiltered.status = newStatus;

    const inboxCust = (inboxCustomersList || []).find(c => c.id === numId || c.id === id);
    if (inboxCust) inboxCust.status = newStatus;

    if (activeCustomerData && (activeCustomerData.id === numId || activeCustomerData.id === id)) {
        activeCustomerData.status = newStatus;
        const chatHeaderSelect = document.getElementById('chat-header-status-select');
        if (chatHeaderSelect && chatHeaderSelect !== selectEl) {
            chatHeaderSelect.value = newStatus;
            chatHeaderSelect.className = `chat-header-status-select status-${key}`;
        }
    }

    // Refresh inbox contacts list and sidebar cards
    if (typeof filterAndRenderInboxContacts === 'function') {
        filterAndRenderInboxContacts();
    }

    try {
        const res = await apiFetch('/api/customers', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: numId || id, status: newStatus, company_id: typeof getCompanyId === 'function' ? getCompanyId() : undefined })
        });
        const data = await res.json();
        if (data.error) {
            throw new Error(data.error);
        }
    } catch (err) {
        console.error('Failed to update status:', err);
        showModal('Status Update Error', 'Could not update customer status: ' + err.message);
    }
};

function applyCustomerFilters() {
    const query = (document.getElementById('customers-search')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('customers-status-filter')?.value || 'all';
    const selectedTag = (document.getElementById('customers-tag-filter')?.value || '').toLowerCase().trim();

    filteredCustomers = (allCustomers || []).filter(c => {
        const matchesQuery = (!query) || (
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.phone && c.phone.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.company_name && c.company_name.toLowerCase().includes(query)) ||
            (c.tags && c.tags.toLowerCase().includes(query)) ||
            (c.description && c.description.toLowerCase().includes(query)) ||
            (c.notes && c.notes.toLowerCase().includes(query)) ||
            (c.city && c.city.toLowerCase().includes(query))
        );

        if (!matchesQuery) return false;

        if (statusFilter !== 'all') {
            const custStatus = c.status || 'Open - Not Contacted';
            if (custStatus !== statusFilter) return false;
        }

        if (selectedTag) {
            const custTags = (c.tags || '').split(',').map(s => s.trim().toLowerCase());
            if (!custTags.includes(selectedTag)) return false;
        }

        return true;
    });

    currentCustomersPage = 1;
    renderCustomersTable();

    // Dynamically update Export button labels with filtered count
    const exportLabel = document.getElementById('btn-export-customers-label');
    if (exportLabel) {
        exportLabel.textContent = filteredCustomers.length > 0 
            ? `Export (${filteredCustomers.length})` 
            : 'Export Excel';
    }
    const pdfLabel = document.getElementById('btn-export-pdf-label');
    if (pdfLabel) {
        pdfLabel.textContent = filteredCustomers.length > 0 
            ? `PDF (${filteredCustomers.length})` 
            : 'Export PDF';
    }
}

window.filterCustomersByTag = function filterCustomersByTag(tagVal) {
    applyCustomerFilters();
};

// --- Customers Logic ---
async function loadCustomers() {
    const tbody = document.getElementById('customers-table-body');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="11"><div class="loading-spinner-container"><div class="spinner-icon"></div><span>Loading customer directory...</span></div></td></tr>`;
    }
    try {
        await loadTags();

        const res = await apiFetch('/api/customers');
        const customers = await res.json();

        if (customers.error) {
            console.error('API Error:', customers.error);
            if (tbody) tbody.innerHTML = renderTableEmptyStateHtml(11, 'Failed to load customers', customers.error || 'Server error occurred while loading contacts.', '⚠️');
            return;
        }

        allCustomers = Array.isArray(customers) ? customers : [];
        applyCustomerFilters();

        const statEl = document.getElementById('dash-stat-customers');
        if (statEl) statEl.textContent = allCustomers.length;

        syncTagSelectorDisplay('form');
    } catch (e) {
        console.error('Error loading customers:', e);
        if (tbody) tbody.innerHTML = renderTableEmptyStateHtml(11, 'Error loading customer data', 'Please check your connection and refresh.', '⚠️');
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
        const custStatus = c.status || 'Open - Not Contacted';
        const statusKey = getStatusKey(custStatus);
        const custDesc = c.description || c.notes || '';

        const matInfo = getCustomerMaturationInfo(c);
        const quarantineBadge = matInfo.isMaturing ? 
            `<span class="quarantine-badge" onmouseenter="showQuarantineTooltip(event, '${matInfo.timeText}')" onmouseleave="hideQuarantineTooltip()" title="In 6-hour Quarantine cooldown (${matInfo.timeText} left)">
                <span>Quarantine: ${matInfo.timeText}</span>
                <button type="button" class="quarantine-info-btn" onclick="openQuarantineInfoModal(event, '${matInfo.timeText}')" title="Why is this contact in quarantine? Click to view policy">🛈</button>
            </span>` : '';

        const addrParts = [];
        if (c.address) addrParts.push(escapeHtml(c.address));
        if (c.city) addrParts.push(escapeHtml(c.city));
        if (c.state) addrParts.push(escapeHtml(c.state));
        if (c.pincode) addrParts.push(escapeHtml(c.pincode));
        const addressDisplayHtml = addrParts.length > 0 
            ? `<div style="display:flex; align-items:flex-start; gap:4px; font-size:0.8rem; color:var(--text-main); line-height:1.35;">
                <span style="opacity:0.65; flex-shrink:0;">📍</span>
                <span>${addrParts.join(', ')}</span>
               </div>`
            : `<span style="font-size:0.8rem; color:var(--text-muted);">-</span>`;

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
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px;">
                            <strong style="color:var(--text-main); font-size:0.9rem;">${escapeHtml(c.name || 'Customer')}</strong>
                            ${quarantineBadge}
                        </div>
                    </div>
                </div>
            </td>
            <td><code style="font-size:0.85rem;color:var(--primary); font-weight:600;">${c.phone}</code></td>
            <td>${addressDisplayHtml}</td>
            <td class="cust-status-td">
                <select class="status-select-badge status-${statusKey}" 
                        onchange="updateCustomerStatus(${c.id}, this.value, this)" 
                        title="Click to update status">
                    <option value="Open - Not Contacted" ${custStatus === 'Open - Not Contacted' ? 'selected' : ''}>🔵 Open - Not Contacted</option>
                    <option value="Working - Contacted" ${custStatus === 'Working - Contacted' ? 'selected' : ''}>🟡 Working - Contacted</option>
                    <option value="Closed - Not Converted" ${custStatus === 'Closed - Not Converted' ? 'selected' : ''}>⚪ Closed - Not Converted</option>
                    <option value="Converted" ${custStatus === 'Converted' ? 'selected' : ''}>🟢 Converted</option>
                </select>
            </td>
            <td class="cust-notes-td">
                <div class="cust-notes-cell" onclick="openCustomerNoteModal(${c.id})" title="Click to view or update conversation notes">
                    <span class="cust-notes-snippet ${!custDesc ? 'is-empty' : ''}">${custDesc ? escapeHtml(custDesc) : '<em>+ Add conversation notes...</em>'}</span>
                    <button type="button" class="cust-notes-edit-icon" title="Edit conversation notes">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                </div>
            </td>
            <td><span style="font-size:0.8rem;color:var(--text-muted);">${c.email ? escapeHtml(c.email) : '-'}</span></td>
            <td><span style="font-size:0.8rem;color:var(--text-muted);">${c.company_name ? escapeHtml(c.company_name) : '-'}</span></td>
            <td>${tagsDisplayHtml}</td>
            <td><span class="window-badge" style="background:var(--primary-light);color:var(--primary);">${c.message_count || 0} msgs</span></td>
            <td style="text-align: right;">
                <button class="btn secondary sm" onclick="editCustomer(${c.id})">Edit</button>
                <button class="btn danger sm" onclick="deleteCustomer(${c.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (totalItems === 0) {
        tbody.innerHTML = renderTableEmptyStateHtml(11, 'No matching customers found', 'Try adjusting your search query, status, or tag filters.', '👥');
    }

    if (pageInfo) {
        pageInfo.textContent = `Showing ${totalItems === 0 ? 0 : startIndex + 1} to ${endIndex} of ${totalItems}`;
    }

    if (btnPrev) btnPrev.disabled = currentCustomersPage === 1;
    if (btnNext) btnNext.disabled = currentCustomersPage === totalPages || totalItems === 0;
}

document.getElementById('customers-search')?.addEventListener('input', applyCustomerFilters);
document.getElementById('customers-status-filter')?.addEventListener('change', applyCustomerFilters);

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
    const statusSelect = document.getElementById('cust-status');
    if (statusSelect) {
        statusSelect.value = cust.status || 'Open - Not Contacted';
    }
    const descInput = document.getElementById('cust-description');
    if (descInput) {
        descInput.value = cust.description || cust.notes || '';
    }
    if (document.getElementById('cust-notes')) document.getElementById('cust-notes').value = cust.notes || '';
    document.getElementById('btn-save-cust').innerHTML = `<span>Update Customer</span>`;
    document.getElementById('btn-cancel-edit').style.display = 'inline-flex';

    // Show editing notification banner inside the form
    const editBar = document.getElementById('cust-edit-indicator-bar');
    const editTargetName = document.getElementById('cust-edit-target-name');
    if (editBar && editTargetName) {
        editTargetName.textContent = cust.name ? `${cust.name} (${cust.phone})` : cust.phone;
        editBar.style.display = 'flex';
    }

    // Smoothly scroll to the customer form for instant visual feedback
    const formEl = document.getElementById('add-customer-form');
    if (formEl) {
        formEl.classList.remove('form-edit-active');
        void formEl.offsetWidth; // Force CSS reflow to re-trigger pulse
        formEl.classList.add('form-edit-active');

        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const contentContainer = document.querySelector('.content');
        if (contentContainer) {
            const formTop = Math.max(0, formEl.offsetTop - 24);
            contentContainer.scrollTo({ top: formTop, behavior: 'smooth' });
        }
    }

    // Auto-focus on customer name field
    setTimeout(() => {
        const nameInput = document.getElementById('cust-name');
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        }
    }, 280);
};

document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    document.getElementById('add-customer-form').reset();
    document.getElementById('cust-id').value = '';
    const statusSelect = document.getElementById('cust-status');
    if (statusSelect) statusSelect.value = 'Open - Not Contacted';
    const descInput = document.getElementById('cust-description');
    if (descInput) descInput.value = '';
    if (document.getElementById('cust-tags')) {
        document.getElementById('cust-tags').value = '';
        syncTagSelectorDisplay('form');
    }
    document.getElementById('btn-save-cust').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Add Customer</span>`;
    document.getElementById('btn-cancel-edit').style.display = 'none';

    // Hide editing banner and clear active highlight
    const editBar = document.getElementById('cust-edit-indicator-bar');
    if (editBar) editBar.style.display = 'none';
    const formEl = document.getElementById('add-customer-form');
    if (formEl) formEl.classList.remove('form-edit-active');
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
    const status = document.getElementById('cust-status')?.value || 'Open - Not Contacted';
    const description = document.getElementById('cust-description')?.value.trim() || '';
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
                status,
                description,
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
            `By adding ${name} (${phone}) with status "${status}", you certify that this customer has agreed: "I agree to receive WhatsApp, Email, and SMS promotional updates & service announcements from Inspenox Business Suite".`,
            'confirm',
            performSave,
            'I Confirm & Agree',
            'btn primary'
        );
    }
});

// --- Quick Customer Conversation Note Modal & Sync Logic ---
function syncChatNotesUI(customer) {
    if (!customer) return;
    const strip = document.getElementById('chat-note-strip');
    const noteText = document.getElementById('chat-note-text');
    if (strip && noteText) {
        strip.style.display = 'flex';
        const desc = customer.description || customer.notes;
        if (desc && desc.trim()) {
            noteText.textContent = desc;
            noteText.className = 'chat-note-text';
        } else {
            noteText.textContent = 'No conversation notes recorded yet. Click "Edit Note" to log discussion.';
            noteText.className = 'chat-note-text is-empty';
        }
    }
}

window.openCustomerNoteModal = (id) => {
    const numId = parseInt(id, 10);
    const customer = (allCustomers || []).find(c => c.id === numId || c.id === id) || 
                     (inboxCustomersList || []).find(c => c.id === numId || c.id === id) ||
                     (activeCustomerData && (activeCustomerData.id === numId || activeCustomerData.id === id) ? activeCustomerData : null);
    if (!customer) return;

    const modal = document.getElementById('cust-note-modal');
    if (!modal) return;

    const nameEl = document.getElementById('note-modal-name');
    const phoneEl = document.getElementById('note-modal-phone');
    if (nameEl) nameEl.textContent = customer.name || 'Customer';
    if (phoneEl) phoneEl.textContent = formatDisplayPhone(customer.phone);

    const statusSelect = document.getElementById('note-modal-status-select');
    if (statusSelect) {
        statusSelect.value = customer.status || 'Open - Not Contacted';
    }

    const textarea = document.getElementById('note-modal-textarea');
    if (textarea) {
        textarea.value = customer.description || customer.notes || '';
        setTimeout(() => textarea.focus(), 60);
    }

    const closeModal = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    };

    const closeBtn = document.getElementById('note-modal-close');
    const cancelBtn = document.getElementById('note-modal-cancel');
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    const saveBtn = document.getElementById('note-modal-save');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const newStatus = statusSelect ? statusSelect.value : customer.status;
            const newNotes = textarea ? textarea.value.trim() : '';

            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

            try {
                const res = await apiFetch('/api/customers', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: customer.id,
                        status: newStatus,
                        description: newNotes,
                        notes: newNotes,
                        company_id: typeof getCompanyId === 'function' ? getCompanyId() : undefined
                    })
                });

                if (!res.ok) throw new Error('Failed to update notes');

                customer.status = newStatus;
                customer.description = newNotes;
                customer.notes = newNotes;

                const matchAll = (allCustomers || []).find(c => c.id === customer.id);
                if (matchAll) {
                    matchAll.status = newStatus;
                    matchAll.description = newNotes;
                    matchAll.notes = newNotes;
                }
                const matchFiltered = (filteredCustomers || []).find(c => c.id === customer.id);
                if (matchFiltered) {
                    matchFiltered.status = newStatus;
                    matchFiltered.description = newNotes;
                    matchFiltered.notes = newNotes;
                }
                const matchInbox = (inboxCustomersList || []).find(c => c.id === customer.id);
                if (matchInbox) {
                    matchInbox.status = newStatus;
                    matchInbox.description = newNotes;
                    matchInbox.notes = newNotes;
                }

                renderCustomersTable();
                if (typeof filterAndRenderInboxContacts === 'function') {
                    filterAndRenderInboxContacts();
                }

                const activeCustId = document.getElementById('chat-active-customer')?.value;
                if (activeCustId && String(activeCustId) === String(customer.id)) {
                    syncChatNotesUI(customer);
                    const chatHeaderSelect = document.getElementById('chat-header-status-select');
                    if (chatHeaderSelect) {
                        chatHeaderSelect.value = newStatus;
                        chatHeaderSelect.className = `chat-header-status-select status-${getStatusKey(newStatus)}`;
                    }
                }

                closeModal();
            } catch (err) {
                console.error(err);
                showModal('Error', 'Could not save conversation notes: ' + err.message);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                    <span>Save Notes</span>
                `;
            }
        };
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

// --- Export Customers Based on Active Filter ---
function getActiveCompanyName() {
    if (typeof getStoredCompany === 'function') {
        const comp = getStoredCompany();
        if (comp && comp.name) return comp.name;
    }
    const navName = document.getElementById('nav-active-company-name')?.textContent;
    if (navName && navName.trim()) return navName.trim();
    return 'Inspenox';
}

function exportFilteredCustomers() {
    if (!filteredCustomers || filteredCustomers.length === 0) {
        showModal('No Customers to Export', 'There are no customers matching your current filter criteria to export.');
        return;
    }

    const statusFilter = document.getElementById('customers-status-filter')?.value || 'all';
    const searchQuery = document.getElementById('customers-search')?.value.trim() || '';

    const exportRows = filteredCustomers.map((c, index) => {
        const cleanPhone = formatIndiaPhone(c.phone);
        const createdDate = c.created_at ? new Date(c.created_at).toLocaleDateString() : '';
        const lastMsgTime = c.last_message_at ? new Date(c.last_message_at).toLocaleString() : 'No messages';

        return {
            "Sr No": index + 1,
            "Customer Name": c.name || "Customer",
            "Phone Number": cleanPhone,
            "Display Phone": formatDisplayPhone(c.phone),
            "Status": c.status || "Open - Not Contacted",
            "Conversation Notes": c.description || c.notes || "",
            "Email": c.email || "",
            "Company": c.company_name || "",
            "Address": c.address || "",
            "City": c.city || "",
            "State": c.state || "",
            "Pincode": c.pincode || "",
            "Tags": c.tags || "",
            "Messages Count": parseInt(c.message_count, 10) || 0,
            "Unread Messages": parseInt(c.unread_count, 10) || 0,
            "Date Added": createdDate,
            "Last Conversation Activity": lastMsgTime
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();

    let sheetName = "Filtered Customers";
    if (statusFilter !== 'all') {
        sheetName = statusFilter.slice(0, 31);
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    worksheet['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 24 }, // Customer Name
        { wch: 16 }, // Phone Number
        { wch: 18 }, // Display Phone
        { wch: 22 }, // Status
        { wch: 35 }, // Conversation Notes
        { wch: 24 }, // Email
        { wch: 20 }, // Company
        { wch: 16 }, // City
        { wch: 20 }, // Tags
        { wch: 16 }, // Messages Count
        { wch: 16 }, // Unread Messages
        { wch: 14 }, // Date Added
        { wch: 26 }  // Last Conversation Activity
    ];

    const companyName = getActiveCompanyName();
    const prefix = companyName.replace(/[^a-zA-Z0-9]+/g, '_');
    const nowStr = new Date().toISOString().slice(0, 10);
    let filterSlug = 'all';
    if (statusFilter !== 'all') {
        filterSlug = statusFilter.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    } else if (searchQuery) {
        filterSlug = 'search_' + searchQuery.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 15);
    }

    const filename = `${prefix}_Customers_${filterSlug}_${exportRows.length}_contacts_${nowStr}.xlsx`;
    XLSX.writeFile(workbook, filename);

    const filterDesc = statusFilter !== 'all' ? `status "${statusFilter}"` : (searchQuery ? `search "${searchQuery}"` : 'all contacts');
    showModal('Export Successful', `Successfully exported ${exportRows.length} customer(s) based on ${filterDesc} to <strong>${filename}</strong>.`);
}

document.getElementById('btn-export-customers')?.addEventListener('click', exportFilteredCustomers);
document.getElementById('btn-export-customers-toolbar')?.addEventListener('click', exportFilteredCustomers);

// --- Export Filtered Customers to PDF Document ---
async function exportFilteredCustomersPdf() {
    if (!filteredCustomers || filteredCustomers.length === 0) {
        showModal('No Customers to Export', 'There are no customers matching your current filter criteria to export.');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        showModal('Loading PDF Generator', 'Downloading PDF generator library, please wait a moment...');
        try {
            await new Promise((resolve, reject) => {
                const s1 = document.createElement('script');
                s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                s1.onload = () => {
                    const s2 = document.createElement('script');
                    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
                    s2.onload = resolve;
                    s2.onerror = reject;
                    document.head.appendChild(s2);
                };
                s1.onerror = reject;
                document.head.appendChild(s1);
            });
        } catch (err) {
            showModal('PDF Error', 'Failed to load PDF library. Please check your internet connection.');
            return;
        }
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
    });

    const statusFilter = document.getElementById('customers-status-filter')?.value || 'all';
    const searchQuery = document.getElementById('customers-search')?.value.trim() || '';

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const companyName = getActiveCompanyName();

    // 1. Top Branded Header
    doc.setFillColor(0, 168, 132);
    doc.rect(0, 0, pageWidth, 55, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`${companyName.toUpperCase()} - CUSTOMERS DIRECTORY`, 30, 32);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Omnichannel Marketing & WhatsApp Business Platform', 30, 46);

    const nowFormatted = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    doc.setFontSize(8);
    doc.text(`Generated: ${nowFormatted}`, pageWidth - 30, 38, { align: 'right' });

    // 2. Filter Summary Banner
    doc.setFillColor(245, 247, 248);
    doc.roundedRect(30, 68, pageWidth - 60, 36, 4, 4, 'F');
    doc.setDrawColor(218, 222, 226);
    doc.roundedRect(30, 68, pageWidth - 60, 36, 4, 4, 'S');

    doc.setFontSize(8.5);
    const bannerY = 89;
    let currentX = 42;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 70, 80);
    doc.text('Filter Status:', currentX, bannerY);
    currentX += doc.getTextWidth('Filter Status:') + 5;

    const filterText = statusFilter !== 'all' ? statusFilter : 'All Statuses';
    doc.setFont('helvetica', 'bold');
    if (statusFilter === 'Open - Not Contacted') doc.setTextColor(37, 99, 235);
    else if (statusFilter === 'Working - Contacted') doc.setTextColor(217, 119, 6);
    else if (statusFilter === 'Closed - Not Converted') doc.setTextColor(100, 116, 139);
    else if (statusFilter === 'Converted') doc.setTextColor(5, 150, 105);
    else doc.setTextColor(0, 168, 132);

    doc.text(filterText, currentX, bannerY);
    currentX += doc.getTextWidth(filterText) + 16;

    if (searchQuery) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 70, 80);
        doc.text('Search:', currentX, bannerY);
        currentX += doc.getTextWidth('Search:') + 4;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 40, 50);
        const displayQuery = searchQuery.length > 20 ? searchQuery.slice(0, 18) + '...' : searchQuery;
        doc.text(`"${displayQuery}"`, currentX, bannerY);
    }

    const totalCountText = `${filteredCustomers.length} contact(s)`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const countWidth = doc.getTextWidth(totalCountText);
    const rightEdge = pageWidth - 42;

    doc.setTextColor(60, 70, 80);
    doc.text('Total Records: ', rightEdge - countWidth, bannerY, { align: 'right' });

    doc.setTextColor(0, 168, 132);
    doc.text(totalCountText, rightEdge, bannerY, { align: 'right' });

    // 3. Table Rows
    const tableData = filteredCustomers.map((c, index) => {
        const phoneFormatted = formatDisplayPhone(c.phone);
        const msgCount = `${c.message_count || 0} msgs`;
        const custStatus = c.status || 'Open - Not Contacted';
        const custDesc = (c.description || c.notes || '').slice(0, 140) || '-';

        return [
            index + 1,
            c.name || 'Customer',
            phoneFormatted,
            custStatus,
            custDesc,
            msgCount
        ];
    });

    doc.autoTable({
        startY: 116,
        head: [['S.No', 'Customer Name', 'Phone Number', 'Status', 'Conversation Notes', 'Messages']],
        body: tableData,
        theme: 'striped',
        margin: { left: 30, right: 30, bottom: 42 },
        styles: {
            fontSize: 8,
            cellPadding: 4.5,
            font: 'helvetica',
            textColor: [33, 37, 41],
            lineColor: [228, 232, 235],
            lineWidth: 0.5
        },
        headStyles: {
            fillColor: [0, 92, 75],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5,
            halign: 'left'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 251]
        },
        columnStyles: {
            0: { cellWidth: 26, halign: 'center' },
            1: { cellWidth: 105, fontStyle: 'bold' },
            2: { cellWidth: 90 },
            3: { cellWidth: 105, fontStyle: 'bold' },
            4: { cellWidth: 154 },
            5: { cellWidth: 55, halign: 'center' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 3) {
                const text = String(data.cell.raw || '');
                if (text.includes('Open')) {
                    data.cell.styles.textColor = [37, 99, 235];
                } else if (text.includes('Working')) {
                    data.cell.styles.textColor = [217, 119, 6];
                } else if (text.includes('Closed')) {
                    data.cell.styles.textColor = [100, 116, 139];
                } else if (text.includes('Converted')) {
                    data.cell.styles.textColor = [5, 150, 105];
                }
            }
        },
        didDrawPage: function(data) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(130, 140, 150);

            doc.setDrawColor(220, 224, 228);
            doc.setLineWidth(0.5);
            doc.line(30, pageHeight - 26, pageWidth - 30, pageHeight - 26);

            doc.text(`Powering WhatsApp & Omnichannel Marketing for ${companyName}`, 30, pageHeight - 14);
            const pageStr = `Page ${data.pageNumber}`;
            doc.text(pageStr, pageWidth - 30, pageHeight - 14, { align: 'right' });
        }
    });

    const prefix = companyName.replace(/[^a-zA-Z0-9]+/g, '_');
    const nowStr = new Date().toISOString().slice(0, 10);
    let filterSlug = 'all';
    if (statusFilter !== 'all') {
        filterSlug = statusFilter.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    } else if (searchQuery) {
        filterSlug = 'search_' + searchQuery.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 15);
    }
    const filename = `${prefix}_Customers_${filterSlug}_${tableData.length}_contacts_${nowStr}.pdf`;

    doc.save(filename);

    const filterDesc = statusFilter !== 'all' ? `status "${statusFilter}"` : (searchQuery ? `search "${searchQuery}"` : 'all contacts');
    showModal('PDF Export Successful', `Successfully generated PDF report with ${tableData.length} customer(s) based on ${filterDesc} to <strong>${filename}</strong>.`);
}

document.getElementById('btn-export-pdf')?.addEventListener('click', exportFilteredCustomersPdf);
document.getElementById('btn-export-pdf-toolbar')?.addEventListener('click', exportFilteredCustomersPdf);

