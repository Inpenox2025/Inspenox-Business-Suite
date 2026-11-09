/**
 * ==========================================================================
 * BROADCASTCONTROLLER.JS - Broadcast Campaigns Controller (Audience Selection, 6h Quarantine & Progress Modal)
 * ==========================================================================
 * Manages outbound bulk broadcasting campaigns: audience selection by contact range and tag segmentation, automatic exclusion of contacts in Meta's 6-hour maturation quarantine, template & message type selection, cost estimation, and the live broadcast progress modal with animated SVG circular countdown and batch delivery engine.
 * 
 * Module Components:
 *  - Lines 7335 to 8671 in original app.js (Broadcast Campaign Setup, Customer Selection, Quarantine Filter, Message Configuration & Broadcast Progress Modal)
 * ==========================================================================
 */

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
        if (cb.disabled) {
            cb.checked = false;
            return;
        }
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
    let visibleEligibleCount = 0;
    const optionLabels = document.querySelectorAll('#bc-target-list .option-item');

    optionLabels.forEach(label => {
        const custId = label.getAttribute('data-id');
        const srNo = parseInt(label.getAttribute('data-sr'), 10) || 0;
        const isMaturing = label.getAttribute('data-maturing') === 'true';
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
            if (!isMaturing) visibleEligibleCount++;
        } else {
            label.style.display = 'none';
        }
    });

    const selectAllLabel = document.getElementById('bc-select-all-label');
    if (selectAllLabel) {
        if (activeBroadcastRangeFilter && activeBroadcastTagFilter) {
            selectAllLabel.textContent = `Select All with Tag "${activeBroadcastTagFilter}" in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end} (${visibleEligibleCount} ready)`;
        } else if (activeBroadcastRangeFilter) {
            selectAllLabel.textContent = `Select All in Range #${activeBroadcastRangeFilter.start}-#${activeBroadcastRangeFilter.end} (${visibleEligibleCount} ready)`;
        } else if (activeBroadcastTagFilter) {
            selectAllLabel.textContent = `Select All with Tag "${activeBroadcastTagFilter}" (${visibleEligibleCount} ready)`;
        } else if (searchVal) {
            selectAllLabel.textContent = `Select All Filtered (${visibleEligibleCount} ready)`;
        } else {
            const maturingTotal = visibleCount - visibleEligibleCount;
            selectAllLabel.textContent = `Select All Customers (${visibleEligibleCount} ready${maturingTotal > 0 ? `, ${maturingTotal} in quarantine` : ''})`;
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
    const list = document.getElementById('bc-target-list');
    if (list) list.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted);"><span class="spinner-icon" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Loading customer list...</div>';

    try {
        await loadTags();
        const res = await apiFetch('/api/customers');
        const customers = await res.json();

        if (customers.error) return;

        broadcastCustomersCache = Array.isArray(customers) ? customers : [];

        const list = document.getElementById('bc-target-list');
        if (list && Array.isArray(customers)) {
            list.innerHTML = '';

            let maturingCount = 0;
            customers.forEach((c) => {
                const matInfo = getCustomerMaturationInfo(c);
                if (matInfo.isMaturing) maturingCount++;
            });

            // Notice banner if there are quarantine contacts (<6h)
            let bannerEl = document.getElementById('bc-maturing-banner');
            if (maturingCount > 0) {
                if (!bannerEl) {
                    bannerEl = document.createElement('div');
                    bannerEl.id = 'bc-maturing-banner';
                    list.parentNode.insertBefore(bannerEl, list);
                }
                bannerEl.innerHTML = `
                    <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.28); border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.6rem; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; font-size: 0.78rem; color: #dc2626; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.15rem; line-height: 1;">🛡️</span>
                            <div><strong>${maturingCount} newly added contact(s) in 6-hour Quarantine:</strong> Broadcast permissions are temporarily suspended. Contacts unlock automatically once 6 hours elapse.</div>
                        </div>
                        <button type="button" class="btn secondary sm" onclick="openQuarantineInfoModal(event, '6 hours')" style="border-color: rgba(239, 68, 68, 0.35); color: #dc2626; font-size: 0.75rem; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; background: rgba(239, 68, 68, 0.06); cursor: pointer;">
                            <span>🛈</span> <span>Quarantine Policy</span>
                        </button>
                    </div>
                `;
            } else if (bannerEl) {
                bannerEl.remove();
            }

            customers.forEach((c, idx) => {
                const label = document.createElement('label');
                const srNo = idx + 1;
                const matInfo = getCustomerMaturationInfo(c);
                const isMaturing = matInfo.isMaturing;

                label.className = `option-item bc-customer-row ${isMaturing ? 'bc-cust-maturing' : ''}`;
                label.setAttribute('data-id', c.id);
                label.setAttribute('data-sr', srNo);
                if (isMaturing) {
                    label.setAttribute('data-maturing', 'true');
                }

                const outboundCount = parseInt(c.outbound_count || 0, 10);
                const isSent = outboundCount > 0;
                const tagsArr = c.tags ? c.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
                const pillsHtml = tagsArr.map(t => renderTagPillHtml(t)).join('');

                const checkboxHtml = isMaturing
                    ? `<input type="checkbox" class="bc-cust-cb" value="${c.id}" disabled title="Broadcasts unlock in ${matInfo.timeText} (Meta 6-hour contact quarantine policy)">`
                    : `<input type="checkbox" class="bc-cust-cb" value="${c.id}">`;

                const maturingBadgeHtml = isMaturing
                    ? `<span class="quarantine-badge sm" onmouseenter="showQuarantineTooltip(event, '${matInfo.timeText}')" onmouseleave="hideQuarantineTooltip()" title="In 6-hour Quarantine cooldown (${matInfo.timeText} left)">
                        <span>🛡️ Quarantine: ${matInfo.timeText}</span>
                        <button type="button" class="quarantine-info-btn" onclick="openQuarantineInfoModal(event, '${matInfo.timeText}')" title="Why is this contact in quarantine? Click to view policy">🛈</button>
                       </span>`
                    : '';

                label.innerHTML = `
                    <div class="bc-cust-left">
                        ${checkboxHtml}
                        <span class="bc-sr-badge" title="Customer Serial Number">#${srNo}</span>
                        <div class="bc-cust-meta">
                            <span class="bc-cust-name" title="${escapeHtml(c.name || 'Unnamed')}">${escapeHtml(c.name || 'Unnamed')}</span>
                            <span class="bc-cust-phone">(${escapeHtml(c.phone || '')})</span>
                        </div>
                    </div>
                    <div class="bc-cust-right">
                        ${maturingBadgeHtml}
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
                // Only toggle checkboxes of visible customers that are not disabled (maturing)
                document.querySelectorAll('#bc-target-list .option-item').forEach(item => {
                    if (item.style.display !== 'none') {
                        const cb = item.querySelector('.bc-cust-cb');
                        if (cb && !cb.disabled) cb.checked = isChecked;
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
                    if (cb.disabled) {
                        cb.checked = false;
                        return;
                    }
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

    if (!file) return;

    if (file.size > 16 * 1024 * 1024) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        showModal('File Size Exceeds 16 MB Limit', `The selected file "${escapeHtml(file.name)}" is ${sizeMb} MB. Meta allows media files up to 16 MB. Please select a file under 16 MB.`);
        e.target.value = '';
        const dropzoneText = document.getElementById('dropzone-text');
        if (dropzoneText) dropzoneText.textContent = 'Drag and drop or browse';
        return;
    }

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

// Upload sample media with live percentage streaming, allowing videos up to 16 MB
// Obtains Meta Resumable Upload handle (header_handle) for Template Header sample media
function getMetaHeaderHandle(file, onProgress) {
    if (!file) return Promise.resolve(null);

    const MAX_SAMPLE_SIZE = 16 * 1024 * 1024; // 16 MB Meta Limit
    if (file.size > MAX_SAMPLE_SIZE) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        return Promise.reject(new Error(`File "${file.name}" is ${sizeMb} MB. Meta allows sample videos/media up to 16 MB.`));
    }

    const mimeType = file.type || (file.name && file.name.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');

    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', file.name);
        formData.append('mimeType', mimeType);
        const compId = (typeof getCompanyId === 'function' ? getCompanyId() : null) || '';
        if (compId) {
            formData.append('company_id', compId);
        }

        const xhr = new XMLHttpRequest();
        const url = `/api/upload-media${compId ? '?company_id=' + encodeURIComponent(compId) : ''}`;
        xhr.open('POST', url);

        if (xhr.upload && onProgress) {
            onProgress(0);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
                    onProgress(percent);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const res = JSON.parse(xhr.responseText);
                    if (res && res.error) {
                        reject(new Error(res.error));
                    } else if (res && (res.handle || res.media_id)) {
                        if (onProgress) onProgress(100);
                        resolve(res.handle || res.media_id);
                    } else {
                        reject(new Error("No handle returned by upload server."));
                    }
                } catch (e) {
                    reject(new Error("Invalid response from upload server"));
                }
            } else {
                try {
                    const res = JSON.parse(xhr.responseText);
                    reject(new Error(res.error || `Upload failed with status ${xhr.status}`));
                } catch (e) {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            }
        };

        xhr.onerror = () => reject(new Error("Network error during media upload. Please check your connection."));
        xhr.send(formData);
    });
}

// Fast Binary Streaming Upload to Meta Cloud API with Live Progress
function uploadMediaToMetaFast(file, config, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://graph.facebook.com/v21.0/${config.meta_phone_id}/media`);
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

        // 🔒 Meta WhatsApp Delivery Protection: Filter out contacts under 6-hour contact maturation cooldown
        const initialSelectedCount = targetList.length;
        targetList = targetList.filter(c => {
            const matInfo = getCustomerMaturationInfo(c);
            return !matInfo.isMaturing;
        });

        if (targetList.length === 0 && initialSelectedCount > 0) {
            throw new Error("All selected contact(s) were added within the last 6 hours. Per Meta WhatsApp guidelines, newly added numbers require a 6-hour maturation delay before receiving broadcasts.");
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
                const senderPhoneSelect = document.getElementById('bc-sender-phone-select');
                const senderPhoneId = senderPhoneSelect?.value || null;
                const senderPhoneText = senderPhoneSelect && senderPhoneSelect.selectedIndex >= 0 
                    ? senderPhoneSelect.options[senderPhoneSelect.selectedIndex].text 
                    : '';

                let currentUser = {};
                try { currentUser = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch(e){}
                const initiatedBy = currentUser.username || currentUser.email || 'Admin';

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
                        sender_phone: senderPhoneText,
                        initiated_by: initiatedBy,
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

