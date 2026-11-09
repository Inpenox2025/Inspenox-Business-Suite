/**
 * ==========================================================================
 * AUTOMATIONCONTROLLER.JS - Enterprise Automation Board Controller (6-Step Workflow Chaining & Button Triggers)
 * ==========================================================================
 * Controls the 24/7 Serverless Edge WhatsApp Automation engine: triggers (First Contact / Welcome, Inbound Keyword match, Template Button Click), multi-step workflow chaining up to 6 steps, interactive button reply chip picker, rule add/edit modal, test dispatch, active/inactive toggle, and custom delete confirmation modal.
 * 
 * Module Components:
 *  - Lines 12809 to 13802 in original app.js (Automation Board Rules, 6-Step Workflow Chaining, Button Triggers, Rule Modal, Test Dispatch & Modal Delete)
 * ==========================================================================
 */

// =========================================================================
// ENTERPRISE AUTOMATION BOARD CONTROLLER (Multi-Event & Button Replies)
// =========================================================================

function isEnterpriseActive(specificCompanyId) {
    const coId = specificCompanyId || getCompanyId();
    const activeComp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;
    if (!activeComp) {
        if (coId === 'default' || coId === 'parent' || !coId) {
            return isParentAdmin() || isSuperAdmin();
        }
        return false;
    }
    const isInspenox = !!((activeComp.slug && activeComp.slug.toLowerCase() === 'inspenox') || 
                          (activeComp.name && activeComp.name.toLowerCase() === 'inspenox') || 
                          activeComp.is_parent === true || 
                          activeComp.is_master === true);
    if (isInspenox) return true;

    const isExpired = !!(activeComp.subscription_expires_at && (new Date(activeComp.subscription_expires_at) < new Date()));
    const plan = (activeComp.subscription_plan || '').toLowerCase();
    const isActive = activeComp.subscription_status === 'active';
    return !isExpired && isActive && plan.includes('enterprise');
}
window.isEnterpriseActive = isEnterpriseActive;

function updateAutomationNavVisibility() {
    const autoNav = document.getElementById('nav-item-automation');
    if (!autoNav) return;
    const isEnt = isEnterpriseActive();
    autoNav.style.display = isEnt ? 'flex' : 'none';
}
window.updateAutomationNavVisibility = updateAutomationNavVisibility;

let allAutomationRules = [];
let cachedAutomationTemplates = [];
let activeTestRule = null;

async function loadAutomationBoard() {
    const isEnt = isEnterpriseActive();
    const lockedEl = document.getElementById('automation-locked-state');
    const unlockedEl = document.getElementById('automation-unlocked-state');

    const coId = getCompanyId();
    const activeComp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;
    const bizName = (activeComp && activeComp.name && !activeComp.name.toLowerCase().includes('your business')) ? activeComp.name : 'Inspenox';

    if (!isEnt) {
        if (lockedEl) {
            lockedEl.style.display = 'block';
            const planBadge = document.getElementById('automation-locked-current-plan');
            if (planBadge) {
                const curPlan = activeComp?.subscription_plan || 'No Active Plan';
                planBadge.textContent = `${bizName} is currently on the "${curPlan}" tier. 24/7 Edge Automation is exclusive to the Enterprise tier.`;
            }
        }
        if (unlockedEl) unlockedEl.style.display = 'none';
        allAutomationRules = [];
        return;
    }

    if (lockedEl) lockedEl.style.display = 'none';
    if (unlockedEl) unlockedEl.style.display = 'block';

    // Show initial loading in rules list
    const rulesListEl = document.getElementById('auto-rules-list');
    if (rulesListEl) {
        rulesListEl.innerHTML = `<div style="text-align: center; padding: 2.5rem; color: var(--text-muted);"><span class="spinner-icon" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></span> Loading automation rules for ${escapeHtml(bizName)}...</div>`;
    }

    // Set Preview Business Name & Brand in Simulator
    const bizEl = document.getElementById('preview-auto-biz-name');
    const avatarEl = document.getElementById('preview-sim-avatar');
    if (bizEl) bizEl.textContent = bizName;
    if (avatarEl) avatarEl.textContent = bizName.trim().charAt(0).toUpperCase() || 'I';
    document.querySelectorAll('.preview-sim-brand').forEach(el => {
        el.textContent = bizName;
    });

    // 1. Fetch Meta Templates for this company
    try {
        const tRes = await apiFetch(`/api/templates?company_id=${encodeURIComponent(coId)}`);
        const tData = await tRes.json();
        const templates = Array.isArray(tData.data) ? tData.data : (Array.isArray(tData) ? tData : []);
        cachedAutomationTemplates = templates.filter(t => (t.status || '').toUpperCase() === 'APPROVED');
        populateModalTemplatesSelect(cachedAutomationTemplates);
    } catch (e) {
        console.error('Error fetching templates for automation board:', e);
    }

    // 2. Fetch current automation configuration & logs
    try {
        const aRes = await apiFetch(`/api/automation?company_id=${encodeURIComponent(coId)}`);
        if (aRes.status === 403) {
            if (lockedEl) {
                lockedEl.style.display = 'block';
                const planBadge = document.getElementById('automation-locked-current-plan');
                if (planBadge) {
                    const curPlan = activeComp?.subscription_plan || 'No Active Plan';
                    planBadge.textContent = `${bizName} is currently on the "${curPlan}" tier. 24/7 Edge Automation is exclusive to the Enterprise tier.`;
                }
            }
            if (unlockedEl) unlockedEl.style.display = 'none';
            allAutomationRules = [];
            return;
        }
        const aData = await aRes.json();

        if (aData.success) {
            allAutomationRules = aData.automations || [];

            // Update stats
            const totalDispatches = allAutomationRules.reduce((sum, r) => sum + (parseInt(r.trigger_count, 10) || 0), 0);
            const activeRulesCount = allAutomationRules.filter(r => Boolean(r.is_active) && r.is_active !== '0' && r.is_active !== 0).length;

            const sentEl = document.getElementById('stat-auto-sent-count');
            if (sentEl) sentEl.textContent = totalDispatches;

            const statusEl = document.getElementById('stat-auto-status');
            const indEl = document.getElementById('auto-status-indicator');

            if (statusEl) {
                statusEl.textContent = activeRulesCount > 0 ? 'Active' : 'Paused';
                statusEl.style.color = activeRulesCount > 0 ? '#10b981' : '#ef4444';
            }
            if (indEl) {
                indEl.textContent = activeRulesCount > 0 ? `● Online (${activeRulesCount} active rules)` : '○ Paused';
                indEl.style.color = activeRulesCount > 0 ? '#10b981' : '#ef4444';
            }

            // Render Rules List
            renderAutomationRulesList(allAutomationRules);

            // Render Recent Logs
            renderAutomationLogs(aData.recent_logs || []);
        } else {
            console.warn('Automation fetch response not successful:', aData);
            allAutomationRules = [];
            renderAutomationRulesList([]);
        }
    } catch (e) {
        console.error('Error fetching automation rule:', e);
        if (rulesListEl) {
            rulesListEl.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted); background: var(--bg-sidebar); border-radius: 10px; border: 1px dashed var(--border);">
                    <p style="margin-bottom: 0.75rem;">No automation rules configured yet for this workspace.</p>
                    <button type="button" class="btn primary sm" onclick="openAutoRuleModal()">+ Create Rule</button>
                </div>
            `;
        }
    }

    // Initialize or refresh the interactive chat simulation
    if (typeof startAutoPlayChatSimulation === 'function') {
        startAutoPlayChatSimulation();
    }
}
window.loadAutomationBoard = loadAutomationBoard;

function renderAutomationRulesList(rules) {
    const listEl = document.getElementById('auto-rules-list');
    if (!listEl) return;

    if (!rules || rules.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 2.5rem 1.5rem; background: var(--bg-sidebar); border: 1.5px dashed var(--border); border-radius: 12px;">
                <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🤖</div>
                <h4 style="margin: 0 0 0.35rem 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">No Automation Rules Configured</h4>
                <p style="margin: 0 0 1.25rem 0; font-size: 0.85rem; color: var(--text-muted); max-width: 440px; margin-inline: auto;">
                    Create your first rule to send a welcome template on new customer contact, or link multi-step button-reply workflows (up to 6 templates).
                </p>
                <button type="button" class="btn primary" onclick="openAutoRuleModal()" style="font-weight: 700; padding: 0.6rem 1.4rem; border-radius: 8px;">
                    + Add First Rule
                </button>
            </div>
        `;
        return;
    }

    // Sort rules: Step 1 first, then follow-ups
    const sortedRules = [...rules].sort((a, b) => {
        const stepA = parseInt(a.chain_step, 10) || 1;
        const stepB = parseInt(b.chain_step, 10) || 1;
        if (stepA !== stepB) return stepA - stepB;
        return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
    });

    listEl.innerHTML = sortedRules.map(rule => {
        const isActive = Boolean(rule.is_active) && rule.is_active !== '0' && rule.is_active !== 0;
        const isChecked = isActive ? 'checked' : '';
        const statusText = isActive ? 'Active' : 'Paused';
        const statusColor = isActive ? '#10b981' : '#ef4444';
        const stepNum = parseInt(rule.chain_step, 10) || 1;
        const isChained = !!rule.parent_rule_id && stepNum > 1;

        // Step badge
        let stepBadge = '';
        if (stepNum === 1) {
            stepBadge = `<span class="chain-step-badge step-starter">🌱 Step 1 (Starter)</span>`;
        } else {
            const parentRule = rules.find(r => String(r.id) === String(rule.parent_rule_id));
            const parentName = parentRule ? parentRule.name : `Rule #${rule.parent_rule_id}`;
            stepBadge = `<span class="chain-step-badge step-followup" title="Linked follow-up to: ${escapeHtml(parentName)}">🔗 Step ${stepNum} (Follow-up to ${escapeHtml(parentName)})</span>`;
        }

        // Trigger badge
        let triggerBadge = '';
        if (rule.trigger_type === 'new_customer') {
            triggerBadge = `<span style="font-size: 0.72rem; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.12); padding: 3px 8px; border-radius: 4px;">🆕 First Contact / Welcome</span>`;
        } else if (rule.trigger_type === 'button_reply') {
            triggerBadge = `<span style="font-size: 0.72rem; font-weight: 700; color: #6366f1; background: rgba(99, 102, 241, 0.12); padding: 3px 8px; border-radius: 4px;">🔘 Button: "${escapeHtml(rule.trigger_value || '')}"</span>`;
        } else {
            triggerBadge = `<span style="font-size: 0.72rem; font-weight: 700; color: #ec4899; background: rgba(236, 72, 153, 0.12); padding: 3px 8px; border-radius: 4px;">💬 Keyword: "${escapeHtml(rule.trigger_value || '')}"</span>`;
        }

        // Response badge
        let responseBadge = '';
        if (rule.response_type === 'text') {
            responseBadge = `<span style="font-size: 0.72rem; font-weight: 600; color: #3b82f6; background: rgba(59, 130, 246, 0.12); padding: 3px 8px; border-radius: 4px;">💬 Text: "${escapeHtml((rule.response_text || '').slice(0, 32))}..."</span>`;
        } else {
            responseBadge = `<span style="font-size: 0.72rem; font-weight: 600; color: #00a884; background: rgba(0, 168, 132, 0.12); padding: 3px 8px; border-radius: 4px;">📄 Template: ${escapeHtml(rule.template_name || '')}</span>`;
        }

        const cardExtraClass = isChained ? 'auto-rule-card-chained' : '';

        return `
            <div class="${cardExtraClass}" style="background: var(--bg-sidebar); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.15rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; transition: border-color 0.2s ease; margin-bottom: 0.75rem;">
                <div style="flex: 1; min-width: 240px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.45rem; flex-wrap: wrap;">
                        ${stepBadge}
                        <span style="font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${escapeHtml(rule.name || 'Untitled Rule')}</span>
                        ${triggerBadge}
                        ${responseBadge}
                    </div>
                    <div style="display: flex; align-items: center; gap: 14px; font-size: 0.75rem; color: var(--text-muted); flex-wrap: wrap;">
                        <span>⚡ Dispatches: <strong>${rule.trigger_count || 0}</strong></span>
                        <span>⏱️ Cooldown: <strong>${rule.cooldown_hours || 0}h</strong></span>
                        <span id="rule-status-${rule.id}" style="color: ${statusColor}; font-weight: 600;">● ${statusText}</span>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                    <!-- Active Toggle -->
                    <label class="auto-switch" title="Toggle Active">
                        <input type="checkbox" ${isChecked} onchange="toggleAutoRule(${rule.id}, this.checked)">
                        <span class="auto-slider"></span>
                    </label>

                    <!-- Test Button -->
                    <button type="button" class="btn secondary sm" onclick="openAutoTestModal(${rule.id})" title="Send Test to WhatsApp" style="padding: 0.4rem 0.75rem; gap: 4px; font-size: 0.78rem;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        Test
                    </button>

                    <!-- Edit Button -->
                    <button type="button" class="btn secondary sm" onclick="openAutoRuleModal(${rule.id})" title="Edit Rule" style="padding: 0.4rem 0.65rem;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>

                    <!-- Delete Button -->
                    <button type="button" class="btn secondary sm" onclick="deleteAutoRule(${rule.id})" title="Delete Rule" style="padding: 0.4rem 0.65rem; color: #ef4444;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleAutoRule(ruleId, isChecked) {
    const r = allAutomationRules.find(x => String(x.id) === String(ruleId));
    if (r) r.is_active = isChecked;

    const ruleStatusPill = document.getElementById(`rule-status-${ruleId}`);
    if (ruleStatusPill) {
        ruleStatusPill.textContent = isChecked ? '● Active' : '● Paused';
        ruleStatusPill.style.color = isChecked ? '#10b981' : '#ef4444';
    }

    const activeCount = allAutomationRules.filter(x => Boolean(x.is_active) && x.is_active !== '0' && x.is_active !== 0).length;
    const statusEl = document.getElementById('stat-auto-status');
    const indEl = document.getElementById('auto-status-indicator');
    if (statusEl) {
        statusEl.textContent = activeCount > 0 ? 'Active' : 'Paused';
        statusEl.style.color = activeCount > 0 ? '#10b981' : '#ef4444';
    }
    if (indEl) {
        indEl.textContent = activeCount > 0 ? `● Online (${activeCount} active rules)` : '○ Paused';
        indEl.style.color = activeCount > 0 ? '#10b981' : '#ef4444';
    }

    try {
        await apiFetch('/api/automation', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: ruleId,
                company_id: getCompanyId(),
                is_active: isChecked
            })
        });
    } catch (e) {
        console.error('Error toggling rule:', e);
        if (r) r.is_active = !isChecked;
        if (ruleStatusPill) {
            ruleStatusPill.textContent = !isChecked ? '● Active' : '● Paused';
            ruleStatusPill.style.color = !isChecked ? '#10b981' : '#ef4444';
        }
        const rollbackCount = allAutomationRules.filter(x => Boolean(x.is_active) && x.is_active !== '0' && x.is_active !== 0).length;
        if (statusEl) {
            statusEl.textContent = rollbackCount > 0 ? 'Active' : 'Paused';
            statusEl.style.color = rollbackCount > 0 ? '#10b981' : '#ef4444';
        }
        if (indEl) {
            indEl.textContent = rollbackCount > 0 ? `● Online (${rollbackCount} active rules)` : '○ Paused';
            indEl.style.color = rollbackCount > 0 ? '#10b981' : '#ef4444';
        }
    }
}
window.toggleAutoRule = toggleAutoRule;

function deleteAutoRule(ruleId) {
    showModal(
        'Delete Automation Rule',
        'Are you sure you want to delete this automation rule? This action cannot be undone.',
        'confirm',
        async () => {
            try {
                const res = await apiFetch(`/api/automation?id=${ruleId}&company_id=${encodeURIComponent(getCompanyId())}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (data.success) {
                    allAutomationRules = allAutomationRules.filter(x => x.id !== ruleId);
                    renderAutomationRulesList(allAutomationRules);
                    loadAutomationBoard();
                    if (typeof showToast === 'function') {
                        showToast('Automation rule deleted successfully.', 'success');
                    }
                } else {
                    showModal('Error', data.error || 'Failed to delete rule.');
                }
            } catch (e) {
                showModal('Error', e.message);
            }
        },
        'Delete Rule',
        'btn danger'
    );
}
window.deleteAutoRule = deleteAutoRule;

// --- MODAL CONTROLLER: CONFIGURE / EDIT RULE & WORKFLOW CHAIN ---

function extractTemplateButtons(template) {
    if (!template) return [];
    if (typeof template === 'string') {
        template = cachedAutomationTemplates.find(t => t.name === template);
    }
    if (!template || !Array.isArray(template.components)) return [];

    const buttons = [];
    template.components.forEach(comp => {
        if (!comp) return;
        if (comp.type === 'BUTTONS' && Array.isArray(comp.buttons)) {
            comp.buttons.forEach((btn, idx) => {
                if (btn && btn.text) {
                    buttons.push({
                        text: btn.text.trim(),
                        type: btn.type || 'QUICK_REPLY',
                        index: idx
                    });
                }
            });
        }
        if (comp.type === 'INTERACTIVE' && comp.interactive && comp.interactive.action) {
            const act = comp.interactive.action;
            if (Array.isArray(act.buttons)) {
                act.buttons.forEach((b, idx) => {
                    const title = b.reply?.title || b.text;
                    if (title) buttons.push({ text: title.trim(), type: 'QUICK_REPLY', index: idx });
                });
            }
            if (Array.isArray(act.sections)) {
                act.sections.forEach(sec => {
                    if (Array.isArray(sec.rows)) {
                        sec.rows.forEach((r, idx) => {
                            if (r && r.title) buttons.push({ text: r.title.trim(), type: 'LIST_ROW', index: idx });
                        });
                    }
                });
            }
        }
    });
    return buttons;
}
window.extractTemplateButtons = extractTemplateButtons;

function renderTemplateButtonsForTrigger(selectedParentRuleId, targetTemplateName, preselectedValue = '') {
    const chipsContainer = document.getElementById('modal-rule-buttons-chips');
    const selectEl = document.getElementById('modal-rule-button-select');
    if (!chipsContainer && !selectEl) return;

    let sourceTemplate = null;
    let sourceLabel = '';

    // 1. Try to get template from selected Parent Rule
    if (selectedParentRuleId) {
        const parentRule = allAutomationRules.find(r => String(r.id) === String(selectedParentRuleId));
        if (parentRule && parentRule.template_name) {
            sourceTemplate = cachedAutomationTemplates.find(t => t.name === parentRule.template_name);
            sourceLabel = `Parent Rule "${parentRule.name}" (${parentRule.template_name})`;
        }
    }

    // 2. Fallback to targetTemplateName or currently selected template in modal
    if (!sourceTemplate && targetTemplateName) {
        sourceTemplate = cachedAutomationTemplates.find(t => t.name === targetTemplateName);
        sourceLabel = `Template "${targetTemplateName}"`;
    }
    if (!sourceTemplate) {
        const modalTmpl = document.getElementById('modal-rule-template-select')?.value;
        if (modalTmpl) {
            sourceTemplate = cachedAutomationTemplates.find(t => t.name === modalTmpl);
            sourceLabel = `Template "${modalTmpl}"`;
        }
    }

    const buttons = sourceTemplate ? extractTemplateButtons(sourceTemplate) : [];

    // Fallback sensible defaults if template has no parsed buttons
    const effectiveButtons = buttons.length > 0 ? buttons : [
        { text: 'India', type: 'QUICK_REPLY' },
        { text: 'USA', type: 'QUICK_REPLY' },
        { text: 'UAE & Others', type: 'QUICK_REPLY' },
        { text: 'Place an Order', type: 'QUICK_REPLY' },
        { text: 'Live Agent', type: 'QUICK_REPLY' }
    ];

    const currentVal = (preselectedValue || document.getElementById('modal-rule-trigger-value')?.value || '').trim();

    // Render clickable chips
    if (chipsContainer) {
        chipsContainer.innerHTML = effectiveButtons.map(btn => {
            const isSelected = currentVal && (currentVal.toLowerCase() === btn.text.toLowerCase());
            const selClass = isSelected ? 'selected' : '';
            return `
                <button type="button" class="auto-rule-btn-chip ${selClass}" onclick="selectRuleTriggerButton('${escapeHtml(btn.text)}', this)" title="Click to trigger this rule when lead taps [${escapeHtml(btn.text)}]">
                    <span class="chip-icon">${isSelected ? '✓' : '↩'}</span>
                    <span>${escapeHtml(btn.text)}</span>
                </button>
            `;
        }).join('');
    }

    // Populate dropdown selector
    if (selectEl) {
        selectEl.innerHTML = '<option value="">-- Choose from template buttons --</option>' +
            effectiveButtons.map(btn => {
                const isSelected = currentVal && (currentVal.toLowerCase() === btn.text.toLowerCase()) ? 'selected' : '';
                return `<option value="${escapeHtml(btn.text)}" ${isSelected}>${escapeHtml(btn.text)} (${btn.type})</option>`;
            }).join('');
    }
}
window.renderTemplateButtonsForTrigger = renderTemplateButtonsForTrigger;

function selectRuleTriggerButton(btnText, chipEl) {
    if (!btnText) return;
    const trigValInput = document.getElementById('modal-rule-trigger-value');
    if (trigValInput) trigValInput.value = btnText;

    const selectEl = document.getElementById('modal-rule-button-select');
    if (selectEl) selectEl.value = btnText;

    // Highlight chip
    const chipsContainer = document.getElementById('modal-rule-buttons-chips');
    if (chipsContainer) {
        chipsContainer.querySelectorAll('.auto-rule-btn-chip').forEach(el => {
            el.classList.remove('selected');
            const icon = el.querySelector('.chip-icon');
            if (icon) icon.textContent = '↩';
        });
        if (chipEl) {
            chipEl.classList.add('selected');
            const icon = chipEl.querySelector('.chip-icon');
            if (icon) icon.textContent = '✓';
        }
    }

    // Auto-suggest rule name if empty or generic
    const nameInput = document.getElementById('modal-rule-name');
    if (nameInput && (!nameInput.value || nameInput.value.startsWith('New Auto-Reply') || nameInput.value.startsWith('Step '))) {
        const stepNum = document.getElementById('modal-rule-chain-step')?.value || '1';
        nameInput.value = `Step ${stepNum}: Button "${btnText}"`;
    }
}
window.selectRuleTriggerButton = selectRuleTriggerButton;

function toggleManualTriggerInput() {
    const manualBox = document.getElementById('modal-rule-manual-input-box');
    const toggleLabel = document.getElementById('manual-trigger-toggle-label');
    if (!manualBox) return;
    const isHidden = manualBox.style.display === 'none' || !manualBox.style.display;
    manualBox.style.display = isHidden ? 'block' : 'none';
    if (toggleLabel) {
        toggleLabel.textContent = isHidden ? 'Hide manual input' : 'Enter manually';
    }
    if (isHidden) {
        document.getElementById('modal-rule-trigger-value')?.focus();
    }
}
window.toggleManualTriggerInput = toggleManualTriggerInput;

function onRuleButtonSelectChanged(btnText) {
    if (!btnText) return;
    const chipsContainer = document.getElementById('modal-rule-buttons-chips');
    let targetChip = null;
    if (chipsContainer) {
        targetChip = Array.from(chipsContainer.querySelectorAll('.auto-rule-btn-chip')).find(c => 
            c.textContent.trim().includes(btnText.trim())
        );
    }
    selectRuleTriggerButton(btnText, targetChip);
}
window.onRuleButtonSelectChanged = onRuleButtonSelectChanged;

function populateParentRulesDropdown(currentRuleId = null, selectedParentId = null) {
    const sel = document.getElementById('modal-rule-parent-id');
    if (!sel) return;

    const availableParents = allAutomationRules.filter(r => !currentRuleId || String(r.id) !== String(currentRuleId));

    if (availableParents.length === 0) {
        sel.innerHTML = '<option value="">No preceding rules yet (Create Step 1 starter rule first)</option>';
        return;
    }

    sel.innerHTML = '<option value="">-- Select Linked Parent Rule --</option>' +
        availableParents.map(r => {
            const stepNum = r.chain_step || 1;
            const tmpl = r.template_name ? ` [Tmpl: ${r.template_name}]` : (r.response_text ? ' [Direct Text]' : '');
            const isSel = selectedParentId && String(r.id) === String(selectedParentId) ? 'selected' : '';
            return `<option value="${r.id}" ${isSel}>Step ${stepNum}: ${escapeHtml(r.name)}${tmpl}</option>`;
        }).join('');
}
window.populateParentRulesDropdown = populateParentRulesDropdown;

function onModalChainStepChanged() {
    const stepSelect = document.getElementById('modal-rule-chain-step');
    const stepNum = parseInt(stepSelect?.value, 10) || 1;
    const parentGroup = document.getElementById('modal-rule-parent-group');
    const badgeEl = document.getElementById('modal-rule-step-badge');

    if (badgeEl) {
        if (stepNum === 1) {
            badgeEl.textContent = 'Step 1 (Conversation Starter)';
            badgeEl.className = 'chain-step-pill';
            badgeEl.style.background = 'rgba(16, 185, 129, 0.15)';
            badgeEl.style.color = '#10b981';
            badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else {
            badgeEl.textContent = `Step ${stepNum} (Workflow Follow-up)`;
            badgeEl.className = 'chain-step-pill';
            badgeEl.style.background = 'rgba(99, 102, 241, 0.15)';
            badgeEl.style.color = '#818cf8';
            badgeEl.style.borderColor = 'rgba(99, 102, 241, 0.3)';
        }
    }

    if (stepNum > 1) {
        if (parentGroup) parentGroup.style.display = 'block';
        const currentRuleId = document.getElementById('modal-rule-id')?.value;
        const currentParentId = document.getElementById('modal-rule-parent-id')?.value;
        populateParentRulesDropdown(currentRuleId, currentParentId);

        const trigTypeEl = document.getElementById('modal-rule-trigger-type');
        if (trigTypeEl && trigTypeEl.value === 'new_customer') {
            trigTypeEl.value = 'button_reply';
            onModalTriggerTypeChanged();
        }
    } else {
        if (parentGroup) parentGroup.style.display = 'none';
    }
}
window.onModalChainStepChanged = onModalChainStepChanged;

function onModalParentRuleChanged() {
    const parentId = document.getElementById('modal-rule-parent-id')?.value;
    const trigType = document.getElementById('modal-rule-trigger-type')?.value;
    if (trigType === 'button_reply') {
        renderTemplateButtonsForTrigger(parentId, null);
    }
}
window.onModalParentRuleChanged = onModalParentRuleChanged;

function populateModalTemplatesSelect(templates) {
    const sel = document.getElementById('modal-rule-template-select');
    if (!sel) return;

    if (!templates || templates.length === 0) {
        sel.innerHTML = '<option value="">No approved Meta templates found. Create templates in Templates tab first.</option>';
        return;
    }

    sel.innerHTML = '<option value="">-- Choose an Approved Meta Template --</option>' +
        templates.map(t => {
            const cat = t.category ? ` [${t.category}]` : '';
            return `<option value="${t.name}">${t.name} (${t.language || 'en'})${cat}</option>`;
        }).join('');
}

function openAutoRuleModal(ruleId = null) {
    const modal = document.getElementById('modal-auto-rule');
    if (!modal) return;

    populateModalTemplatesSelect(cachedAutomationTemplates);

    const titleEl = document.getElementById('modal-auto-rule-title');
    const idEl = document.getElementById('modal-rule-id');
    const nameEl = document.getElementById('modal-rule-name');
    const chainStepEl = document.getElementById('modal-rule-chain-step');
    const parentIdEl = document.getElementById('modal-rule-parent-id');
    const trigTypeEl = document.getElementById('modal-rule-trigger-type');
    const trigValEl = document.getElementById('modal-rule-trigger-value');
    const keyInputEl = document.getElementById('modal-rule-keyword-input');
    const respTypeEl = document.getElementById('modal-rule-response-type');
    const tmplSelect = document.getElementById('modal-rule-template-select');
    const respTextEl = document.getElementById('modal-rule-response-text');
    const cdEl = document.getElementById('modal-rule-cooldown');

    populateParentRulesDropdown(ruleId, null);

    if (ruleId) {
        const rule = allAutomationRules.find(x => x.id === ruleId);
        if (rule) {
            if (titleEl) titleEl.textContent = 'Edit Automation Rule';
            if (idEl) idEl.value = rule.id;
            if (nameEl) nameEl.value = rule.name || '';
            if (chainStepEl) chainStepEl.value = rule.chain_step || 1;
            if (parentIdEl) parentIdEl.value = rule.parent_rule_id || '';
            if (trigTypeEl) trigTypeEl.value = rule.trigger_type || 'new_customer';
            if (trigValEl) trigValEl.value = rule.trigger_value || '';
            if (keyInputEl) keyInputEl.value = rule.trigger_value || '';
            if (respTypeEl) respTypeEl.value = rule.response_type || 'template';
            if (tmplSelect && rule.template_name) tmplSelect.value = rule.template_name;
            if (respTextEl) respTextEl.value = rule.response_text || '';
            if (cdEl) cdEl.value = rule.cooldown_hours ?? 0;
        }
    } else {
        if (titleEl) titleEl.textContent = 'Configure New Automation Rule';
        if (idEl) idEl.value = '';
        if (nameEl) nameEl.value = '';
        if (chainStepEl) chainStepEl.value = 1;
        if (parentIdEl) parentIdEl.value = '';
        if (trigTypeEl) trigTypeEl.value = 'new_customer';
        if (trigValEl) trigValEl.value = '';
        if (keyInputEl) keyInputEl.value = '';
        if (respTypeEl) respTypeEl.value = 'template';
        if (tmplSelect && cachedAutomationTemplates.length > 0) tmplSelect.value = cachedAutomationTemplates[0].name;
        if (respTextEl) respTextEl.value = '';
        if (cdEl) cdEl.value = 24;
    }

    onModalChainStepChanged();
    onModalTriggerTypeChanged();
    onModalResponseTypeChanged();
    onModalTargetTemplateChanged();

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}
window.openAutoRuleModal = openAutoRuleModal;

function closeAutoRuleModal() {
    const modal = document.getElementById('modal-auto-rule');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeAutoRuleModal = closeAutoRuleModal;

function onModalTriggerTypeChanged() {
    const trigType = document.getElementById('modal-rule-trigger-type')?.value;
    const btnPickerGroup = document.getElementById('modal-rule-buttons-picker-group');
    const keywordGroup = document.getElementById('modal-rule-keyword-group');
    const cdEl = document.getElementById('modal-rule-cooldown');
    const isEdit = !!document.getElementById('modal-rule-id')?.value;

    if (trigType === 'button_reply') {
        if (btnPickerGroup) btnPickerGroup.style.display = 'block';
        if (keywordGroup) keywordGroup.style.display = 'none';
        const parentId = document.getElementById('modal-rule-parent-id')?.value;
        const currentVal = document.getElementById('modal-rule-trigger-value')?.value || '';
        renderTemplateButtonsForTrigger(parentId, null, currentVal);
        if (cdEl && !isEdit) cdEl.value = 0;
    } else if (trigType === 'keyword') {
        if (btnPickerGroup) btnPickerGroup.style.display = 'none';
        if (keywordGroup) keywordGroup.style.display = 'block';
        if (cdEl && !isEdit) cdEl.value = 0;
    } else {
        if (btnPickerGroup) btnPickerGroup.style.display = 'none';
        if (keywordGroup) keywordGroup.style.display = 'none';
        if (cdEl && !isEdit) cdEl.value = 24;
    }
}
window.onModalTriggerTypeChanged = onModalTriggerTypeChanged;

function onModalResponseTypeChanged() {
    const respType = document.getElementById('modal-rule-response-type')?.value;
    const tmplGroup = document.getElementById('modal-rule-template-group');
    const textGroup = document.getElementById('modal-rule-text-group');

    if (respType === 'text') {
        if (tmplGroup) tmplGroup.style.display = 'none';
        if (textGroup) textGroup.style.display = 'block';
    } else {
        if (tmplGroup) tmplGroup.style.display = 'block';
        if (textGroup) textGroup.style.display = 'none';
    }
}
window.onModalResponseTypeChanged = onModalResponseTypeChanged;

function onModalTargetTemplateChanged() {
    const tmplName = document.getElementById('modal-rule-template-select')?.value;
    const previewEl = document.getElementById('modal-rule-template-preview-badges');
    if (!previewEl) return;

    if (!tmplName) {
        previewEl.innerHTML = '';
        return;
    }

    const tmpl = cachedAutomationTemplates.find(t => t.name === tmplName);
    if (!tmpl) {
        previewEl.innerHTML = '';
        return;
    }

    const buttons = extractTemplateButtons(tmpl);
    if (buttons.length > 0) {
        previewEl.innerHTML = `
            <div style="font-size:0.72rem; color:var(--text-muted); width:100%; margin-top:2px;">
                Interactive Buttons on this template:
            </div>
            ${buttons.map(b => `
                <span style="font-size:0.72rem; padding:2px 7px; border-radius:4px; background:rgba(0,168,132,0.12); color:var(--primary); font-weight:600;">
                    ↩ ${escapeHtml(b.text)}
                </span>
            `).join('')}
        `;
    } else {
        previewEl.innerHTML = `<span style="font-size:0.72rem; color:var(--text-muted); font-style:italic;">Standard broadcast template without quick reply buttons.</span>`;
    }
}
window.onModalTargetTemplateChanged = onModalTargetTemplateChanged;

async function submitAutoRuleModal() {
    const id = document.getElementById('modal-rule-id')?.value || null;
    const name = document.getElementById('modal-rule-name')?.value?.trim();
    const chainStep = parseInt(document.getElementById('modal-rule-chain-step')?.value, 10) || 1;
    const parentRuleId = document.getElementById('modal-rule-parent-id')?.value || null;
    const triggerType = document.getElementById('modal-rule-trigger-type')?.value;
    
    let triggerValue = '';
    if (triggerType === 'button_reply') {
        triggerValue = document.getElementById('modal-rule-trigger-value')?.value?.trim() || '';
    } else if (triggerType === 'keyword') {
        triggerValue = document.getElementById('modal-rule-keyword-input')?.value?.trim() || '';
    }

    const responseType = document.getElementById('modal-rule-response-type')?.value;
    const templateName = document.getElementById('modal-rule-template-select')?.value || null;
    const responseText = document.getElementById('modal-rule-response-text')?.value?.trim() || '';
    const cooldown = parseInt(document.getElementById('modal-rule-cooldown')?.value, 10) || 0;

    if (!name) {
        showModal('Name Required', 'Please enter a name for this automation rule.');
        return;
    }
    if (chainStep > 1 && !parentRuleId) {
        showModal('Parent Rule Required', 'For Step ' + chainStep + ', please select which previous rule this follow-up links to.');
        return;
    }
    if ((triggerType === 'button_reply' || triggerType === 'keyword') && !triggerValue) {
        showModal('Trigger Value Required', triggerType === 'button_reply' ? 'Please select or enter the template button to match.' : 'Please enter the keyword to match.');
        return;
    }
    if (responseType === 'template' && !templateName) {
        showModal('Template Required', 'Please select an approved WhatsApp template.');
        return;
    }
    if (responseType === 'text' && !responseText) {
        showModal('Message Required', 'Please enter the text reply to send.');
        return;
    }

    const btn = document.getElementById('btn-save-rule-modal');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Saving...';
    }

    try {
        const res = await apiFetch('/api/automation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id ? parseInt(id, 10) : null,
                company_id: getCompanyId(),
                name: name,
                chain_step: chainStep,
                parent_rule_id: parentRuleId ? parseInt(parentRuleId, 10) : null,
                trigger_type: triggerType,
                trigger_value: triggerValue,
                response_type: responseType,
                template_name: templateName,
                response_text: responseText,
                cooldown_hours: cooldown,
                is_active: true
            })
        });

        const data = await res.json();
        if (data.success) {
            closeAutoRuleModal();
            loadAutomationBoard();
            showModal('Rule Saved ⚡', `Workflow Step ${chainStep} rule "${name}" is active and running 24/7 on Inspenox Edge!`);
        } else {
            showModal('Save Failed', data.error || 'Could not save automation rule.');
        }
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}
window.submitAutoRuleModal = submitAutoRuleModal;

// --- MODAL CONTROLLER: SEND TEST (No browser prompt) ---

function openAutoTestModal(ruleId = null) {
    const modal = document.getElementById('modal-auto-test');
    if (!modal) return;

    activeTestRule = allAutomationRules.find(r => r.id === ruleId) || allAutomationRules[0] || null;

    const targetLabel = document.getElementById('modal-auto-test-target-label');
    const phoneInput = document.getElementById('auto-test-phone-input');

    if (activeTestRule) {
        const desc = activeTestRule.response_type === 'text' 
            ? `Text: "${(activeTestRule.response_text || '').slice(0, 35)}..."` 
            : `Template: "${activeTestRule.template_name}"`;
        if (targetLabel) targetLabel.textContent = `Rule "${activeTestRule.name}" ➔ ${desc}`;
    } else {
        const defaultTmpl = cachedAutomationTemplates[0]?.name || 'welcome';
        if (targetLabel) targetLabel.textContent = `Default Template: "${defaultTmpl}"`;
    }

    // Pre-fill phone if available in session
    if (phoneInput && !phoneInput.value) {
        let user = {};
        try { user = JSON.parse(localStorage.getItem('inspenox_user') || '{}'); } catch(e) {}
        phoneInput.value = user.phone ? String(user.phone).replace(/\D/g, '') : '91';
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}
window.openAutoTestModal = openAutoTestModal;

function closeAutoTestModal() {
    const modal = document.getElementById('modal-auto-test');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeAutoTestModal = closeAutoTestModal;

async function submitAutoTestModal() {
    const phoneInput = document.getElementById('auto-test-phone-input');
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!phone || phone.length < 10) {
        showModal('Valid Phone Required', 'Please enter a valid WhatsApp phone number with country code (e.g. 919876543210).');
        return;
    }

    const btn = document.getElementById('btn-submit-auto-test');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Sending...';
    }

    const coId = getCompanyId();
    const isText = activeTestRule && activeTestRule.response_type === 'text';
    const tmplName = activeTestRule ? activeTestRule.template_name : (cachedAutomationTemplates[0]?.name || '');

    try {
        let payload = {
            company_id: coId,
            to: phone,
            phone: phone
        };

        if (isText) {
            payload.type = 'text';
            payload.content = activeTestRule.response_text || 'Test automated response from Inspenox!';
        } else {
            payload.type = 'template';
            payload.template_name = tmplName;
            payload.template_language = activeTestRule?.template_language || 'en_US';
        }

        const res = await apiFetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        closeAutoTestModal();

        if (data.success || data.wa_message_id) {
            showModal('Test Dispatched! 🚀', `Automated reply was sent successfully to ${phone}. Check your WhatsApp!`);
            loadAutomationBoard();
        } else {
            showModal('Delivery Failed', data.error || JSON.stringify(data));
        }
    } catch (err) {
        closeAutoTestModal();
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}
window.submitAutoTestModal = submitAutoTestModal;

function renderAutomationLogs(logs) {
    const tbody = document.getElementById('auto-reply-logs-tbody');
    const countEl = document.getElementById('auto-logs-count');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        tbody.innerHTML = renderTableEmptyStateHtml(5, 'No automated replies dispatched yet', 'When a customer messages on WhatsApp, the events will appear here in real time.', '⚡');
        if (countEl) countEl.textContent = '0 events';
        return;
    }

    if (countEl) countEl.textContent = `${logs.length} events`;

    tbody.innerHTML = logs.map(log => {
        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        }) : '-';
        const statusColor = (log.status === 'delivered' || log.status === 'read' || log.status === 'sent') ? '#10b981' : '#ef4444';
        const name = log.customer_name || 'Customer';
        const phone = log.customer_phone || '-';

        return `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 0.65rem 0.75rem; font-weight: 600; color: var(--text-main);">${escapeHtml(name)}</td>
                <td style="padding: 0.65rem 0.75rem; color: var(--text-muted);">${escapeHtml(phone)}</td>
                <td style="padding: 0.65rem 0.75rem; color: #8b5cf6; font-weight: 600;">${escapeHtml(log.template_name || log.content?.slice(0, 25) || 'Auto-Reply')}</td>
                <td style="padding: 0.65rem 0.75rem;">
                    <span style="font-size: 0.72rem; font-weight: 700; color: ${statusColor}; background: rgba(16,185,129,0.1); padding: 2px 8px; border-radius: 4px;">
                        ${log.status || 'sent'}
                    </span>
                </td>
                <td style="padding: 0.65rem 0.75rem; color: var(--text-muted); font-size: 0.78rem;">${dateStr}</td>
            </tr>
        `;
    }).join('');
}

