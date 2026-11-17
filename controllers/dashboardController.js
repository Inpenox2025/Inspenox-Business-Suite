/**
 * ==========================================================================
 * DASHBOARDCONTROLLER.JS - Dashboard Analytics Controller (KPIs, Message Volumes & Quick Shortcuts)
 * ==========================================================================
 * Renders the central analytics dashboard, fetches real-time message broadcast statistics, delivery and read rate metrics, active contact counts, growth trends, and quick-action navigation shortcuts.
 * 
 * Module Components:
 *  - Lines 4754 to 4908 in original app.js (Dashboard Analytics Loader, Broadcast KPIs, Delivery Stats & Action Cards)
 * ==========================================================================
 */

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

        // Load Assigned Work & Leads Tracker Table
        if (typeof loadAssignedWorkTable === 'function') {
            loadAssignedWorkTable();
        }
    } catch (e) {
        console.error('Error loading dashboard analytics:', e);
    }
};

let allAssignedLeadsList = [];

function getLoggedInUser() {
    try {
        return JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}');
    } catch(e) {
        return {};
    }
}

window.loadAssignedWorkTable = async function loadAssignedWorkTable() {
    const tbody = document.getElementById('dash-assigned-tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; padding:1.75rem;">
                <div class="loading-spinner-container">
                    <div class="spinner-icon"></div>
                    <span>Loading assigned workspace leads...</span>
                </div>
            </td>
        </tr>
    `;

    try {
        const coId = (typeof getCompanyId === 'function') ? getCompanyId() : null;
        let url = '/api/customers';
        if (coId && coId !== 'default' && coId !== 'parent') {
            url = `/api/customers?company_id=${coId}`;
        }
        const res = await apiFetch(url);
        const customers = await res.json();

        if (Array.isArray(customers)) {
            allAssignedLeadsList = customers;
            filterAssignedWorkTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No leads found for this workspace.</td></tr>`;
        }
    } catch (err) {
        console.error('Error loading assigned leads table:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--error);">Failed to load assigned leads.</td></tr>`;
    }
};

window.filterAssignedWorkTable = function filterAssignedWorkTable() {
    const tbody = document.getElementById('dash-assigned-tbody');
    if (!tbody) return;

    const filter = document.getElementById('dash-assigned-filter')?.value || 'my';
    const curUser = getLoggedInUser();
    const myUname = (curUser.username || '').toLowerCase();
    const myUid = curUser.id;

    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    let filtered = (allAssignedLeadsList || []).filter(c => {
        const hasAssignee = Boolean(c.assigned_to || c.assigned_user_id);
        const isMine = (c.assigned_to && c.assigned_to.toLowerCase() === myUname) ||
                       (c.assigned_user_id && String(c.assigned_user_id) === String(myUid));

        if (filter === 'my') {
            return isMine;
        } else if (filter === 'unassigned') {
            return !hasAssignee;
        } else {
            return hasAssignee;
        }
    });

    if (filter === 'all' && filtered.length === 0 && allAssignedLeadsList.length > 0) {
        filtered = [...allAssignedLeadsList];
    }

    filtered.sort((a, b) => {
        const timeA = new Date(a.last_message_at || a.last_inbound_at || a.created_at || 0).getTime();
        const timeB = new Date(b.last_message_at || b.last_inbound_at || b.created_at || 0).getTime();
        return timeB - timeA;
    });

    let totalAssigned = 0;
    let active24h = 0;
    let pendingAction = 0;
    let converted = 0;

    filtered.forEach(c => {
        totalAssigned++;
        const is24h = c.last_inbound_at && (now - new Date(c.last_inbound_at).getTime() <= twentyFourHoursMs);
        if (is24h) active24h++;
        const st = c.status || 'Open - Not Contacted';
        if (st === 'Converted') converted++;
        if (st === 'Open - Not Contacted' || (parseInt(c.unread_count) > 0)) pendingAction++;
    });

    const elTotal = document.getElementById('dash-assigned-stat-total');
    const elActive = document.getElementById('dash-assigned-stat-active');
    const elPending = document.getElementById('dash-assigned-stat-pending');
    const elConverted = document.getElementById('dash-assigned-stat-converted');

    if (elTotal) elTotal.textContent = totalAssigned;
    if (elActive) elActive.textContent = active24h;
    if (elPending) elPending.textContent = pendingAction;
    if (elConverted) elConverted.textContent = converted;

    if (filtered.length === 0) {
        let emptyMsg = filter === 'my'
            ? 'No leads currently assigned to you. Select "All Team Leads" or "Unassigned Leads" to view others.'
            : (filter === 'unassigned' ? 'No unassigned leads found in this workspace.' : 'No assigned leads found.');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">
                    <div style="font-size:1.75rem; margin-bottom:0.4rem;">📋</div>
                    <div style="font-weight:600; font-size:0.9rem; color:var(--text-main); margin-bottom:0.25rem;">${emptyMsg}</div>
                    <button class="btn secondary sm" style="margin-top:0.5rem;" onclick="switchView('inbox')">Go to Live Inbox →</button>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach((c, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';

        const is24h = c.last_inbound_at && (now - new Date(c.last_inbound_at).getTime() <= twentyFourHoursMs);
        const windowBadgeHtml = is24h
            ? `<span class="window-badge active" style="font-size:0.7rem; padding:0.15rem 0.45rem;">⚡ 24h Active</span>`
            : `<span class="window-badge expired" style="font-size:0.7rem; padding:0.15rem 0.45rem;">🔒 Expired</span>`;

        const custStatus = c.status || 'Open - Not Contacted';
        const statusKey = (typeof getStatusKey === 'function') ? getStatusKey(custStatus) : 'open';

        const assigneeHtml = c.assigned_to
            ? `<span class="badge-assignee">👤 ${escapeHtml(c.assigned_to)}</span>`
            : `<span class="badge-assignee unassigned">⚪ Unassigned</span>`;

        let preview = c.last_message_content || 'No messages yet';
        if (preview.startsWith('[Template]')) {
            preview = '📋 ' + preview.replace(/^\[Template\]\s*/i, '');
        } else if (preview.length > 32) {
            preview = preview.slice(0, 32) + '...';
        }
        const timeStr = (c.last_message_at || c.last_inbound_at) ? formatTime(c.last_message_at || c.last_inbound_at) : '-';

        let tagsHtml = '';
        if (c.tags && String(c.tags).trim()) {
            const firstTag = String(c.tags).split(',')[0].trim();
            tagsHtml = `<span style="font-size:0.65rem; background:rgba(0,168,132,0.1); color:var(--primary); padding:0.1rem 0.35rem; border-radius:4px; margin-left:0.3rem;">🏷️ ${escapeHtml(firstTag)}</span>`;
        }

        tr.innerHTML = `
            <td style="padding:0.65rem 0.75rem; color:var(--text-muted); font-size:0.8rem; font-weight:600;">${idx + 1}</td>
            <td style="padding:0.65rem 0.75rem;">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <div style="width:30px; height:30px; border-radius:50%; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.75rem; flex-shrink:0;">
                        ${getInitial(c.name)}
                    </div>
                    <div>
                        <div style="font-weight:600; font-size:0.85rem; color:var(--text-main); display:flex; align-items:center;">
                            <span>${escapeHtml(c.name || 'Unnamed Lead')}</span>
                            ${tagsHtml}
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${formatDisplayPhone(c.phone)}</div>
                    </div>
                </div>
            </td>
            <td style="padding:0.65rem 0.75rem;">${assigneeHtml}</td>
            <td style="padding:0.65rem 0.75rem;">
                <select class="chat-header-status-select status-${statusKey}" style="font-size:0.75rem; padding:0.25rem 0.5rem; height:auto;" onchange="updateLeadStatusFromDash('${c.id}', this.value)">
                    <option value="Open - Not Contacted" ${custStatus === 'Open - Not Contacted' ? 'selected' : ''}>🔵 Open</option>
                    <option value="Working - Contacted" ${custStatus === 'Working - Contacted' ? 'selected' : ''}>🟡 Working</option>
                    <option value="Closed - Not Converted" ${custStatus === 'Closed - Not Converted' ? 'selected' : ''}>⚪ Closed</option>
                    <option value="Converted" ${custStatus === 'Converted' ? 'selected' : ''}>🟢 Converted</option>
                </select>
            </td>
            <td style="padding:0.65rem 0.75rem;">${windowBadgeHtml}</td>
            <td style="padding:0.65rem 0.75rem; max-width:200px;">
                <div style="font-size:0.775rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(preview)}</div>
                <div style="font-size:0.675rem; color:var(--text-muted);">${timeStr}</div>
            </td>
            <td style="padding:0.65rem 0.75rem; text-align:right;">
                <button type="button" class="btn primary sm" onclick="openChatFromLead('${c.id}')" style="display:inline-flex; align-items:center; gap:0.35rem; padding:0.35rem 0.65rem; font-size:0.75rem; white-space:nowrap;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Track &amp; Chat →</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.updateLeadStatusFromDash = async function updateLeadStatusFromDash(customerId, newStatus) {
    try {
        const res = await apiFetch('/api/customers', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: customerId, status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            const found = (allAssignedLeadsList || []).find(c => String(c.id) === String(customerId));
            if (found) found.status = newStatus;
            filterAssignedWorkTable();
            if (typeof showToast === 'function') {
                showToast(`Status updated to "${newStatus}"`, 'success');
            }
        }
    } catch (e) {
        console.error('Failed to update lead status from dashboard:', e);
    }
};

window.openChatFromLead = function openChatFromLead(customerId) {
    if (typeof switchView === 'function') {
        switchView('inbox');
    }
    setTimeout(async () => {
        let cust = null;
        if (typeof inboxCustomersList !== 'undefined' && Array.isArray(inboxCustomersList)) {
            cust = inboxCustomersList.find(c => String(c.id) === String(customerId));
        }
        if (!cust) {
            try {
                const res = await apiFetch(`/api/customers?id=${customerId}`);
                const data = await res.json();
                cust = Array.isArray(data) ? data.find(c => String(c.id) === String(customerId)) : data;
            } catch (e) { }
        }
        if (cust && typeof openChat === 'function') {
            openChat(cust);
        }
    }, 280);
};

window.exportAssignedWorkPdf = async function exportAssignedWorkPdf() {
    let list = allAssignedLeadsList;
    if (!list || list.length === 0) {
        try {
            const coId = (typeof getCompanyId === 'function') ? getCompanyId() : null;
            let url = '/api/customers';
            if (coId && coId !== 'default' && coId !== 'parent') url = `/api/customers?company_id=${coId}`;
            const res = await apiFetch(url);
            list = await res.json();
            if (Array.isArray(list)) allAssignedLeadsList = list;
        } catch(e) {}
    }

    if (!list || list.length === 0) {
        if (typeof showModal === 'function') {
            showModal('No Leads to Export', 'There are no customer leads available in this workspace to generate a report.');
        } else {
            alert('No customer leads available to export.');
        }
        return;
    }

    const filter = document.getElementById('dash-assigned-filter')?.value || 'my';
    const curUser = getLoggedInUser();
    const myUname = (curUser.username || '').toLowerCase();
    const myUid = curUser.id;

    let targetRows = list.filter(c => {
        const hasAssignee = Boolean(c.assigned_to || c.assigned_user_id);
        const isMine = (c.assigned_to && c.assigned_to.toLowerCase() === myUname) ||
                       (c.assigned_user_id && String(c.assigned_user_id) === String(myUid));
        if (filter === 'my') return isMine;
        if (filter === 'unassigned') return !hasAssignee;
        return hasAssignee;
    });

    if (targetRows.length === 0) {
        targetRows = [...list];
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        if (typeof showModal === 'function') {
            showModal('Loading PDF Generator', 'Downloading PDF generator library, please wait a moment...');
        }
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
            if (typeof showModal === 'function') {
                showModal('PDF Error', 'Failed to load PDF library. Please check your internet connection.');
            }
            return;
        }
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const companyName = (typeof getStoredCompany === 'function' && getStoredCompany()?.name) ? getStoredCompany().name : (document.getElementById('nav-company-name')?.textContent || 'Inspenox');

    // 1. Top Branded Header
    doc.setFillColor(0, 168, 132);
    doc.rect(0, 0, pageWidth, 55, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`${companyName.toUpperCase()} - CUSTOMERS DIRECTORY`, 30, 32);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('WhatsApp Business Marketing Platform', 30, 46);

    const nowFormatted = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
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

    const filterText = filter === 'my' ? 'My Assigned Leads' : (filter === 'unassigned' ? 'Unassigned Leads' : 'All Leads');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 168, 132);
    doc.text(filterText, currentX, bannerY);

    const totalCountText = `${targetRows.length} contact(s)`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const countWidth = doc.getTextWidth(totalCountText);
    const rightEdge = pageWidth - 42;

    doc.setTextColor(60, 70, 80);
    doc.text('Total Records: ', rightEdge - countWidth, bannerY, { align: 'right' });

    doc.setTextColor(0, 168, 132);
    doc.text(totalCountText, rightEdge, bannerY, { align: 'right' });

    // 3. Table Rows with Handled By and Status on the right side
    const tableData = targetRows.map((c, index) => {
        const phoneFormatted = (typeof formatDisplayPhone === 'function') ? formatDisplayPhone(c.phone) : (c.phone || '-');
        const msgCount = `${c.message_count || 0} msgs`;
        const custStatus = c.status || 'Open - Not Contacted';
        const assignedPerson = c.assigned_to || c.assigned_by || 'Unassigned';
        const productVal = (c.product && String(c.product).trim()) ? String(c.product).trim() : '-';
        const custDesc = (c.description || c.notes || '').slice(0, 140) || '-';

        return [
            index + 1,
            c.name || 'Customer',
            phoneFormatted,
            assignedPerson,
            productVal,
            custDesc,
            msgCount,
            custStatus
        ];
    });

    doc.autoTable({
        startY: 116,
        head: [['S.No', 'Customer Name', 'Phone Number', 'Handled / Assigned To', 'Product', 'Conversation Notes', 'Messages', 'Status']],
        body: tableData,
        theme: 'striped',
        margin: { left: 30, right: 30, bottom: 42 },
        styles: {
            fontSize: 7.5,
            cellPadding: 4,
            font: 'helvetica',
            textColor: [33, 37, 41],
            lineColor: [228, 232, 235],
            lineWidth: 0.5
        },
        headStyles: {
            fillColor: [0, 92, 75],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 251]
        },
        columnStyles: {
            0: { cellWidth: 24, halign: 'center' },
            1: { cellWidth: 84, fontStyle: 'bold' },
            2: { cellWidth: 76 },
            3: { cellWidth: 76, fontStyle: 'bold' },
            4: { cellWidth: 54 },
            5: { cellWidth: 108 },
            6: { cellWidth: 46, halign: 'center' },
            7: { cellWidth: 67, fontStyle: 'bold', halign: 'center' }
        },
        didParseCell: function(data) {
            // Column 7 is Status (right end)
            if (data.section === 'body' && data.column.index === 7) {
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
    const filename = `${prefix}_Leads_Report_${filter}_${tableData.length}_records_${nowStr}.pdf`;

    doc.save(filename);

    if (typeof showModal === 'function') {
        showModal('PDF Report Downloaded', `Successfully generated PDF leads report with ${tableData.length} customer records to <strong>${filename}</strong>.`);
    }
};

window.exportAssignedWorkExcel = function exportAssignedWorkExcel() {
    let list = allAssignedLeadsList;
    if (!list || list.length === 0) {
        if (typeof showModal === 'function') {
            showModal('No Leads to Export', 'There are no leads available to export.');
        } else {
            alert('No leads available to export.');
        }
        return;
    }

    const filter = document.getElementById('dash-assigned-filter')?.value || 'my';
    const curUser = getLoggedInUser();
    const myUname = (curUser.username || '').toLowerCase();
    const myUid = curUser.id;

    let targetRows = list.filter(c => {
        const hasAssignee = Boolean(c.assigned_to || c.assigned_user_id);
        const isMine = (c.assigned_to && c.assigned_to.toLowerCase() === myUname) ||
                       (c.assigned_user_id && String(c.assigned_user_id) === String(myUid));
        if (filter === 'my') return isMine;
        if (filter === 'unassigned') return !hasAssignee;
        return hasAssignee;
    });

    if (targetRows.length === 0) targetRows = [...list];

    const exportRows = targetRows.map((c, index) => {
        const cleanPhone = (typeof formatIndiaPhone === 'function') ? formatIndiaPhone(c.phone) : c.phone;
        const createdDate = c.created_at ? new Date(c.created_at).toLocaleDateString() : '';
        const lastMsgTime = c.last_message_at ? new Date(c.last_message_at).toLocaleString() : 'No messages';

        return {
            "Sr No": index + 1,
            "Customer Name": c.name || "Customer",
            "Phone Number": cleanPhone,
            "Display Phone": (typeof formatDisplayPhone === 'function') ? formatDisplayPhone(c.phone) : c.phone,
            "Handled / Assigned To": c.assigned_to || c.assigned_by || "Unassigned",
            "Product": (c.product && String(c.product).trim()) ? String(c.product).trim() : "-",
            "Conversation Notes": c.description || c.notes || "",
            "Email": c.email || "",
            "Company": c.company_name || "",
            "Messages Count": parseInt(c.message_count, 10) || 0,
            "Date Added": createdDate,
            "Last Conversation Activity": lastMsgTime,
            "Status": c.status || "Open - Not Contacted"
        };
    });

    if (typeof XLSX === 'undefined') {
        alert('Excel library not loaded.');
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assigned Leads");

    worksheet['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 24 }, // Customer Name
        { wch: 16 }, // Phone Number
        { wch: 18 }, // Display Phone
        { wch: 22 }, // Assigned / Handled By
        { wch: 18 }, // Product
        { wch: 35 }, // Notes
        { wch: 24 }, // Email
        { wch: 20 }, // Company
        { wch: 16 }, // Messages Count
        { wch: 14 }, // Date Added
        { wch: 26 }, // Last Activity
        { wch: 22 }  // Status (end)
    ];

    const companyName = (typeof getStoredCompany === 'function' && getStoredCompany()?.name) ? getStoredCompany().name : (document.getElementById('nav-company-name')?.textContent || 'Inspenox');
    const prefix = companyName.replace(/[^a-zA-Z0-9]+/g, '_');
    const nowStr = new Date().toISOString().slice(0, 10);
    const filename = `${prefix}_Leads_${filter}_${exportRows.length}_records_${nowStr}.xlsx`;

    XLSX.writeFile(workbook, filename);

    if (typeof showModal === 'function') {
        showModal('Export Successful', `Successfully exported ${exportRows.length} lead(s) to <strong>${filename}</strong>.`);
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



