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



