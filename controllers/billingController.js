/**
 * ==========================================================================
 * BILLINGCONTROLLER.JS - Subscriptions & Billing Controller (Packages, Razorpay Gateway, Coupons & Invoices)
 * ==========================================================================
 * Handles subscription packages (Starter, Growth, Enterprise Elite), billing cycles (Monthly, Quarterly, Annual), active plan stats, Razorpay checkout integration with INR gross-up convenience fee calculation, coupon code redemption, and workspace payment receipts & official invoice downloads.
 * 
 * Module Components:
 *  - Lines 2849 to 3369 in original app.js (Subscriptions & Billing State, Plan Packages, Billing Cycles & Active Plan UI Engine)
 *  - Lines 11775 to 12808 in original app.js (Subscriptions Checkout, Razorpay Payment Gateway, Coupon Redemption, Invoices & Receipts)
 * ==========================================================================
 */

/* ========================================================
   Subscriptions & Billing State & Instant UI Engine
   ======================================================== */
const DEFAULT_SUBSCRIPTION_PLANS = [
    {
        id: 'starter',
        name: 'Starter Tier',
        description: 'Perfect for small businesses beginning their automated WhatsApp messaging journey.',
        price_monthly: 999,
        price_4months: 3596, // ~10% off (₹899/mo)
        price_6months: 5095, // ~15% off (₹849/mo)
        price_annual: 9590,  // ~20% off (₹799/mo)
        popular: false,
        badge: 'Essential',
        features: [
            '1 Connected WhatsApp Business Number',
            'Up to 1,500 Active Contacts',
            'Pre-Approved WhatsApp Templates',
            'Basic Direct Broadcast Campaigns',
            'Customer Support (Standard Email)',
            'Standard Delivery Speed'
        ]
    },
    {
        id: 'growth',
        name: 'Growth Pro',
        description: 'Built for scaling brands requiring multi-team access and intelligent broadcasts.',
        price_monthly: 2499,
        price_4months: 8996,  // ~10% off (₹2,249/mo)
        price_6months: 12745, // ~15% off (₹2,124/mo)
        price_annual: 23990,  // ~20% off (₹1,999/mo)
        popular: true,
        badge: 'Most Popular',
        features: [
            'Up to 3 WhatsApp Phone Numbers',
            'Up to 15,000 Active Contacts',
            'Dynamic Broadcast Variables & Tags',
            'Multi-Channel Inbox (Live Chat & WhatsApp)',
            '5 Team Members / Agent Accounts',
            'Detailed Meta Delivery Analytics',
            'Priority Queue Broadcast Engine'
        ]
    },
    {
        id: 'enterprise',
        name: 'Enterprise Elite',
        description: 'Complete multi-tenant ecosystem for corporate agencies and high-volume operations.',
        price_monthly: 5999,
        price_4months: 21596, // ~10% off (₹5,399/mo)
        price_6months: 30595, // ~15% off (₹5,099/mo)
        price_annual: 57590,  // ~20% off (₹4,799/mo)
        popular: false,
        badge: 'Enterprise',
        features: [
            '24/7 Inspenox Edge Automation Board (Instant Lead Auto-Replies)',
            'Smart Campaign Auto-Scheduling & Automated Recurring Broadcasts',
            'Interactive Multi-Step Chatbot Flows (Quick-Reply & List Menu Triggers)',
            'Sleep-Proof Edge Execution (Operates 24/7 without app logged in)',
            'Custom limit charges applicable for WhatsApp Business numbers',
            'Custom limit charges applicable for customer contacts & segmentation tags',
            'Custom limit charges applicable for team members & role permissions',
            'Dedicated Webhooks & Custom Meta System Tokens',
            'White-Glove Onboarding & 24/7 SLA Support',
            'Maximum Meta API Throughput (Tier 3 Capacity)',
            'Plan pricing for existing features (Extra Addon Features Billed Separately)'
        ]
    }
];

let currentBillingCycle = 'monthly';
let allSubscriptionPlans = [...DEFAULT_SUBSCRIPTION_PLANS];
let allCouponsList = [];
let allPaymentLogsList = [];
let activeCompanyPlanName = null;

function getPlanCyclePrice(plan, cycle) {
    if (!plan) return 0;
    const c = String(cycle || 'monthly').toLowerCase();
    if (c === '4_months' || c === '4months') {
        return plan.price_4months || Math.round(plan.price_monthly * 4 * 0.9);
    }
    if (c === '6_months' || c === '6months') {
        return plan.price_6months || Math.round(plan.price_monthly * 6 * 0.85);
    }
    if (c === 'annual' || c === '12_months' || c === 'year') {
        return plan.price_annual || Math.round(plan.price_monthly * 12 * 0.8);
    }
    return plan.price_monthly;
}
window.getPlanCyclePrice = getPlanCyclePrice;

function getCyclePeriodInfo(cycle) {
    const c = String(cycle || 'monthly').toLowerCase();
    if (c === '4_months' || c === '4months') {
        return { text: '/4 months', badge: '✨ Includes 10% bundle discount', label: '4 Months' };
    }
    if (c === '6_months' || c === '6months') {
        return { text: '/6 months', badge: '✨ Includes 15% bundle discount', label: '6 Months' };
    }
    if (c === 'annual' || c === '12_months' || c === 'year') {
        return { text: '/year', badge: '✨ Includes 20% annual discount', label: 'Annual (12 Months)' };
    }
    return { text: '/month', badge: '', label: 'Monthly' };
}
window.getCyclePeriodInfo = getCyclePeriodInfo;

function updateCompanySubscriptionStatusUI() {
    const coId = getCompanyId();
    const activeComp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;

    // Check if subscription has expired based on stored subscription_expires_at
    const isMaster = !!(activeComp && ((activeComp.slug && activeComp.slug.toLowerCase() === 'inspenox') || (activeComp.name && activeComp.name.toLowerCase() === 'inspenox')));
    const isExpired = !isMaster && !!(activeComp && activeComp.subscription_expires_at && (new Date(activeComp.subscription_expires_at) < new Date()));
    const hasActiveSub = !!(activeComp && !isExpired && activeComp.subscription_status === 'active' && activeComp.subscription_plan && activeComp.subscription_plan.toLowerCase() !== 'none');
    activeCompanyPlanName = hasActiveSub ? activeComp.subscription_plan : null;

    // 1. Update Company Workspace Hero Banner (Shown for Child / Tenant Companies)
    const elHeroPlanName = document.getElementById('sub-hero-plan-name');
    const elHeroBadge = document.getElementById('sub-hero-status-badge');
    const elHeroDesc = document.getElementById('sub-hero-plan-desc');
    const elHeroIcon = document.getElementById('sub-hero-icon-container');

    let cycleInfo = getCyclePeriodInfo(activeComp?.subscription_billing_cycle || 'monthly');

    if (hasActiveSub) {
        if (elHeroPlanName) {
            elHeroPlanName.textContent = `${activeCompanyPlanName} (${cycleInfo.label})`;
            elHeroPlanName.style.color = '#10b981';
        }
        if (elHeroBadge) {
            elHeroBadge.textContent = 'Active ✅';
            elHeroBadge.style.background = 'rgba(16, 185, 129, 0.15)';
            elHeroBadge.style.color = '#10b981';
        }
        if (elHeroDesc) {
            if (activeComp.subscription_expires_at) {
                const expDate = new Date(activeComp.subscription_expires_at);
                const now = new Date();
                const diffMs = expDate - now;
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                const formattedExp = expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                elHeroDesc.textContent = `Valid until ${formattedExp} (${diffDays} day${diffDays === 1 ? '' : 's'} remaining) • WhatsApp broadcast & marketing automation unlocked.`;
            } else {
                elHeroDesc.textContent = 'Verified subscription active via Razorpay. WhatsApp broadcast & marketing automation unlocked.';
            }
        }
        if (elHeroIcon) {
            elHeroIcon.style.color = '#10b981';
            elHeroIcon.style.background = 'rgba(16, 185, 129, 0.15)';
            elHeroIcon.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        }
    } else if (isExpired) {
        const expDate = new Date(activeComp.subscription_expires_at);
        const formattedExp = expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        if (elHeroPlanName) {
            elHeroPlanName.textContent = `${activeComp.subscription_plan || 'Subscription'} (Expired)`;
            elHeroPlanName.style.color = '#ef4444';
        }
        if (elHeroBadge) {
            elHeroBadge.textContent = 'Expired ⚠️';
            elHeroBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elHeroBadge.style.color = '#ef4444';
        }
        if (elHeroDesc) {
            elHeroDesc.textContent = `Your subscription expired on ${formattedExp}. Please renew below to reactivate automated WhatsApp messaging.`;
        }
        if (elHeroIcon) {
            elHeroIcon.style.color = '#ef4444';
            elHeroIcon.style.background = 'rgba(239, 68, 68, 0.12)';
            elHeroIcon.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        }
    } else {
        if (elHeroPlanName) {
            elHeroPlanName.textContent = 'No Active Plan (Unsubscribed)';
            elHeroPlanName.style.color = 'var(--text-muted)';
        }
        if (elHeroBadge) {
            elHeroBadge.textContent = 'Unsubscribed';
            elHeroBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elHeroBadge.style.color = '#ef4444';
        }
        if (elHeroDesc) {
            elHeroDesc.textContent = 'Subscribe to an Inspenox package below to activate WhatsApp broadcasts, templates, and contact automation.';
        }
        if (elHeroIcon) {
            elHeroIcon.style.color = '#ef4444';
            elHeroIcon.style.background = 'rgba(239, 68, 68, 0.12)';
            elHeroIcon.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        }
    }

    // 2. Update Superadmin Top Stat Cards
    const elStatPlanName = document.getElementById('sub-stat-plan-name');
    const elStatBadge = document.getElementById('sub-stat-status-badge');
    const elStatCycle = document.getElementById('sub-stat-plan-cycle');

    if (hasActiveSub) {
        if (elStatPlanName) {
            elStatPlanName.textContent = activeCompanyPlanName;
            elStatPlanName.style.color = 'var(--primary)';
        }
        if (elStatBadge) {
            elStatBadge.textContent = 'Active';
            elStatBadge.style.background = 'rgba(16,185,129,0.15)';
            elStatBadge.style.color = '#10b981';
        }
        if (elStatCycle) {
            if (activeComp?.subscription_expires_at) {
                const formattedExp = new Date(activeComp.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                elStatCycle.textContent = `Valid until ${formattedExp} (${cycleInfo.label})`;
            } else {
                elStatCycle.textContent = 'Renewing via Razorpay';
            }
        }
    } else if (isExpired) {
        if (elStatPlanName) {
            elStatPlanName.textContent = activeComp.subscription_plan || 'Expired';
            elStatPlanName.style.color = '#ef4444';
        }
        if (elStatBadge) {
            elStatBadge.textContent = 'Expired ⚠️';
            elStatBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elStatBadge.style.color = '#ef4444';
        }
        if (elStatCycle) {
            const formattedExp = new Date(activeComp.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            elStatCycle.textContent = `Expired on ${formattedExp}`;
        }
    } else {
        if (elStatPlanName) {
            elStatPlanName.textContent = 'None';
            elStatPlanName.style.color = 'var(--text-muted)';
        }
        if (elStatBadge) {
            elStatBadge.textContent = 'Not Subscribed';
            elStatBadge.style.background = 'rgba(239, 68, 68, 0.15)';
            elStatBadge.style.color = '#ef4444';
        }
        if (elStatCycle) elStatCycle.textContent = 'Select a package below to subscribe';
    }

    if (typeof updateAutomationNavVisibility === 'function') {
        updateAutomationNavVisibility();
    }
}
window.updateCompanySubscriptionStatusUI = updateCompanySubscriptionStatusUI;

function getPlanRank(planIdOrName) {
    if (!planIdOrName) return 0;
    const str = String(planIdOrName).toLowerCase();
    if (str.includes('enterprise')) return 3;
    if (str.includes('growth')) return 2;
    if (str.includes('starter')) return 1;
    return 0;
}
window.getPlanRank = getPlanRank;

function renderPricingCards() {
    const grid = document.getElementById('pricing-plans-grid');
    if (!grid) return;

    const plansToRender = (Array.isArray(allSubscriptionPlans) && allSubscriptionPlans.length > 0)
        ? allSubscriptionPlans
        : DEFAULT_SUBSCRIPTION_PLANS;

    const cycleInfo = getCyclePeriodInfo(currentBillingCycle);
    const hasActiveSub = !!activeCompanyPlanName;
    const activeRank = hasActiveSub ? getPlanRank(activeCompanyPlanName) : 0;

    grid.innerHTML = plansToRender.map(plan => {
        const price = getPlanCyclePrice(plan, currentBillingCycle);
        const periodText = cycleInfo.text;

        const planRank = getPlanRank(plan.id);
        const isCurrentActive = hasActiveSub && (activeRank === planRank);
        const isUpgrade = hasActiveSub && (planRank > activeRank);
        const isDowngrade = hasActiveSub && (planRank < activeRank);

        const featureItems = plan.features.map(f => `
            <li class="pricing-feature-item">
                <svg class="pricing-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>${f}</span>
            </li>
        `).join('');

        let headerBadgeHtml = '';
        if (isCurrentActive) {
            headerBadgeHtml = '<span class="window-badge" style="background:rgba(0,168,132,0.18); color:var(--primary); font-weight:700;">CURRENT PLAN</span>';
        } else if (isUpgrade) {
            headerBadgeHtml = '<span class="window-badge" style="background:rgba(59,130,246,0.18); color:#3b82f6; font-weight:700;">UPGRADE AVAILABLE</span>';
        } else if (isDowngrade) {
            headerBadgeHtml = '<span class="window-badge" style="background:rgba(100,116,139,0.15); color:var(--text-muted); font-weight:600;">LOWER TIER</span>';
        }

        let actionButtonHtml = '';
        if (!hasActiveSub) {
            actionButtonHtml = `
                <button type="button" class="btn ${plan.popular ? 'primary' : 'secondary'}" 
                        onclick="openSubscribeModal('${plan.id}')" 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 700; border-radius: 10px; font-size: 0.925rem;">
                    Subscribe & Boost Sales 🚀
                </button>
            `;
        } else if (isCurrentActive) {
            actionButtonHtml = `
                <button type="button" class="btn primary" 
                        onclick="openSubscribeModal('${plan.id}')" 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 700; border-radius: 10px; font-size: 0.925rem;">
                    Renew / Extend Subscription 💳
                </button>
            `;
        } else if (isUpgrade) {
            actionButtonHtml = `
                <button type="button" class="btn primary" 
                        onclick="openSubscribeModal('${plan.id}')" 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 700; border-radius: 10px; font-size: 0.925rem; background: linear-gradient(135deg, #00a884 0%, #3b82f6 100%); border: none;">
                    Upgrade to ${plan.name} ⚡
                </button>
            `;
        } else if (isDowngrade) {
            actionButtonHtml = `
                <button type="button" class="btn secondary" disabled 
                        style="width: 100%; justify-content: center; padding: 0.75rem; font-weight: 600; border-radius: 10px; font-size: 0.85rem; opacity: 0.55; cursor: not-allowed; background: var(--bg-dark); border: 1px dashed var(--border); color: var(--text-muted);" 
                        title="You are currently subscribed to a higher tier plan. Downgrades are disabled.">
                    Current Plan is Higher (Downgrade Disabled) 🔒
                </button>
            `;
        }

        const strikedPrice = price * 2;

        return `
            <div class="pricing-card ${plan.popular && !isCurrentActive && !isDowngrade ? 'popular' : ''}" style="${isDowngrade ? 'opacity: 0.82;' : ''}">
                ${plan.popular && !isCurrentActive && !isDowngrade ? '<div class="pricing-badge-popular">⭐ Recommended</div>' : ''}
                
                <div class="pricing-card-header">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 class="pricing-title">${plan.name}</h3>
                        ${headerBadgeHtml}
                    </div>
                    <p class="pricing-desc">${plan.description}</p>
                </div>

                <div class="pricing-price-box">
                    <div style="display:flex; align-items:baseline; gap:0.4rem; flex-wrap:wrap;">
                        <span class="pricing-amount">₹${price.toLocaleString('en-IN')}</span>
                        <span class="pricing-strikethrough" style="font-size:1.2rem; font-weight:600; color:var(--text-muted); text-decoration:line-through; text-decoration-thickness:2px; text-decoration-color:#ef4444; opacity:0.75; margin-left:0.35rem;">₹${strikedPrice.toLocaleString('en-IN')}</span>
                        <span class="pricing-period">${periodText}</span>
                    </div>
                    ${cycleInfo.badge ? `<div style="font-size:0.75rem; color:#10b981; font-weight:600; margin-top:0.25rem;">${cycleInfo.badge}</div>` : ''}
                </div>

                <ul class="pricing-features-list">
                    ${featureItems}
                </ul>

                ${actionButtonHtml}
            </div>
        `;
    }).join('');
}
window.renderPricingCards = renderPricingCards;

function setBillingCycle(cycle) {
    currentBillingCycle = cycle;
    const subSelect = document.getElementById('sub-billing-cycle-select');
    if (subSelect && subSelect.value !== cycle) {
        subSelect.value = cycle;
    }
    const checkoutSelect = document.getElementById('checkout-cycle-select');
    if (checkoutSelect && checkoutSelect.value !== cycle) {
        checkoutSelect.value = cycle;
    }
    renderPricingCards();
}
window.setBillingCycle = setBillingCycle;

function toggleBillingCycle() {
    setBillingCycle(currentBillingCycle === 'monthly' ? 'annual' : 'monthly');
}
window.toggleBillingCycle = toggleBillingCycle;

function switchSubTab(tabName) {
    const isSuper = isSuperAdmin();
    // Strictly prevent non-superadmin or other companies from accessing coupons or platform audit logs
    if (!isSuper && (tabName === 'coupons' || tabName === 'logs')) {
        tabName = 'plans';
    }

    const panels = {
        plans: document.getElementById('sub-tab-panel-plans'),
        receipts: document.getElementById('sub-tab-panel-receipts'),
        coupons: document.getElementById('sub-tab-panel-coupons'),
        logs: document.getElementById('sub-tab-panel-logs')
    };
    const buttons = {
        plans: document.getElementById('tab-btn-sub-plans'),
        receipts: document.getElementById('tab-btn-sub-receipts'),
        coupons: document.getElementById('tab-btn-sub-coupons'),
        logs: document.getElementById('tab-btn-sub-logs')
    };

    Object.keys(panels).forEach(key => {
        if (panels[key]) panels[key].style.display = (key === tabName) ? 'block' : 'none';
        if (buttons[key]) {
            if (key === tabName) {
                buttons[key].classList.add('active');
            } else {
                buttons[key].classList.remove('active');
            }
        }
    });

    if (tabName === 'receipts' && typeof window.loadCompanyReceipts === 'function') window.loadCompanyReceipts();
    if (tabName === 'coupons' && isSuper && typeof window.loadCouponsList === 'function') window.loadCouponsList();
    if (tabName === 'logs' && isSuper && typeof window.loadPaymentLogs === 'function') window.loadPaymentLogs();
}
window.switchSubTab = switchSubTab;

async function loadSubscriptions() {
    // 1. Instantly render pricing cards and current active company plan without waiting for network
    updateCompanySubscriptionStatusUI();
    renderPricingCards();

    // 2. Strict Superadmin vs Other Companies Configuration
    const isSuper = isSuperAdmin();
    const btnCoupons = document.getElementById('tab-btn-sub-coupons');
    const btnLogs = document.getElementById('tab-btn-sub-logs');
    const btnReceipts = document.getElementById('tab-btn-sub-receipts');
    const panelCoupons = document.getElementById('sub-tab-panel-coupons');
    const panelLogs = document.getElementById('sub-tab-panel-logs');
    const statSavings = document.getElementById('sub-stat-card-coupons');
    const subTabsBar = document.getElementById('sub-tabs-container');
    const adminStatsGrid = document.getElementById('sub-superadmin-stats-grid');
    const companyHeroBanner = document.getElementById('sub-company-hero-banner');

    if (isSuper) {
        // Superadmin: Show the full admin stats grid (Active Plan, Gateway, Total Orders, Savings)
        if (adminStatsGrid) adminStatsGrid.style.display = 'grid';
        if (companyHeroBanner) companyHeroBanner.style.display = 'none';

        // Superadmin sees all 4 sub-tabs
        if (btnCoupons) btnCoupons.style.display = 'inline-flex';
        if (btnLogs) btnLogs.style.display = 'inline-flex';
        if (statSavings) statSavings.style.display = 'flex';
        if (btnReceipts) btnReceipts.style.display = 'inline-flex';
        if (subTabsBar) subTabsBar.style.display = 'flex';
    } else {
        // Child / Tenant Company ("other companies"):
        // Remove the 2 admin stat cards (Razorpay Gateway & Total Orders Paid) by hiding the admin stats grid
        if (adminStatsGrid) adminStatsGrid.style.display = 'none';
        // Show clean, uncluttered Company Workspace Hero Banner
        if (companyHeroBanner) companyHeroBanner.style.display = 'flex';

        // Strictly hide superadmin features
        if (btnCoupons) btnCoupons.style.display = 'none';
        if (btnLogs) btnLogs.style.display = 'none';
        if (panelCoupons) panelCoupons.style.display = 'none';
        if (panelLogs) panelLogs.style.display = 'none';
        if (statSavings) statSavings.style.display = 'none';

        // Show Subscription Packages & Payment Receipts tabs
        if (btnReceipts) btnReceipts.style.display = 'inline-flex';
        if (subTabsBar) subTabsBar.style.display = 'flex';
    }

    // 3. Asynchronously fetch live plans and gateway status
    try {
        const res = await apiFetch('/api/payments?action=plans');
        const data = await res.json();

        if (data.success && Array.isArray(data.plans) && data.plans.length > 0) {
            allSubscriptionPlans = data.plans;
            renderPricingCards();
        }

        if (isSuper) {
            const elGateway = document.getElementById('sub-stat-gateway-status');
            const elRzpBadge = document.getElementById('sub-stat-rzp-badge');
            if (data.has_keys) {
                if (elGateway) elGateway.textContent = 'Configured ✅';
                if (elRzpBadge) {
                    elRzpBadge.textContent = 'Razorpay Live';
                    elRzpBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                    elRzpBadge.style.color = '#10b981';
                }
            } else {
                if (elGateway) elGateway.textContent = 'Test Mode 🧪';
                if (elRzpBadge) {
                    elRzpBadge.textContent = 'Sandbox / Test';
                    elRzpBadge.style.background = 'rgba(234, 179, 8, 0.15)';
                    elRzpBadge.style.color = '#eab308';
                }
            }
        }
    } catch (err) {
        console.warn('Live subscription plans check:', err);
    }

    // 4. If superadmin, fetch aggregated payment statistics without blocking
    if (isSuper) {
        try {
            const logsRes = await apiFetch('/api/payments?action=logs');
            const logsData = await logsRes.json();
            if (logsData.success && logsData.stats) {
                const s = logsData.stats;
                const elOrders = document.getElementById('sub-stat-orders-count');
                const elRevenue = document.getElementById('sub-stat-total-revenue');
                const elSavings = document.getElementById('sub-stat-savings-claimed');

                if (elOrders) elOrders.textContent = s.total_orders || 0;
                if (elRevenue) elRevenue.textContent = `Total Paid: ₹${Number(s.total_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                if (elSavings) elSavings.textContent = `₹${Number(s.total_discounts || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            }
        } catch (e) { }
    }
}
window.loadSubscriptions = loadSubscriptions;


/* --------------------------------------------------------------------------
 * Subscriptions Checkout, Razorpay Payment Gateway, Coupon Redemption, Invoices & Receipts
 * -------------------------------------------------------------------------- */

/* ========================================================
   Subscriptions Checkout, Coupons & Management Handlers
   ======================================================== */
const RAZORPAY_CONVENIENCE_FEE_PCT = 2.36; // 2% Razorpay transaction fee + 18% GST on Gateway fee

function calculateConvenienceFeeAndTotal(subtotal) {
    if (!subtotal || subtotal <= 0) {
        return { convenienceFee: 0, finalAmount: 0 };
    }
    // Gross-up formula: ensures merchant gets exact subtotal after 2.36% Razorpay deduction
    // finalAmount * (1 - 0.0236) = subtotal => finalAmount = subtotal / (1 - 0.0236)
    const rate = RAZORPAY_CONVENIENCE_FEE_PCT / 100;
    const finalAmount = Math.round((subtotal / (1 - rate)) * 100) / 100;
    const convenienceFee = Math.round((finalAmount - subtotal) * 100) / 100;
    return { convenienceFee, finalAmount };
}

function recalculateCheckoutSummary(basePrice, discountAmount = 0) {
    const numBase = parseFloat(basePrice) || 0;
    const numDisc = Math.min(numBase, parseFloat(discountAmount) || 0);
    const subtotal = Math.max(0, numBase - numDisc);
    const { convenienceFee, finalAmount } = calculateConvenienceFeeAndTotal(subtotal);

    const elBase = document.getElementById('checkout-display-base-price');
    const elDiscRow = document.getElementById('checkout-row-discount');
    const elFee = document.getElementById('checkout-display-fee');
    const elFinal = document.getElementById('checkout-display-final-price');

    const inpDisc = document.getElementById('checkout-applied-discount-amount');
    const inpFee = document.getElementById('checkout-applied-convenience-fee');
    const inpFinal = document.getElementById('checkout-applied-final-amount');

    if (inpDisc) inpDisc.value = numDisc;
    if (inpFee) inpFee.value = convenienceFee;
    if (inpFinal) inpFinal.value = finalAmount;

    if (elBase) elBase.textContent = `₹${numBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (elFee) elFee.textContent = `+ ₹${convenienceFee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (elFinal) elFinal.textContent = `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (numDisc > 0) {
        if (elDiscRow) elDiscRow.style.display = 'flex';
    } else {
        if (elDiscRow) elDiscRow.style.display = 'none';
    }

    return { basePrice: numBase, discountAmount: numDisc, subtotal, convenienceFee, finalAmount };
}

window.openSubscribeModal = function openSubscribeModal(planId) {
    const modal = document.getElementById('checkout-modal');
    if (!modal) return;

    const plan = allSubscriptionPlans.find(p => p.id === planId) || allSubscriptionPlans[0];
    if (!plan) return;

    const cycleVal = currentBillingCycle || 'monthly';
    const checkoutSelect = document.getElementById('checkout-cycle-select');
    if (checkoutSelect) checkoutSelect.value = cycleVal;

    const basePrice = getPlanCyclePrice(plan, cycleVal);
    const cycleInfo = getCyclePeriodInfo(cycleVal);

    document.getElementById('checkout-plan-id').value = plan.id;
    document.getElementById('checkout-plan-name').value = `${plan.name} (${cycleInfo.label})`;
    document.getElementById('checkout-plan-price').value = basePrice;
    document.getElementById('checkout-applied-coupon-id').value = '';

    document.getElementById('checkout-display-plan').textContent = plan.name;
    const dispCycle = document.getElementById('checkout-display-cycle');
    if (dispCycle) dispCycle.textContent = cycleInfo.label;

    recalculateCheckoutSummary(basePrice, 0);

    const couponFeedback = document.getElementById('checkout-coupon-feedback');
    if (couponFeedback) {
        couponFeedback.style.display = 'none';
        couponFeedback.innerHTML = '';
    }
    const couponInput = document.getElementById('checkout-coupon-code');
    if (couponInput) couponInput.value = '';

    // Auto-prefill subscriber email & phone
    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }
    const coId = getCompanyId();
    const activeComp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;

    const emailInput = document.getElementById('checkout-email');
    const phoneInput = document.getElementById('checkout-phone');

    if (emailInput) emailInput.value = user.email || activeComp?.email || '';
    if (phoneInput) phoneInput.value = user.phone || activeComp?.phone || '';

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.onCheckoutCycleChange = function onCheckoutCycleChange(newCycle) {
    currentBillingCycle = newCycle || 'monthly';

    // Synchronize page-level selector
    const pageSelect = document.getElementById('sub-billing-cycle-select');
    if (pageSelect && pageSelect.value !== currentBillingCycle) {
        pageSelect.value = currentBillingCycle;
    }

    const planId = document.getElementById('checkout-plan-id')?.value;
    const plan = allSubscriptionPlans.find(p => p.id === planId) || allSubscriptionPlans[0];
    if (!plan) return;

    const basePrice = getPlanCyclePrice(plan, currentBillingCycle);
    const cycleInfo = getCyclePeriodInfo(currentBillingCycle);

    document.getElementById('checkout-plan-name').value = `${plan.name} (${cycleInfo.label})`;
    document.getElementById('checkout-plan-price').value = basePrice;

    const dispCycle = document.getElementById('checkout-display-cycle');
    if (dispCycle) dispCycle.textContent = cycleInfo.label;

    // If coupon is already present, recalculate coupon discount against the new base price
    const couponCode = document.getElementById('checkout-coupon-code')?.value?.trim();
    if (couponCode) {
        applyCheckoutCoupon(true);
    } else {
        recalculateCheckoutSummary(basePrice, 0);
    }

    renderPricingCards();
};

window.closeCheckoutModal = function closeCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

/* ========================================================
   Payment Overlay & Instant UI Feedback
   ======================================================== */
function showPaymentOverlay(title, desc, icon = '🔒') {
    const overlay = document.getElementById('payment-processing-overlay');
    const t = document.getElementById('pay-overlay-title');
    const d = document.getElementById('pay-overlay-desc');
    const i = document.getElementById('pay-overlay-icon');
    if (t) t.textContent = title;
    if (d) d.textContent = desc;
    if (i) i.textContent = icon;
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }
}
window.showPaymentOverlay = showPaymentOverlay;

function hidePaymentOverlay() {
    const overlay = document.getElementById('payment-processing-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
}
window.hidePaymentOverlay = hidePaymentOverlay;

window.resetCheckoutDiscount = function resetCheckoutDiscount() {
    const basePrice = parseFloat(document.getElementById('checkout-plan-price')?.value) || 0;
    const appliedCoupon = document.getElementById('checkout-applied-coupon-id');
    const feedback = document.getElementById('checkout-coupon-feedback');

    if (appliedCoupon) appliedCoupon.value = '';
    recalculateCheckoutSummary(basePrice, 0);

    if (feedback) {
        feedback.style.display = 'none';
        feedback.innerHTML = '';
    }
};

window.applyCheckoutCoupon = async function applyCheckoutCoupon(isAuto = false) {
    const codeInput = document.getElementById('checkout-coupon-code');
    const feedback = document.getElementById('checkout-coupon-feedback');
    const btn = document.getElementById('btn-apply-coupon');
    const basePrice = parseFloat(document.getElementById('checkout-plan-price')?.value) || 0;

    if (!codeInput || !codeInput.value.trim()) {
        resetCheckoutDiscount();
        if (!isAuto && feedback) {
            feedback.style.display = 'block';
            feedback.style.color = '#ef4444';
            feedback.textContent = 'Please enter a coupon code.';
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;"></span>';
    }

    if (isAuto && feedback) {
        feedback.style.display = 'block';
        feedback.style.color = 'var(--text-muted)';
        feedback.innerHTML = '<span class="spinner-icon" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px;"></span> Validating coupon...';
    }

    try {
        const res = await apiFetch('/api/payments?action=validate-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coupon_code: codeInput.value.trim(),
                amount: basePrice
            })
        });
        const data = await res.json();

        if (data.success && data.valid) {
            document.getElementById('checkout-applied-coupon-id').value = data.coupon_id;
            recalculateCheckoutSummary(basePrice, data.discount_amount);

            // Update UI discount badge
            const rowDisc = document.getElementById('checkout-row-discount');
            const elDisc = document.getElementById('checkout-display-discount');

            if (rowDisc) rowDisc.style.display = 'flex';
            if (elDisc) elDisc.textContent = `- ₹${Number(data.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${data.discount_percent}% OFF)`;

            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.color = '#10b981';
                feedback.innerHTML = `🎉 Coupon <strong>${data.coupon_code}</strong> applied! You saved ₹${Number(data.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`;
            }
        } else {
            resetCheckoutDiscount();
            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.color = '#ef4444';
                feedback.textContent = `⚠️ ${data.error || 'Invalid or expired coupon.'}`;
            }
        }
    } catch (err) {
        if (feedback) {
            feedback.style.display = 'block';
            feedback.style.color = '#ef4444';
            feedback.textContent = `⚠️ Error checking coupon: ${err.message}`;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Apply';
        }
    }
};

// Automatic coupon check on typing (debounced)
let couponAutoTimer = null;
document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'checkout-coupon-code') {
        clearTimeout(couponAutoTimer);
        const val = e.target.value.trim();
        if (!val) {
            resetCheckoutDiscount();
            return;
        }
        couponAutoTimer = setTimeout(() => {
            applyCheckoutCoupon(true);
        }, 400);
    }
});

document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'checkout-coupon-code') {
        clearTimeout(couponAutoTimer);
        if (e.target.value.trim()) {
            applyCheckoutCoupon(true);
        } else {
            resetCheckoutDiscount();
        }
    }
});

window.proceedToRazorpayPayment = async function proceedToRazorpayPayment(e) {
    if (e) e.preventDefault();

    const planName = document.getElementById('checkout-plan-name').value;
    const basePrice = parseFloat(document.getElementById('checkout-plan-price').value) || 0;
    const couponCode = document.getElementById('checkout-coupon-code')?.value?.trim() || '';
    const couponId = document.getElementById('checkout-applied-coupon-id').value;
    const discountAmount = parseFloat(document.getElementById('checkout-applied-discount-amount').value) || 0;
    const finalAmount = parseFloat(document.getElementById('checkout-applied-final-amount').value) || (basePrice - discountAmount);
    const email = document.getElementById('checkout-email').value.trim();
    const phone = document.getElementById('checkout-phone').value.trim();
    const companyId = getCompanyId();

    if (!email || !phone) {
        showModal('Required Details', 'Please fill in both email and phone number to continue.');
        return;
    }

    const btn = document.getElementById('btn-proceed-payment');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Initializing Secure Checkout...';
    }

    // Launch fullscreen loading overlay immediately
    showPaymentOverlay('Initializing Secure Checkout', 'Connecting to Razorpay gateway...', '🔒');

    try {
        // Step 1: Create Order on backend
        const orderRes = await apiFetch('/api/payments?action=create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan_name: planName,
                billing_cycle: currentBillingCycle,
                original_amount: basePrice,
                coupon_code: couponCode,
                email,
                phone,
                company_id: companyId
            })
        });

        const orderData = await orderRes.json();
        if (!orderData.success) {
            hidePaymentOverlay();
            throw new Error(orderData.error || 'Failed to initialize payment order');
        }

        // Step 2: Launch Razorpay Checkout Modal
        if (orderData.is_live && window.Razorpay) {
            const options = {
                key: orderData.key_id,
                amount: Math.round(orderData.amount * 100),
                currency: 'INR',
                name: 'Inspenox Business Suite',
                description: `Subscription: ${planName}`,
                image: '/favicon.png',
                order_id: orderData.order_id,
                prefill: {
                    name: email.split('@')[0],
                    email: email,
                    contact: phone
                },
                theme: {
                    color: '#00a884'
                },
                handler: async function (response) {
                    // Show verification animation overlay immediately
                    showPaymentOverlay('Verifying Payment Signature', 'Confirming payment with Razorpay & activating your subscription tier...', '⚡');
                    try {
                        const verifyRes = await apiFetch('/api/payments?action=verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                                plan_name: planName,
                                billing_cycle: currentBillingCycle,
                                original_amount: orderData.original_amount,
                                discount_amount: orderData.discount_amount,
                                convenience_fee: orderData.convenience_fee,
                                final_amount: orderData.amount,
                                coupon_code: orderData.coupon_code,
                                coupon_id: orderData.coupon_id,
                                influencer_id: orderData.influencer_id,
                                commission_amount: orderData.commission_amount,
                                user_email: email,
                                user_phone: phone,
                                company_id: companyId
                            })
                        });

                        const verifyData = await verifyRes.json();
                        hidePaymentOverlay();

                        if (verifyData.success) {
                            closeCheckoutModal();

                            // 1. Instantly update active company plan and stored validity in memory
                            activeCompanyPlanName = planName;
                            const coId = getCompanyId();
                            if (Array.isArray(allCompanies)) {
                                const comp = allCompanies.find(c => String(c.id) === String(coId)) || allCompanies[0];
                                if (comp) {
                                    comp.subscription_plan = planName;
                                    comp.subscription_status = 'active';
                                    comp.subscription_expires_at = verifyData.subscription_expires_at;
                                    comp.subscription_billing_cycle = verifyData.subscription_billing_cycle || currentBillingCycle;
                                    comp.is_expired = false;
                                }
                            }

                            // 2. Refresh UI immediately without hard refresh
                            updateCompanySubscriptionStatusUI();
                            renderPricingCards();

                            // 3. Asynchronously sync latest company state from API
                            loadCompanies().then(() => {
                                updateCompanySubscriptionStatusUI();
                                renderPricingCards();
                                if (typeof loadCompanyReceipts === 'function') {
                                    loadCompanyReceipts();
                                }
                            });

                            const expDateStr = verifyData.subscription_expires_at 
                                ? new Date(verifyData.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) 
                                : '';
                            const validityNotice = expDateStr ? `<br><br>📅 <strong>Valid Until:</strong> ${expDateStr}` : '';
                            const targetNoticeEmail = email || verifyData.payment?.user_email || 'your email';
                            const emailNotice = verifyData.email_sent 
                                ? `<br>📧 An official payment receipt and plan confirmation has been sent to <strong>${targetNoticeEmail}</strong>.` 
                                : (verifyData.email_error ? `<br><small style="color:var(--text-muted);">📧 Email status: ${verifyData.email_error}</small>` : '');

                            showModal(
                                'Payment Successful! 🎉', 
                                `Thank you! Your payment of ₹${orderData.amount.toLocaleString('en-IN')} for <strong>${planName}</strong> has been verified and active features unlocked!${validityNotice}${emailNotice}`
                            );
                        } else {
                            showModal('Verification Failed', verifyData.error || 'Unable to verify payment signature.');
                        }
                    } catch (err) {
                        hidePaymentOverlay();
                        showModal('Error', err.message);
                    }
                },
                modal: {
                    ondismiss: function () {
                        hidePaymentOverlay();
                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = '<span>Proceed to Pay</span> 💳';
                        }
                    }
                }
            };

            // Hide processing overlay right as Razorpay opens
            hidePaymentOverlay();
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (failResp) {
                hidePaymentOverlay();
                showModal('Payment Failed', failResp.error?.description || 'Payment was declined or cancelled.');
            });
            rzp.open();
        } else {
            // Simulated / Mock Sandbox Flow for Testing
            hidePaymentOverlay();
            showModal(
                'Sandbox Payment Mode 🧪',
                `Razorpay live keys are currently running in test sandbox mode.<br><br><strong>Order ID:</strong> <code>${orderData.order_id}</code><br><strong>Plan:</strong> ${planName}<br><strong>Amount:</strong> ₹${orderData.amount.toLocaleString('en-IN')}<br><br>Simulate successful payment confirmation now?`,
                'confirm',
                async () => {
                    showPaymentOverlay('Activating Sandbox Subscription', 'Verifying simulated payment signature...', '⚡');
                    const mockPaymentId = `pay_sim_${Date.now()}`;
                    const verifyRes = await apiFetch('/api/payments?action=verify-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_payment_id: mockPaymentId,
                            razorpay_order_id: orderData.order_id,
                            razorpay_signature: 'mock_signature_verified',
                            plan_name: planName,
                            billing_cycle: currentBillingCycle,
                            original_amount: orderData.original_amount,
                            discount_amount: orderData.discount_amount,
                            convenience_fee: orderData.convenience_fee,
                            final_amount: orderData.amount,
                            coupon_code: orderData.coupon_code,
                            coupon_id: orderData.coupon_id,
                            influencer_id: orderData.influencer_id,
                            commission_amount: orderData.commission_amount,
                            user_email: email,
                            user_phone: phone,
                            company_id: companyId
                        })
                    });

                    const verifyData = await verifyRes.json();
                    hidePaymentOverlay();

                    if (verifyData.success) {
                        closeCheckoutModal();

                        // Update in-memory state
                        activeCompanyPlanName = planName;
                        const coId = getCompanyId();
                        if (Array.isArray(allCompanies)) {
                            const comp = allCompanies.find(c => String(c.id) === String(coId)) || allCompanies[0];
                            if (comp) {
                                comp.subscription_plan = planName;
                                comp.subscription_status = 'active';
                                comp.subscription_expires_at = verifyData.subscription_expires_at;
                                comp.subscription_billing_cycle = verifyData.subscription_billing_cycle || currentBillingCycle;
                                comp.is_expired = false;
                            }
                        }
                        updateCompanySubscriptionStatusUI();
                        renderPricingCards();

                        loadCompanies().then(() => {
                            updateCompanySubscriptionStatusUI();
                            renderPricingCards();
                            if (typeof loadCompanyReceipts === 'function') {
                                loadCompanyReceipts();
                            }
                        });

                        const expDateStr = verifyData.subscription_expires_at 
                            ? new Date(verifyData.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) 
                            : '';
                        const validityNotice = expDateStr ? `<br><br>📅 <strong>Valid Until:</strong> ${expDateStr}` : '';
                        const targetNoticeEmail = email || verifyData.payment?.user_email || 'your email';
                        const emailNotice = verifyData.email_sent 
                            ? `<br>📧 An official payment receipt and plan confirmation has been sent to <strong>${targetNoticeEmail}</strong>.` 
                            : (verifyData.email_error ? `<br><small style="color:var(--text-muted);">📧 Email status: ${verifyData.email_error}</small>` : '');

                        showModal('Subscription Activated! 🎉', `Payment verified successfully! Subscription activated for <strong>${planName}</strong>.${validityNotice}${emailNotice}`);
                    } else {
                        showModal('Error', verifyData.error || 'Verification failed.');
                    }
                }
            );
        }
    } catch (err) {
        hidePaymentOverlay();
        showModal('Payment Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Proceed to Pay</span> 💳';
        }
    }
};

window.loadCouponsList = async function loadCouponsList() {
    const tbody = document.getElementById('coupons-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Loading promotional coupons...</td></tr>';

    try {
        const res = await apiFetch('/api/payments?action=coupons');
        const data = await res.json();

        if (data.success && Array.isArray(data.coupons)) {
            allCouponsList = data.coupons;

            if (allCouponsList.length === 0) {
                tbody.innerHTML = renderTableEmptyStateHtml(9, 'No coupons created yet', 'Click "+ Create New Coupon" to generate discount codes.', '🏷️');
                return;
            }

            tbody.innerHTML = allCouponsList.map((c, idx) => {
                const used = c.used_count || 0;
                const limit = c.usage_limit ? c.usage_limit : '∞';
                const usagePercent = c.usage_limit ? Math.min(100, Math.round((used / c.usage_limit) * 100)) : 0;
                const isExpired = c.expiry_date && new Date(c.expiry_date) < new Date();
                const influencer = c.influencer_username ? `<strong>@${c.influencer_username}</strong>` : '<span style="color:var(--text-muted);">Company Global</span>';

                let statusBadge = '';
                if (!c.is_active) {
                    statusBadge = '<span class="window-badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Inactive</span>';
                } else if (isExpired) {
                    statusBadge = '<span class="window-badge" style="background:rgba(234,179,8,0.15); color:#eab308;">Expired</span>';
                } else {
                    statusBadge = '<span class="window-badge" style="background:rgba(16,185,129,0.15); color:#10b981;">Active ✅</span>';
                }

                return `
                    <tr>
                        <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                        <td>
                            <div class="coupon-code-pill" title="Click to copy" onclick="navigator.clipboard.writeText('${c.coupon_code}'); showModal('Copied', 'Coupon code copied to clipboard!')">
                                <span>${c.coupon_code}</span> 📋
                            </div>
                        </td>
                        <td><strong style="color:var(--primary); font-size:0.95rem;">${c.discount_percent}% OFF</strong></td>
                        <td><span style="color:#eab308; font-weight:600;">${c.commission_percent || 0}% Cut</span></td>
                        <td>
                            <div style="font-size:0.8rem;">${used} / ${limit} used</div>
                            ${c.usage_limit ? `<div style="width:70px; height:4px; background:var(--bg-dark); border-radius:2px; margin-top:4px; overflow:hidden;"><div style="width:${usagePercent}%; height:100%; background:var(--primary);"></div></div>` : ''}
                        </td>
                        <td>${influencer}</td>
                        <td><span style="font-size:0.8rem; color:var(--text-muted);">${c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : 'No Expiry'}</span></td>
                        <td>${statusBadge}</td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn secondary sm" onclick="toggleCouponStatus(${c.id}, ${c.is_active})">
                                ${c.is_active ? 'Pause' : 'Activate'}
                            </button>
                            <button class="btn danger sm" onclick="deleteCoupon(${c.id}, '${c.coupon_code}')">
                                Delete
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        tbody.innerHTML = renderTableEmptyStateHtml(9, 'Failed to load coupons', 'Please check your connection and retry.', '⚠️');
    }
};

window.openCreateCouponModal = function openCreateCouponModal() {
    const modal = document.getElementById('create-coupon-modal');
    if (!modal) return;

    document.getElementById('create-coupon-form')?.reset();

    // Populate user/influencer select
    const selectUser = document.getElementById('coupon-user-select');
    if (selectUser) {
        selectUser.innerHTML = '<option value="">None (General Company Coupon)</option>';
        if (Array.isArray(allUsersList) && allUsersList.length > 0) {
            allUsersList.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${u.username} (${u.role || 'user'})${u.email ? ' - ' + u.email : ''}`;
                selectUser.appendChild(opt);
            });
        }
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeCreateCouponModal = function closeCreateCouponModal() {
    const modal = document.getElementById('create-coupon-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.saveNewCoupon = async function saveNewCoupon(e) {
    if (e) e.preventDefault();

    const code = document.getElementById('coupon-code-input').value.trim();
    const discount = document.getElementById('coupon-discount-input').value;
    const commission = document.getElementById('coupon-commission-input').value || 0;
    const userId = document.getElementById('coupon-user-select').value;
    const limit = document.getElementById('coupon-limit-input').value;
    const expiry = document.getElementById('coupon-expiry-input').value;

    const btn = document.getElementById('btn-save-coupon');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Creating...';
    }

    try {
        const res = await apiFetch('/api/payments?action=create-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coupon_code: code,
                discount_percent: discount,
                commission_percent: commission,
                user_id: userId,
                usage_limit: limit,
                expiry_date: expiry || null
            })
        });

        const data = await res.json();
        if (data.success) {
            closeCreateCouponModal();
            showModal('Coupon Created', `Promotional code "${code}" created successfully!`);
            loadCouponsList();
        } else {
            showModal('Error', data.error || 'Failed to create coupon.');
        }
    } catch (err) {
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Create Coupon';
        }
    }
};

window.toggleCouponStatus = async function toggleCouponStatus(id, currentActive) {
    try {
        const res = await apiFetch('/api/payments?action=toggle-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_active: !currentActive })
        });
        const data = await res.json();
        if (data.success) {
            loadCouponsList();
        } else {
            showModal('Error', data.error || 'Failed to update coupon status.');
        }
    } catch (err) {
        showModal('Error', err.message);
    }
};

window.deleteCoupon = function deleteCoupon(id, code) {
    showModal('Delete Coupon', `Are you sure you want to permanently delete coupon "${code}"?`, 'confirm', async () => {
        try {
            const res = await apiFetch(`/api/payments?action=delete-coupon&id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                loadCouponsList();
            } else {
                showModal('Error', data.error || 'Failed to delete coupon.');
            }
        } catch (err) {
            showModal('Error', err.message);
        }
    });
};

window.loadPaymentLogs = async function loadPaymentLogs() {
    const tbody = document.getElementById('payment-logs-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><span class="spinner"></span> Loading payment logs...</td></tr>';

    try {
        const res = await apiFetch('/api/payments?action=logs');
        const data = await res.json();

        if (data.success && Array.isArray(data.logs)) {
            allPaymentLogsList = data.logs;

            if (allPaymentLogsList.length === 0) {
                tbody.innerHTML = renderTableEmptyStateHtml(10, 'No payment transactions recorded yet', 'Payments processed via Razorpay will be logged here.', '💳');
                return;
            }

            renderPaymentLogs(allPaymentLogsList);
        }
    } catch (err) {
        tbody.innerHTML = renderTableEmptyStateHtml(10, 'Failed to load payment transactions', 'Please check connection and retry.', '⚠️');
    }
};

function renderPaymentLogs(logs) {
    const tbody = document.getElementById('payment-logs-table-body');
    if (!tbody) return;

    if (logs.length === 0) {
        tbody.innerHTML = renderTableEmptyStateHtml(10, 'No matching payment transactions found', 'Try adjusting your search criteria.', '🔍');
        return;
    }

    tbody.innerHTML = logs.map((p, idx) => {
        const orderIdShort = p.order_id ? `<code>${p.order_id}</code>` : '-';
        const payIdShort = p.payment_id ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;"><code>${p.payment_id}</code></div>` : '';
        const userContact = `
            <div style="font-size:0.8rem; line-height:1.35;">
                <div style="color:var(--text-main); font-weight:500;">${p.user_email || 'No email'}</div>
                ${p.user_phone ? `<div style="color:var(--text-muted); font-size:0.75rem;">${formatDisplayPhone(p.user_phone)}</div>` : ''}
            </div>
        `;
        const couponInfo = p.coupon_code ? `
            <div>
                <span class="coupon-code-pill" style="font-size:0.75rem;">${p.coupon_code}</span>
                ${p.commission_amount > 0 ? `<div style="font-size:0.725rem; color:#eab308; margin-top:2px;">Cut: ₹${Number(p.commission_amount).toFixed(2)}</div>` : ''}
            </div>
        ` : '<span style="color:var(--text-muted); font-size:0.75rem;">None</span>';

        return `
            <tr>
                <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                <td>${orderIdShort}${payIdShort}</td>
                <td>${userContact}</td>
                <td><strong style="color:var(--primary); font-size:0.85rem;">${p.plan_name || 'Standard'}</strong></td>
                <td><span style="font-size:0.85rem; color:var(--text-muted);">₹${Number(p.original_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></td>
                <td><span style="font-size:0.85rem; color:${p.discount_amount > 0 ? '#10b981' : 'var(--text-muted)'};">- ₹${Number(p.discount_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></td>
                <td><strong style="color:var(--text-main); font-size:0.95rem;">₹${Number(p.final_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                <td>${couponInfo}</td>
                <td><span class="window-badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700; text-transform:uppercase;">${p.status || 'paid'}</span></td>
                <td><span style="font-size:0.75rem; color:var(--text-muted);">${p.created_at_formatted || formatTime(p.created_at)}</span></td>
            </tr>
        `;
    }).join('');
}

window.filterPaymentLogs = function filterPaymentLogs() {
    const q = (document.getElementById('search-payment-logs')?.value || '').toLowerCase().trim();
    if (!q) {
        renderPaymentLogs(allPaymentLogsList);
        return;
    }
    const filtered = allPaymentLogsList.filter(p => {
        return (p.order_id && p.order_id.toLowerCase().includes(q)) ||
            (p.payment_id && p.payment_id.toLowerCase().includes(q)) ||
            (p.user_email && p.user_email.toLowerCase().includes(q)) ||
            (p.user_phone && p.user_phone.toLowerCase().includes(q)) ||
            (p.plan_name && p.plan_name.toLowerCase().includes(q)) ||
            (p.coupon_code && p.coupon_code.toLowerCase().includes(q));
    });
    renderPaymentLogs(filtered);
};

/* ========================================================
   Company Workspace Payment Receipts & Official Invoices
   ======================================================== */
let allCompanyReceiptsList = [];

window.loadCompanyReceipts = async function loadCompanyReceipts() {
    const tbody = document.getElementById('company-receipts-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner-icon" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Loading payment receipts...</td></tr>';

    const coId = getCompanyId();
    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }
    const email = user.email || '';

    try {
        const url = `/api/payments?action=receipts&company_id=${coId || ''}&email=${encodeURIComponent(email)}`;
        const res = await apiFetch(url);
        const data = await res.json();

        if (data.success && Array.isArray(data.logs)) {
            allCompanyReceiptsList = data.logs;

            if (allCompanyReceiptsList.length === 0) {
                tbody.innerHTML = renderTableEmptyStateHtml(9, 'No payment receipts found for this workspace yet', 'When you subscribe or renew a package, official tax receipts will appear here.', '📜');
                return;
            }

            tbody.innerHTML = allCompanyReceiptsList.map((r, idx) => {
                const formattedDate = r.created_at_formatted || (r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '-');
                const formattedValidUntil = r.valid_until_formatted || (r.valid_until ? new Date(r.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
                const orderIdShort = r.order_id ? `<code>${r.order_id}</code>` : '-';
                const paymentIdShort = r.payment_id ? `<code>${r.payment_id}</code>` : '-';
                const finalAmt = Number(r.final_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                const plan = r.plan_name || 'Standard Plan';
                const statusBadge = '<span class="window-badge" style="background:rgba(16,185,129,0.15); color:#10b981; font-weight:700;">PAID ✅</span>';

                return `
                    <tr>
                        <td><strong style="color:var(--text-muted); font-size:0.85rem;">${idx + 1}</strong></td>
                        <td><span style="font-size:0.825rem; color:var(--text-main); font-weight:500;">${formattedDate}</span></td>
                        <td>${orderIdShort}</td>
                        <td><span style="font-size:0.8rem; color:var(--text-muted);">${paymentIdShort}</span></td>
                        <td><strong style="color:var(--primary); font-size:0.9rem;">${plan}</strong></td>
                        <td><span style="font-size:0.85rem; color:#10b981; font-weight:600;">${formattedValidUntil}</span></td>
                        <td><strong style="color:var(--text-main); font-size:0.95rem;">₹${finalAmt}</strong></td>
                        <td>${statusBadge}</td>
                        <td style="text-align:right;">
                            <button type="button" class="btn secondary sm" onclick="viewCompanyReceipt(${r.id})" style="display:inline-flex; align-items:center; gap:5px; padding:0.35rem 0.75rem; font-size:0.775rem;">
                                📜 <span>View Invoice</span>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = renderTableEmptyStateHtml(9, 'No payment receipts available', 'When your workspace subscribes to a plan, invoices will be listed here.', '📜');
        }
    } catch (err) {
        console.error('Error loading receipts:', err);
        tbody.innerHTML = renderTableEmptyStateHtml(9, 'Failed to load payment receipts', 'Please check connection and retry.', '⚠️');
    }
};

window.viewCompanyReceipt = function viewCompanyReceipt(receiptId) {
    window.currentViewingReceiptId = receiptId;
    const receipt = allCompanyReceiptsList.find(r => String(r.id) === String(receiptId)) ||
        allPaymentLogsList.find(r => String(r.id) === String(receiptId));
    if (!receipt) {
        showModal('Receipt Not Found', 'Could not locate the requested transaction receipt.');
        return;
    }

    const coId = getCompanyId();
    const comp = Array.isArray(allCompanies) ? allCompanies.find(c => String(c.id) === String(coId)) : null;
    let user = {};
    try { user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}'); } catch (e) { }

    const custName = comp?.name || user.company_name || user.username || 'Authorized Subscriber';
    const custEmail = receipt.user_email || user.email || comp?.email || '-';
    const custPhone = receipt.user_phone ? formatDisplayPhone(receipt.user_phone) : (user.phone || comp?.phone || '-');
    const formattedDate = receipt.created_at_formatted || (receipt.created_at ? new Date(receipt.created_at).toLocaleString('en-IN') : '-');

    const origAmount = Number(receipt.original_amount || receipt.final_amount || 0);
    const discAmount = Number(receipt.discount_amount || 0);
    const finalAmount = Number(receipt.final_amount || 0);

    let cycleDisplay = 'Monthly';
    const rCycle = String(receipt.billing_cycle || (receipt.plan_name || '')).toLowerCase();
    if (rCycle.includes('annual') || rCycle.includes('year') || rCycle.includes('12_month')) cycleDisplay = 'Annual (20% Off)';
    else if (rCycle.includes('4_month') || rCycle.includes('4month')) cycleDisplay = '4 Months (10% Off)';
    else if (rCycle.includes('6_month') || rCycle.includes('6month')) cycleDisplay = '6 Months (15% Off)';

    const elDate = document.getElementById('rcpt-date-display');
    const elName = document.getElementById('rcpt-customer-name');
    const elEmail = document.getElementById('rcpt-customer-email');
    const elPhone = document.getElementById('rcpt-customer-phone');
    const elOrder = document.getElementById('rcpt-order-id');
    const elPay = document.getElementById('rcpt-payment-id');
    const elPlan = document.getElementById('rcpt-plan-name');
    const elCycle = document.getElementById('rcpt-plan-cycle');
    const elValidUntil = document.getElementById('rcpt-valid-until');
    const elBase = document.getElementById('rcpt-base-amount');
    const elSub = document.getElementById('rcpt-subtotal');
    const rowDisc = document.getElementById('rcpt-row-discount');
    const elDisc = document.getElementById('rcpt-discount');
    const elTotal = document.getElementById('rcpt-total');

    if (elDate) elDate.textContent = `Date: ${formattedDate}`;
    if (elName) elName.textContent = custName;
    if (elEmail) elEmail.textContent = custEmail;
    if (elPhone) elPhone.textContent = custPhone;

    if (elOrder) elOrder.textContent = receipt.order_id || '-';
    if (elPay) elPay.textContent = receipt.payment_id || '-';

    if (elPlan) elPlan.textContent = receipt.plan_name || 'Standard Plan';
    if (elCycle) elCycle.textContent = cycleDisplay;

    if (elValidUntil) {
        const validUntilDate = receipt.valid_until_formatted || (receipt.valid_until ? new Date(receipt.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
        elValidUntil.textContent = validUntilDate;
    }

    if (elBase) elBase.textContent = `₹${origAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (elSub) elSub.textContent = `₹${origAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (discAmount > 0) {
        if (rowDisc) rowDisc.style.display = 'flex';
        if (elDisc) elDisc.textContent = `- ₹${discAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}${receipt.coupon_code ? ` (${receipt.coupon_code})` : ''}`;
    } else {
        if (rowDisc) rowDisc.style.display = 'none';
    }

    const feeAmount = Number(receipt.convenience_fee || 0);
    const rowFee = document.getElementById('rcpt-row-fee');
    const elFee = document.getElementById('rcpt-fee');
    if (rowFee && elFee) {
        if (feeAmount > 0) {
            rowFee.style.display = 'flex';
            elFee.textContent = `+ ₹${feeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        } else {
            rowFee.style.display = 'none';
        }
    }

    if (elTotal) elTotal.textContent = `₹${finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const modal = document.getElementById('company-receipt-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeCompanyReceiptModal = function closeCompanyReceiptModal() {
    const modal = document.getElementById('company-receipt-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.printCompanyReceipt = function printCompanyReceipt() {
    window.print();
};

window.resendCurrentReceiptEmail = async function resendCurrentReceiptEmail() {
    if (!window.currentViewingReceiptId) {
        showModal('No Receipt Selected', 'Please open a receipt before requesting an email resend.');
        return;
    }

    const btn = document.getElementById('btn-rcpt-resend-email');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-icon" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Sending Email...';
    }

    try {
        const res = await apiFetch('/api/payments?action=resend-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: window.currentViewingReceiptId })
        });
        const data = await res.json();
        if (data.success) {
            showModal('Email Sent 🎉', data.message || 'Payment receipt email has been sent successfully!');
        } else {
            showModal('Email Send Error', data.error || 'Could not send receipt email.');
        }
    } catch (err) {
        console.error('Error resending receipt email:', err);
        showModal('Error', err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
};

// Ensure active view is synchronized upon full script execution
(function syncBootView() {
    const curView = localStorage.getItem('activeView') || window.location.hash.replace('#', '') || 'dashboard';
    if (curView === 'subscriptions' && typeof loadSubscriptions === 'function') {
        loadSubscriptions();
    }
})();

// Global Escape Key Listener for Flexible Modal Dismissal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        const rcptModal = document.getElementById('company-receipt-modal');
        if (rcptModal && !rcptModal.classList.contains('hidden') && rcptModal.style.display !== 'none') {
            closeCompanyReceiptModal();
            return;
        }
        const checkoutModal = document.getElementById('checkout-modal');
        if (checkoutModal && !checkoutModal.classList.contains('hidden') && checkoutModal.style.display !== 'none') {
            closeCheckoutModal();
            return;
        }
    }
});

