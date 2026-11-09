/**
 * ==========================================================================
 * TEMPLATESCONTROLLER.JS - Meta WhatsApp Templates Controller (Wizard, Categories, Media & Live Preview)
 * ==========================================================================
 * Synchronizes pre-approved WhatsApp templates from Meta Graph API and powers the interactive multi-step template builder wizard: Marketing, Utility, Authentication (OTP), Product Catalogues, media header uploads up to 16MB, variable substitution ({{1}}, {{name}}), dynamic button actions, and live smartphone mockup preview.
 * 
 * Module Components:
 *  - Lines 4909 to 7334 in original app.js (Templates Loader, List Rendering, Meta Template Builder Wizard, Media Upload & Live Mockup Preview)
 * ==========================================================================
 */

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
    const select = document.getElementById('bc-template');
    if (select) select.innerHTML = '<option value="">Loading templates...</option>';
    if (templatesCache.length === 0) await loadTemplates();
    if (select) {
        select.innerHTML = '';
        const approvedOnly = Array.isArray(templatesCache) ? templatesCache.filter(t => (t.status || '').toUpperCase() === 'APPROVED') : [];
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
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                        <label style="font-size:0.775rem; color:var(--text-muted); margin-bottom:0; display:block;">Upload sample media file</label>
                        <span class="meta-direct-badge" style="font-size:0.68rem;">⚡ Direct Meta Upload (Max 16 MB)</span>
                    </div>
                    
                    <div id="tpl-media-dropzone" class="file-dropzone">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        <div style="font-size:0.85rem; color:var(--text-main); font-weight:600; margin-top:0.4rem;">Drag and drop to upload</div>
                        <div style="font-size:0.75rem; color:var(--primary); font-weight:500;">Or choose files on your device</div>
                        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.35rem;">Meta allows sample videos up to 16 MB · Images up to 5 MB</div>
                        <input type="file" id="tpl-media-file-input" style="display:none;" accept="image/*,video/*,.pdf,.doc,.docx">
                    </div>

                    <!-- Uploaded Media File Bar with Thumbnail & Cross Remove Button -->
                    <div id="tpl-media-file-card" style="display:none; background:#e9eef6; border:1px solid #d3e3fd; padding:0.6rem 0.85rem; border-radius:8px; margin-top:0.5rem; align-items:center; justify-content:space-between; gap:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.6rem; overflow:hidden;">
                            <img id="tpl-media-file-thumb" style="width:28px; height:28px; object-fit:cover; border-radius:4px; display:none;" src="">
                            <span id="tpl-media-file-icon" style="font-size:1.1rem; display:inline-block;">📁</span>
                            <span id="tpl-media-file-name-text" style="font-weight:700; color:#1a73e8; font-size:0.825rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">filename.mp4</span>
                            <span id="tpl-media-file-size-text" style="font-size:0.75rem; color:#5f6368; white-space:nowrap;">(14.2 MB)</span>
                            <span class="meta-direct-badge" style="font-size:0.68rem;">✓ Meta Direct</span>
                        </div>
                        <button type="button" id="btn-remove-media-file" style="background:none; border:none; cursor:pointer; font-size:1.25rem; color:#5f6368; padding:0 0.3rem; line-height:1; font-weight:bold;" title="Remove media file">&times;</button>
                    </div>

                    <!-- Size Warning Alert Banner -->
                    <div id="tpl-media-size-warning" class="media-size-warning-banner">
                        <span style="font-size:1.1rem; flex-shrink:0;">⚠️</span>
                        <span id="tpl-media-size-warning-text" style="flex:1;"></span>
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

    function hideMediaSizeWarning() {
        const warnEl = document.getElementById('tpl-media-size-warning');
        if (warnEl) warnEl.style.display = 'none';
    }

    function showMediaSizeWarning(msg) {
        const warnEl = document.getElementById('tpl-media-size-warning');
        const warnTextEl = document.getElementById('tpl-media-size-warning-text');
        if (warnEl && warnTextEl) {
            warnTextEl.innerHTML = msg;
            warnEl.style.display = 'flex';
        }
    }

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
        if (!file) return;

        // Immediate validation: Meta limit for sample videos and media files is 16 MB (16,777,216 bytes)
        const MAX_SAMPLE_BYTES = 16 * 1024 * 1024;
        if (file.size > MAX_SAMPLE_BYTES) {
            const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
            const isVideo = (file.type && file.type.startsWith('video')) || (file.name && file.name.toLowerCase().endsWith('.mp4'));
            const typeLabel = isVideo ? 'sample video' : 'sample media file';

            // Clear input immediately so invalid file is discarded
            if (fileInput) fileInput.value = '';

            // Immediate inline warning banner in template builder
            showMediaSizeWarning(`<strong>File Size Warning:</strong> "${escapeHtml(file.name)}" is <strong>${sizeInMb} MB</strong>. Meta requires ${typeLabel}s to be <strong>16 MB or less</strong>. Please compress or choose a file under 16 MB.`);

            // Immediate helpful warning modal popup for maximum visibility
            showModal(
                'File Size Exceeds 16 MB Limit',
                `<div style="text-align:left; font-size:0.9rem; line-height:1.6;">
                    <p style="margin-bottom:0.75rem;">
                        The selected file <strong style="color:var(--text-main);">${escapeHtml(file.name)}</strong> is <strong style="color:#d93025;">${sizeInMb} MB</strong>.
                    </p>
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0.75rem 1rem; margin-bottom:0.75rem; color:#991b1b;">
                        <strong>Meta WhatsApp Limit:</strong> Meta allows ${typeLabel}s up to a maximum of <strong>16 MB</strong> for template verification and approval.
                    </div>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:0;">
                        💡 <em>Tip:</em> Please compress this ${isVideo ? 'video' : 'file'} or select a file under 16 MB to continue.
                    </p>
                </div>`
            );
            return;
        }

        hideMediaSizeWarning();
        currentMediaSampleFile = file;
        currentMediaSampleUrl = URL.createObjectURL(file);

        const mediaThumbEl = document.getElementById('tpl-media-file-thumb');
        const mediaIconEl = document.getElementById('tpl-media-file-icon');

        if (fileNameTextEl) fileNameTextEl.textContent = file.name;
        
        const formattedSize = file.size >= 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(file.size / 1024).toFixed(0)} KB`;
        if (fileSizeTextEl) fileSizeTextEl.textContent = `(${formattedSize})`;

        if (file.type.startsWith('image/')) {
            if (mediaThumbEl) {
                mediaThumbEl.src = currentMediaSampleUrl;
                mediaThumbEl.style.display = 'block';
            }
            if (mediaIconEl) mediaIconEl.style.display = 'none';
        } else if (file.type.startsWith('video/') || file.name.endsWith('.mp4')) {
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
        hideMediaSizeWarning();
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
    const tplFileInput = document.getElementById('tpl-media-file-input');
    if (tplFileInput) tplFileInput.value = '';
    const tplFileCard = document.getElementById('tpl-media-file-card');
    if (tplFileCard) tplFileCard.style.display = 'none';
    const tplDropzone = document.getElementById('tpl-media-dropzone');
    if (tplDropzone) tplDropzone.style.display = 'block';
    const tplSizeWarn = document.getElementById('tpl-media-size-warning');
    if (tplSizeWarn) tplSizeWarn.style.display = 'none';
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
                submitBtn.innerHTML = `<span class="spinner"></span> Uploading sample ${headerType.toLowerCase()} (0%)...`;
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
                    handle = await getMetaHeaderHandle(currentMediaSampleFile, (percent) => {
                        if (submitBtn) {
                            submitBtn.innerHTML = `<span class="spinner"></span> Uploading sample ${headerType.toLowerCase()} (${percent}%)...`;
                        }
                    });
                    if (submitBtn) {
                        submitBtn.innerHTML = '<span class="spinner"></span> Submitting to Meta...';
                    }
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



