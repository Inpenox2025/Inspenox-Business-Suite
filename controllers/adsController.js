/**
 * Inspenox Business Suite - Meta Ads Controller
 * Supports Click-to-WhatsApp (CTWA), Instagram DMs, Messenger & Lead Gen Ads
 * With Direct Meta Billing (0% platform fees) & Closed-Loop ROAS Analytics
 */

(function () {
    let adsList = [];
    let adsAssets = null;
    let currentAdStep = 1;
    let previewPlatform = 'facebook'; // 'facebook' or 'instagram'

    let currentAdForm = {
        name: '',
        ad_account_id: '',
        page_id: '',
        instagram_actor_id: '',
        destination_type: 'WHATSAPP',
        whatsapp_phone_number: '',
        whatsapp_phone_number_id: '',
        headline: 'Chat with us on WhatsApp',
        primary_text: '',
        icebreaker_message: 'Hi, I saw your ad on Facebook/Instagram and want to know more about your offerings!',
        media_url: '',
        media_type: 'image',
        daily_budget: 1000,
        currency: 'INR',
        placements: ['facebook_feed', 'instagram_feed', 'instagram_stories'],
        targeting: {
            country: 'IN',
            age_min: 18,
            age_max: 65,
            gender: 'ALL',
            interests: ''
        }
    };

    function getActiveCompanyId() {
        try {
            const coId = localStorage.getItem('inspenox_company_id');
            if (coId && coId !== 'default' && coId !== 'parent') return coId;
            const u = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}');
            if (u.company_id && String(u.company_id) !== 'default' && String(u.company_id) !== 'parent') return String(u.company_id);
        } catch(e) {}
        return '1';
    }

    // =========================================================================
    // 1. LOAD ADS DASHBOARD & METRICS
    // =========================================================================
    async function loadAds() {
        const coId = getActiveCompanyId();
        const container = document.getElementById('ads-table-body');
        const summarySpend = document.getElementById('ad-metric-spend');
        const summaryClicks = document.getElementById('ad-metric-clicks');
        const summaryLeads = document.getElementById('ad-metric-leads');
        const summaryConverted = document.getElementById('ad-metric-converted');
        const summaryRoas = document.getElementById('ad-metric-roas');

        if (container) {
            container.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted);"><div class="spinner sm" style="margin: 0 auto 0.5rem auto;"></div>Loading Meta Ads campaigns & real-time analytics...</td></tr>`;
        }

        try {
            const res = await apiFetch(`/api/ads?company_id=${coId}`);
            const data = await res.json();

            if (data && data.success) {
                adsList = data.ads || [];
                window.adsList = adsList;

                // Update Executive KPI Cards
                const s = data.summary || {};
                if (summarySpend) summarySpend.textContent = `₹${(s.total_spend || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (summaryClicks) summaryClicks.textContent = `${(s.total_clicks || 0).toLocaleString('en-IN')} clicks`;
                if (summaryLeads) summaryLeads.textContent = `${(s.total_inbound_leads || 0).toLocaleString('en-IN')} leads`;
                if (summaryConverted) summaryConverted.textContent = `${s.total_sales_converted || 0} (${s.overall_conversion_rate || 0}%)`;
                if (summaryRoas) summaryRoas.textContent = `${s.overall_roas || 0}x ROAS`;

                // Update Billing Account Health
                updateBillingHealthBanner();

                renderAdsTable(adsList);
            } else {
                if (container) container.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--error);">Failed to load ads: ${escapeHTML(data.error || 'Server error')}</td></tr>`;
            }
        } catch(err) {
            console.error('Error loading ads:', err);
            if (container) container.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--error);">Error connecting to Meta Ads API: ${escapeHTML(err.message)}</td></tr>`;
        }
    }
    window.loadAds = loadAds;

    function updateBillingHealthBanner() {
        const banner = document.getElementById('ads-billing-status-banner');
        if (!banner) return;
        banner.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; width:100%;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div style="width:36px; height:36px; border-radius:8px; background:rgba(16,185,129,0.15); display:flex; align-items:center; justify-content:center; color:#10b981; font-size:1.2rem;">💳</div>
                    <div>
                        <div style="font-weight:700; font-size:0.9rem; color:var(--text-main); display:flex; align-items:center; gap:0.5rem;">
                            Direct Meta Ad Billing: Active 
                            <span style="background:rgba(16,185,129,0.2); color:#10b981; font-size:0.65rem; padding:2px 8px; border-radius:10px; font-weight:700;">0% Platform Fees</span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                            Meta directly charges the payment method (Credit/Debit/UPI) linked to your Ad Account. Inspenox never deducts ad spend.
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    <a href="https://adsmanager.facebook.com/adsmanager/manage/billing" target="_blank" rel="noopener noreferrer" class="btn secondary sm" style="font-size:0.75rem; gap:4px; text-decoration:none;">
                        Manage Card / UPI on Meta ↗
                    </a>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // 2. RENDER ADS TABLE
    // =========================================================================
    function renderAdsTable(ads) {
        const container = document.getElementById('ads-table-body');
        if (!container) return;

        if (!ads || ads.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 3.5rem 1rem;">
                        <div style="max-width: 420px; margin: 0 auto;">
                            <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; margin: 0 auto 1rem auto;">📢</div>
                            <h3 style="margin-bottom: 0.4rem; font-size: 1.1rem; color: var(--text-main);">No Meta Ad Campaigns Yet</h3>
                            <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.25rem;">
                                Launch your first Click-to-WhatsApp or Instagram DM ad to drive verified inbound customer conversations straight into your Inbox.
                            </p>
                            <button class="btn primary sm" onclick="openCreateAdModal()" style="font-weight: 700; gap: 6px;">
                                <span>+ Create Your First Meta Ad</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = ads.map(ad => {
            const isPaused = (ad.status === 'PAUSED');
            const statusBadge = isPaused
                ? `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">⏸ Paused</span>`
                : `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🟢 Active</span>`;

            let destIcon = '💬';
            let destLabel = 'WhatsApp (CTWA)';
            if (ad.destination_type === 'INSTAGRAM_DIRECT') { destIcon = '📸'; destLabel = 'Instagram DM'; }
            else if (ad.destination_type === 'MESSENGER') { destIcon = '🔵'; destLabel = 'Messenger'; }
            else if (ad.destination_type === 'INSTANT_FORM') { destIcon = '📋'; destLabel = 'Lead Form'; }
            else if (ad.destination_type === 'WEBSITE') { destIcon = '🌐'; destLabel = 'Website Link'; }

            const phoneDisplay = ad.whatsapp_phone_number ? `+${ad.whatsapp_phone_number}` : (ad.destination_type === 'WHATSAPP' ? 'Verified WABA' : '');

            return `
                <tr data-ad-id="${ad.id}">
                    <td style="padding: 1rem 0.85rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 44px; height: 44px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border); overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                                ${ad.media_url ? `<img src="${escapeHTML(ad.media_url)}" alt="${escapeHTML(ad.name)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='/assets/images/favicon.png'"/>` : '📢'}
                            </div>
                            <div style="min-width: 0;">
                                <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;" title="${escapeHTML(ad.name)}">
                                    ${escapeHTML(ad.name)}
                                </div>
                                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                                    ID: <span style="font-family: monospace;">${escapeHTML(String(ad.meta_ad_id || '').slice(0, 16))}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 1rem 0.85rem;">
                        <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-main); display: flex; align-items: center; gap: 4px;">
                            <span>${destIcon}</span>
                            <span>${destLabel}</span>
                        </div>
                        ${phoneDisplay ? `<div style="font-size: 0.72rem; color: #10b981; font-weight: 600; margin-top: 2px;">${escapeHTML(phoneDisplay)}</div>` : ''}
                    </td>
                    <td style="padding: 1rem 0.85rem;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">
                            ₹${parseFloat(ad.daily_budget || 0).toLocaleString('en-IN')}<span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">/day</span>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                            Spent: ₹${parseFloat(ad.spend || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                    </td>
                    <td style="padding: 1rem 0.85rem;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">
                            ${(ad.clicks || 0).toLocaleString('en-IN')} <span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">clicks</span>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                            CPC: ₹${ad.cpc || '0.00'}
                        </div>
                    </td>
                    <td style="padding: 1rem 0.85rem;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: #10b981; display:flex; align-items:center; gap:4px;">
                            <span>💬</span>
                            <span>${(ad.inbound_leads_count || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                            CPL: ₹${ad.cpl || '0.00'}
                        </div>
                    </td>
                    <td style="padding: 1rem 0.85rem;">
                        <div style="font-weight: 700; font-size: 0.85rem; color: #3b82f6;">
                            ${ad.sales_converted_count || 0} deals
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                            Conv: <b>${ad.conversion_rate || '0.0'}%</b>
                        </div>
                    </td>
                    <td style="padding: 1rem 0.85rem;">
                        <div style="font-weight: 800; font-size: 0.9rem; color: ${parseFloat(ad.roas || 0) >= 1 ? '#10b981' : 'var(--text-muted)'};">
                            ${ad.roas || '0.0'}x
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                            ₹${parseFloat(ad.total_revenue || 0).toLocaleString('en-IN')}
                        </div>
                    </td>
                    <td style="padding: 1rem 0.85rem; text-align: right;">
                        <div style="display: inline-flex; align-items: center; gap: 0.5rem;">
                            <button class="btn sm secondary" onclick="toggleAdStatus(${ad.id}, '${ad.status}')" style="font-size: 0.72rem; padding: 0.3rem 0.6rem;">
                                ${isPaused ? '▶ Resume' : '⏸ Pause'}
                            </button>
                            <button class="icon-btn sm" onclick="deleteAd(${ad.id})" title="Delete Ad" style="color: var(--error);">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // =========================================================================
    // 3. TOGGLE & DELETE ACTIONS
    // =========================================================================
    async function toggleAdStatus(id, currentStatus) {
        const newStatus = (currentStatus === 'ACTIVE') ? 'PAUSED' : 'ACTIVE';
        try {
            const res = await apiFetch('/api/ads?action=toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus, company_id: getActiveCompanyId() })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Campaign ${newStatus === 'ACTIVE' ? 'resumed' : 'paused'} successfully!`, 'success');
                loadAds();
            } else {
                showToast(data.error || 'Failed to update ad status', 'error');
            }
        } catch(e) {
            showToast('Error toggling ad status: ' + e.message, 'error');
        }
    }
    window.toggleAdStatus = toggleAdStatus;

    async function deleteAd(id) {
        if (!confirm('Are you sure you want to delete this ad campaign from tracking?')) return;
        try {
            const res = await apiFetch('/api/ads?action=delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, company_id: getActiveCompanyId() })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Ad campaign removed.', 'info');
                loadAds();
            } else {
                showToast(data.error || 'Failed to delete ad', 'error');
            }
        } catch(e) {
            showToast('Error deleting ad: ' + e.message, 'error');
        }
    }
    window.deleteAd = deleteAd;

    // Filter table by search & status
    function filterAdsTable() {
        const query = (document.getElementById('ads-search-input')?.value || '').toLowerCase().trim();
        const statusFilter = document.getElementById('ads-status-filter')?.value || 'ALL';
        const destFilter = document.getElementById('ads-dest-filter')?.value || 'ALL';

        const filtered = (adsList || []).filter(ad => {
            const matchesQuery = !query || (ad.name || '').toLowerCase().includes(query) || String(ad.meta_ad_id || '').includes(query);
            const matchesStatus = (statusFilter === 'ALL') || (ad.status === statusFilter);
            const matchesDest = (destFilter === 'ALL') || (ad.destination_type === destFilter);
            return matchesQuery && matchesStatus && matchesDest;
        });

        renderAdsTable(filtered);
    }
    window.filterAdsTable = filterAdsTable;

    // =========================================================================
    // 4. 5-STEP CREATE AD MODAL & LIVE PHONE MOCKUP
    // =========================================================================
    async function openCreateAdModal() {
        const modal = document.getElementById('create-ad-modal');
        if (!modal) return;

        currentAdStep = 1;
        setAdStep(1);

        // Reset form
        currentAdForm = {
            name: '',
            ad_account_id: '',
            page_id: '',
            instagram_actor_id: '',
            destination_type: 'WHATSAPP',
            whatsapp_phone_number: '',
            whatsapp_phone_number_id: '',
            headline: 'Chat with us on WhatsApp',
            primary_text: '',
            icebreaker_message: 'Hi! I saw your ad on Facebook/Instagram and want to know more about your offerings.',
            media_url: '',
            media_type: 'image',
            daily_budget: 1000,
            currency: 'INR',
            placements: ['facebook_feed', 'instagram_feed', 'instagram_stories'],
            targeting: {
                country: 'IN',
                age_min: 18,
                age_max: 65,
                gender: 'ALL',
                interests: ''
            }
        };

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Load Meta assets
        await loadAdAssets();
        updateAdLivePreview();
    }
    window.openCreateAdModal = openCreateAdModal;

    function closeCreateAdModal() {
        const modal = document.getElementById('create-ad-modal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    window.closeCreateAdModal = closeCreateAdModal;

    async function loadAdAssets() {
        const coId = getActiveCompanyId();
        try {
            const res = await apiFetch(`/api/ads?action=assets&company_id=${coId}`);
            const data = await res.json();
            if (data.success) {
                adsAssets = data;
                populateAssetDropdowns(data);
            }
        } catch(e) {
            console.warn('Assets loading warning:', e.message);
        }
    }

    function populateAssetDropdowns(assets) {
        // 1. Ad Accounts Dropdown
        const adAccSelect = document.getElementById('ad-form-account');
        if (adAccSelect && assets.ad_accounts) {
            adAccSelect.innerHTML = assets.ad_accounts.map(acc => `
                <option value="${acc.id}" ${acc.has_payment_method ? '' : 'disabled'}>
                    ${escapeHTML(acc.name)} (${acc.currency}) ${acc.has_payment_method ? '✅ Direct Billing Active' : '⚠️ No Card'}
                </option>
            `).join('');
            if (assets.ad_accounts[0]) currentAdForm.ad_account_id = assets.ad_accounts[0].id;
        }

        // 2. Facebook Pages Dropdown
        const pageSelect = document.getElementById('ad-form-page');
        if (pageSelect && assets.pages) {
            pageSelect.innerHTML = assets.pages.map(p => `
                <option value="${p.id}" data-ig-id="${p.instagram_actor_id || ''}">
                    ${escapeHTML(p.name)} ${p.instagram_username ? `(@${escapeHTML(p.instagram_username)})` : ''}
                </option>
            `).join('');
            if (assets.pages[0]) {
                currentAdForm.page_id = assets.pages[0].id;
                currentAdForm.instagram_actor_id = assets.pages[0].instagram_actor_id || '';
            }
        }

        // 3. Pre-verified WABA Numbers Dropdown
        const wabaSelect = document.getElementById('ad-form-waba');
        if (wabaSelect && assets.waba_numbers) {
            wabaSelect.innerHTML = assets.waba_numbers.map(w => `
                <option value="${w.display_phone_number}" data-phone-id="${w.phone_number_id}">
                    ${escapeHTML(w.display_phone_number)} &bull; ${escapeHTML(w.verified_name)} (Pre-Verified Official WABA)
                </option>
            `).join('');
            if (assets.waba_numbers[0]) {
                currentAdForm.whatsapp_phone_number = assets.waba_numbers[0].display_phone_number;
                currentAdForm.whatsapp_phone_number_id = assets.waba_numbers[0].phone_number_id;
            }
        }
    }

    function setAdStep(step) {
        currentAdStep = step;
        for (let i = 1; i <= 5; i++) {
            const stepEl = document.getElementById(`ad-step-content-${i}`);
            const pillEl = document.getElementById(`ad-step-pill-${i}`);
            if (stepEl) stepEl.style.display = (i === step) ? 'block' : 'none';
            if (pillEl) {
                pillEl.classList.toggle('active', i === step);
                pillEl.classList.toggle('completed', i < step);
            }
        }

        const btnPrev = document.getElementById('ad-btn-prev');
        const btnNext = document.getElementById('ad-btn-next');
        const btnPublish = document.getElementById('ad-btn-publish');

        if (btnPrev) btnPrev.style.display = (step > 1) ? 'inline-flex' : 'none';
        if (btnNext) btnNext.style.display = (step < 5) ? 'inline-flex' : 'none';
        if (btnPublish) btnPublish.style.display = (step === 5) ? 'inline-flex' : 'none';

        if (step === 5) {
            renderAdSummaryReview();
        }
        updateAdLivePreview();
    }
    window.setAdStep = setAdStep;

    function nextAdStep() {
        if (currentAdStep === 1) {
            const name = (document.getElementById('ad-form-name')?.value || '').trim();
            if (!name) {
                showToast('Please enter an ad/campaign name.', 'warning');
                document.getElementById('ad-form-name')?.focus();
                return;
            }
            currentAdForm.name = name;
            currentAdForm.ad_account_id = document.getElementById('ad-form-account')?.value || '';
            currentAdForm.page_id = document.getElementById('ad-form-page')?.value || '';
        } else if (currentAdStep === 2) {
            currentAdForm.headline = (document.getElementById('ad-form-headline')?.value || 'Chat with us on WhatsApp').trim();
            currentAdForm.primary_text = (document.getElementById('ad-form-primary-text')?.value || '').trim();
            currentAdForm.icebreaker_message = (document.getElementById('ad-form-icebreaker')?.value || '').trim();
            currentAdForm.media_url = (document.getElementById('ad-form-media-url')?.value || '').trim();
            currentAdForm.website_url = (document.getElementById('ad-form-website-url')?.value || '').trim();
            const wabaOpt = document.querySelector('#ad-form-waba option:checked');
            if (wabaOpt) {
                currentAdForm.whatsapp_phone_number = wabaOpt.value;
                currentAdForm.whatsapp_phone_number_id = wabaOpt.getAttribute('data-phone-id') || '';
            }
        } else if (currentAdStep === 3) {
            const b = parseFloat(document.getElementById('ad-form-budget')?.value || 1000);
            if (isNaN(b) || b < 100) {
                showToast('Minimum daily budget is ₹100.', 'warning');
                return;
            }
            currentAdForm.daily_budget = b;
        }

        if (currentAdStep < 5) {
            setAdStep(currentAdStep + 1);
        }
    }
    window.nextAdStep = nextAdStep;

    function prevAdStep() {
        if (currentAdStep > 1) {
            setAdStep(currentAdStep - 1);
        }
    }
    window.prevAdStep = prevAdStep;

    function selectAdDestination(type) {
        currentAdForm.destination_type = type;
        document.querySelectorAll('.ad-dest-card').forEach(card => {
            card.classList.toggle('selected', card.getAttribute('data-dest') === type);
        });

        const wabaBlock = document.getElementById('ad-destination-whatsapp-block');
        const webBlock = document.getElementById('ad-destination-website-block');
        const igBlock = document.getElementById('ad-destination-ig-block');

        if (wabaBlock) wabaBlock.style.display = (type === 'WHATSAPP') ? 'block' : 'none';
        if (webBlock) webBlock.style.display = (type === 'WEBSITE') ? 'block' : 'none';
        if (igBlock) igBlock.style.display = (type === 'INSTAGRAM_DIRECT') ? 'block' : 'none';

        // Auto-update headline & CTA
        const headlineInput = document.getElementById('ad-form-headline');
        if (headlineInput) {
            if (type === 'WHATSAPP') headlineInput.value = 'Chat with us on WhatsApp';
            else if (type === 'INSTAGRAM_DIRECT') headlineInput.value = 'Send Instagram Message';
            else if (type === 'MESSENGER') headlineInput.value = 'Chat on Messenger';
            else if (type === 'INSTANT_FORM') headlineInput.value = 'Get Exclusive Quote';
            else if (type === 'WEBSITE') headlineInput.value = 'Explore Our Catalog';
        }

        updateAdLivePreview();
    }
    window.selectAdDestination = selectAdDestination;

    function selectQuickBudget(amount) {
        const input = document.getElementById('ad-form-budget');
        if (input) {
            input.value = amount;
            currentAdForm.daily_budget = amount;
            document.querySelectorAll('.budget-pill').forEach(p => {
                p.classList.toggle('active', parseInt(p.getAttribute('data-amount'), 10) === amount);
            });
            updateEstimatedReach(amount);
        }
    }
    window.selectQuickBudget = selectQuickBudget;

    function updateEstimatedReach(budget) {
        const reachEl = document.getElementById('ad-estimated-reach');
        const estClicksEl = document.getElementById('ad-estimated-clicks');
        if (reachEl) {
            const minReach = Math.round(budget * 2.8);
            const maxReach = Math.round(budget * 7.5);
            reachEl.textContent = `${minReach.toLocaleString('en-IN')} – ${maxReach.toLocaleString('en-IN')} people/day`;
        }
        if (estClicksEl) {
            const minClicks = Math.round(budget * 0.12);
            const maxClicks = Math.round(budget * 0.35);
            estClicksEl.textContent = `${minClicks} – ${maxClicks} WhatsApp clicks/day`;
        }
    }

    // Switch preview between Facebook and Instagram
    function switchAdPreviewPlatform(platform) {
        previewPlatform = platform;
        const btnFb = document.getElementById('btn-preview-fb');
        const btnIg = document.getElementById('btn-preview-ig');
        if (btnFb) btnFb.classList.toggle('active', platform === 'facebook');
        if (btnIg) btnIg.classList.toggle('active', platform === 'instagram');
        updateAdLivePreview();
    }
    window.switchAdPreviewPlatform = switchAdPreviewPlatform;

    // Update Live Mobile Phone Mockup
    function updateAdLivePreview() {
        const headline = (document.getElementById('ad-form-headline')?.value || currentAdForm.headline || 'Chat with us on WhatsApp').trim();
        const primaryText = (document.getElementById('ad-form-primary-text')?.value || currentAdForm.primary_text || 'Transform your business with our verified solutions. Tap below to chat instantly on WhatsApp!').trim();
        const mediaUrl = (document.getElementById('ad-form-media-url')?.value || currentAdForm.media_url || '').trim();
        const pageName = document.querySelector('#ad-form-page option:checked')?.textContent?.split('(')[0]?.trim() || 'Inspenox Business';
        const dest = currentAdForm.destination_type || 'WHATSAPP';

        const previewContainer = document.getElementById('ad-phone-mockup-inner');
        if (!previewContainer) return;

        let ctaBtnText = 'Send WhatsApp Message';
        let ctaIcon = '💬';
        if (dest === 'INSTAGRAM_DIRECT') { ctaBtnText = 'Send Message'; ctaIcon = '📸'; }
        else if (dest === 'MESSENGER') { ctaBtnText = 'Send Message'; ctaIcon = '🔵'; }
        else if (dest === 'INSTANT_FORM') { ctaBtnText = 'Sign Up'; ctaIcon = '📋'; }
        else if (dest === 'WEBSITE') { ctaBtnText = 'Learn More'; ctaIcon = '🌐'; }

        const defaultMediaImg = 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=600&auto=format&fit=crop&q=80';
        const displayMedia = mediaUrl || defaultMediaImg;

        if (previewPlatform === 'instagram') {
            previewContainer.innerHTML = `
                <!-- Instagram Feed Header -->
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.8rem; border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); padding:2px;">
                            <div style="width:100%; height:100%; border-radius:50%; background:#111b21; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; color:#fff;">
                                ${escapeHTML(pageName.charAt(0))}
                            </div>
                        </div>
                        <div>
                            <div style="font-size:0.75rem; font-weight:700; color:var(--text-main); line-height:1.1;">${escapeHTML(pageName.toLowerCase().replace(/\s+/g, '_'))}</div>
                            <div style="font-size:0.65rem; color:var(--text-muted);">Sponsored</div>
                        </div>
                    </div>
                    <div style="color:var(--text-muted); font-size:0.9rem;">&bull;&bull;&bull;</div>
                </div>

                <!-- Media -->
                <div style="width:100%; height:190px; background:#000; overflow:hidden; position:relative;">
                    <img src="${escapeHTML(displayMedia)}" alt="Ad" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='${defaultMediaImg}'"/>
                </div>

                <!-- CTA Bar -->
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.55rem 0.8rem; background:rgba(16,185,129,0.12); border-bottom:1px solid rgba(16,185,129,0.25);">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">
                        ${escapeHTML(headline)}
                    </div>
                    <div style="background:#10b981; color:#fff; font-size:0.7rem; font-weight:700; padding:4px 10px; border-radius:6px; display:flex; align-items:center; gap:4px; flex-shrink:0;">
                        <span>${ctaIcon}</span>
                        <span>${ctaBtnText}</span>
                    </div>
                </div>

                <!-- Text Caption -->
                <div style="padding:0.6rem 0.8rem; font-size:0.75rem; color:var(--text-main); line-height:1.4;">
                    <span style="font-weight:700;">${escapeHTML(pageName.toLowerCase().replace(/\s+/g, '_'))}</span>
                    <span style="color:var(--text-muted); margin-left:4px;">${escapeHTML(primaryText)}</span>
                </div>
            `;
        } else {
            // Facebook Feed Mockup
            previewContainer.innerHTML = `
                <!-- Facebook Header -->
                <div style="display:flex; align-items:center; gap:0.6rem; padding:0.65rem 0.8rem;">
                    <div style="width:34px; height:34px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">
                        ${escapeHTML(pageName.charAt(0))}
                    </div>
                    <div>
                        <div style="font-size:0.8rem; font-weight:700; color:var(--text-main); line-height:1.2;">${escapeHTML(pageName)}</div>
                        <div style="font-size:0.65rem; color:var(--text-muted); display:flex; align-items:center; gap:3px;">
                            <span>Sponsored</span> &bull; <span>🌐</span>
                        </div>
                    </div>
                </div>

                <!-- Primary Text -->
                <div style="padding:0 0.8rem 0.5rem 0.8rem; font-size:0.75rem; color:var(--text-main); line-height:1.4;">
                    ${escapeHTML(primaryText)}
                </div>

                <!-- Media -->
                <div style="width:100%; height:180px; background:#000; overflow:hidden;">
                    <img src="${escapeHTML(displayMedia)}" alt="Ad" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='${defaultMediaImg}'"/>
                </div>

                <!-- Facebook Bottom CTA Card -->
                <div style="display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.8rem; background:rgba(0,0,0,0.25); border-top:1px solid var(--border);">
                    <div style="min-width:0; padding-right:0.5rem;">
                        <div style="font-size:0.62rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">WHATSAPP.COM</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHTML(headline)}
                        </div>
                    </div>
                    <div style="background:#10b981; color:#fff; font-size:0.72rem; font-weight:700; padding:5px 12px; border-radius:6px; display:flex; align-items:center; gap:4px; flex-shrink:0; box-shadow:0 2px 8px rgba(16,185,129,0.3);">
                        <span>${ctaIcon}</span>
                        <span>${ctaBtnText}</span>
                    </div>
                </div>
            `;
        }
    }
    window.updateAdLivePreview = updateAdLivePreview;

    function renderAdSummaryReview() {
        const reviewEl = document.getElementById('ad-summary-review-box');
        if (!reviewEl) return;

        reviewEl.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; font-size:0.8rem;">
                <div style="padding:0.75rem; background:var(--bg-card); border-radius:8px; border:1px solid var(--border);">
                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Campaign Name</div>
                    <div style="font-weight:700; color:var(--text-main); margin-top:2px;">${escapeHTML(currentAdForm.name)}</div>
                </div>
                <div style="padding:0.75rem; background:var(--bg-card); border-radius:8px; border:1px solid var(--border);">
                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Destination</div>
                    <div style="font-weight:700; color:#10b981; margin-top:2px;">
                        ${currentAdForm.destination_type === 'WHATSAPP' ? `✅ WhatsApp (${currentAdForm.whatsapp_phone_number || 'Pre-Verified WABA'})` : currentAdForm.destination_type}
                    </div>
                </div>
                <div style="padding:0.75rem; background:var(--bg-card); border-radius:8px; border:1px solid var(--border);">
                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Daily Budget</div>
                    <div style="font-weight:700; color:var(--text-main); margin-top:2px;">₹${parseFloat(currentAdForm.daily_budget).toLocaleString('en-IN')}/day</div>
                </div>
                <div style="padding:0.75rem; background:var(--bg-card); border-radius:8px; border:1px solid var(--border);">
                    <div style="color:var(--text-muted); font-size:0.7rem; text-transform:uppercase;">Placements</div>
                    <div style="font-weight:700; color:var(--text-main); margin-top:2px;">Facebook Feed, Instagram Feed & Stories</div>
                </div>
            </div>
            <div style="margin-top:1rem; padding:0.75rem; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25); border-radius:8px; font-size:0.75rem; color:var(--text-main);">
                <b>Direct Meta Billing Confirmation:</b> Meta will charge your connected Ad Account payment method directly. When users click this ad, their conversation routes directly to your <b>Live Inbox</b>, and deals marked "Converted" will track in your ROAS report.
            </div>
        `;
    }

    // =========================================================================
    // 5. 1-CLICK PUBLISH AD TO META
    // =========================================================================
    async function publishAd() {
        const btnPublish = document.getElementById('ad-btn-publish');
        if (btnPublish) {
            btnPublish.disabled = true;
            btnPublish.innerHTML = `<div class="spinner sm" style="margin-right:6px;"></div> Publishing to Meta...`;
        }

        try {
            const payload = {
                ...currentAdForm,
                company_id: getActiveCompanyId()
            };

            const res = await apiFetch('/api/ads?action=create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success) {
                showToast('🎉 Meta Ad Campaign published successfully!', 'success');
                closeCreateAdModal();
                loadAds();
            } else {
                showToast(data.error || 'Failed to publish ad', 'error');
            }
        } catch(err) {
            console.error('Error publishing ad:', err);
            showToast('Error publishing ad: ' + err.message, 'error');
        } finally {
            if (btnPublish) {
                btnPublish.disabled = false;
                btnPublish.innerHTML = `<span>🚀 Publish Ad to Meta</span>`;
            }
        }
    }
    window.publishAd = publishAd;

})();
