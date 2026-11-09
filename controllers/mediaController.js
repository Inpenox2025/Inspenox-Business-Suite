/**
 * ==========================================================================
 * MEDIACONTROLLER.JS - Media Asset Library Controller (Uploads, S3/CDN Storage & HTTPS Link Generator)
 * ==========================================================================
 * Manages the workspace media asset library: uploading files (images, PDFs, documents, brochures, videos), generating public HTTPS URLs for template sample headers and broadcast media attachments, media search, and copy-link utilities.
 * 
 * Module Components:
 *  - Lines 11341 to 11774 in original app.js (Media Library Grid, File Uploads, URL Copy & Asset Preview)
 * ==========================================================================
 */

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

    if (file.size > 16 * 1024 * 1024) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        showModal('File Size Exceeds 16 MB Limit', `The selected file "${escapeHtml(file.name)}" is ${sizeMb} MB. Meta allows media files up to 16 MB. Please select a file under 16 MB.`);
        e.target.value = '';
        return;
    }

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
        tbody.innerHTML = renderTableEmptyStateHtml(6, 'No security attempt logs found', 'All workspace login and authorization activity will be logged here.', '🛡️');
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

