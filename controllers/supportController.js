/**
 * Inspenox Business Suite - Help & Support Controller
 * Amazon & Flipkart-style interactive pre-trained self-help Q&A and Superadmin ticket escalation.
 */

(function () {
    let currentSupportTab = 'faqs'; // 'faqs', 'create-ticket', 'my-tickets', 'admin-tickets'
    let selectedFaqCategory = 'all';
    let companyTickets = [];
    let adminTickets = [];
    let selectedAdminTicket = null;

    // =========================================================================
    // 1. PRE-TRAINED KNOWLEDGE BASE & SOLUTIONS DATA (Amazon/Flipkart Style)
    // =========================================================================
    const supportKnowledgeBase = [
        {
            id: 'wa-1',
            category: 'whatsapp',
            categoryLabel: 'WhatsApp API & Connection',
            icon: '💬',
            question: 'My WhatsApp number shows "Disconnected" or "Unregistered"',
            snippet: 'Steps to re-authorize Cloud API access token and verify Meta Business 2FA.',
            solution: `
                <div class="faq-solution-body">
                    <p><b>Quick Fix (90% of issues):</b> This typically happens when your Meta System User token has expired or your Meta Business Manager requires 2FA confirmation.</p>
                    <ol>
                        <li><b>Check Meta Business Security:</b> Log into <a href="https://business.facebook.com/settings/security" target="_blank" rel="noopener noreferrer">Meta Business Security Center ↗</a> and verify Two-Factor Authentication is enabled for all admins.</li>
                        <li><b>Regenerate System User Token:</b> In Meta Business Settings &rarr; <i>System Users</i> &rarr; Select your system user &rarr; Click <i>Generate New Token</i> &rarr; Select <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>.</li>
                        <li><b>Update in Inspenox:</b> Go to <b>Settings &rarr; Meta Credentials</b>, paste the new token, and click <i>Save Credentials</i>.</li>
                        <li><b>Phone Number Registration:</b> Verify your number status is <b>CONNECTED</b> on <a href="https://business.facebook.com/wa/manage/phone-numbers" target="_blank" rel="noopener noreferrer">Meta WhatsApp Manager ↗</a>.</li>
                    </ol>
                </div>
            `,
            tags: ['token', 'disconnected', 'unregistered', 'meta token', 'expired', 'waba', 'phone']
        },
        {
            id: 'wa-2',
            category: 'whatsapp',
            categoryLabel: 'WhatsApp API & Connection',
            icon: '💬',
            question: 'What is the 24-Hour Customer Care Window and why did freeform text fail?',
            snippet: 'Understanding Meta Cloud API 24-hour service window and error 131047.',
            solution: `
                <div class="faq-solution-body">
                    <p>Meta enforces a strict <b>24-Hour Customer Care Window</b> on WhatsApp Business Cloud API:</p>
                    <ul>
                        <li><b>Within 24 Hours:</b> When a customer sends you a message, a 24-hour window opens. You can send free-form text, media, documents, and interactive buttons with zero template restrictions.</li>
                        <li><b>Outside 24 Hours (Expired):</b> Once 24 hours pass since the customer's last message, free-form text messages are rejected by Meta with <code>Error Code 131047</code>.</li>
                        <li><b>How to Re-open:</b> You must send an <b>Approved Meta Template</b> (Utility, Marketing, or Authentication). Once the customer replies, the 24-hour free-form chat window re-opens immediately.</li>
                    </ul>
                </div>
            `,
            tags: ['24 hour', '24h expired', 'error 131047', 'customer care window', 'freeform message failed']
        },
        {
            id: 'wa-3',
            category: 'whatsapp',
            categoryLabel: 'WhatsApp API & Connection',
            icon: '💬',
            question: 'Messages stuck on "Sent" or failing with error code 131026',
            snippet: 'Fixing recipient number formatting and Meta Account Quality tier issues.',
            solution: `
                <div class="faq-solution-body">
                    <p><b>Resolution Checklist:</b></p>
                    <ol>
                        <li><b>Country Code Formatting:</b> Always include the country code without plus signs or spaces (e.g. <code>919553262002</code> for India, not <code>+91</code> or <code>0955...</code>).</li>
                        <li><b>Active WhatsApp Account:</b> Verify that the destination number is actively registered on WhatsApp.</li>
                        <li><b>Meta Quality Rating & Messaging Limits:</b> Check your <a href="https://business.facebook.com/wa/manage/phone-numbers" target="_blank" rel="noopener noreferrer">WhatsApp Phone Quality Rating ↗</a>. If your rating drops to <i>Red (Low Quality)</i> due to high customer blocks, Meta temporarily caps daily messaging volume.</li>
                    </ol>
                </div>
            `,
            tags: ['sent', 'failed', 'error 131026', 'undelivered', 'phone formatting', 'quality rating']
        },
        {
            id: 'bc-1',
            category: 'broadcast',
            categoryLabel: 'Broadcast Campaigns',
            icon: '📢',
            question: 'My Broadcast Campaign is sending slowly or paused midway',
            snippet: 'Explanation of rate limiting and Meta Tier 1 daily volume caps.',
            solution: `
                <div class="faq-solution-body">
                    <p>Inspenox uses smart rate limiting to ensure your WhatsApp Business number is never blocked or flagged for spam by Meta's automated algorithms:</p>
                    <ul>
                        <li><b>Default Sending Speed:</b> Campaigns send at approximately 40–80 messages per minute with random micro-delays.</li>
                        <li><b>Meta Messaging Tier Limits:</b>
                            <ul>
                                <li><b>Tier 1:</b> 1,000 unique customers every 24 hours.</li>
                                <li><b>Tier 2:</b> 10,000 unique customers every 24 hours.</li>
                                <li><b>Tier 3:</b> 100,000 unique customers every 24 hours.</li>
                            </ul>
                        </li>
                        <li>If your campaign exceeds your current Meta 24-hour tier limit, remaining contacts are safely scheduled for the next 24-hour reset window.</li>
                    </ul>
                </div>
            `,
            tags: ['broadcast', 'campaign', 'slow', 'stopped', 'tier limit', '1000 limit']
        },
        {
            id: 'bc-2',
            category: 'broadcast',
            categoryLabel: 'Broadcast Campaigns',
            icon: '📢',
            question: 'Image or PDF attachments not showing in sent broadcast messages',
            snippet: 'Requirements for broadcast media headers, formats, and CDN links.',
            solution: `
                <div class="faq-solution-body">
                    <p><b>Requirements for Meta Media Attachments:</b></p>
                    <ul>
                        <li><b>Images:</b> JPEG or PNG format, maximum 5MB. Must be hosted on a public HTTPS URL.</li>
                        <li><b>Documents:</b> PDF only, maximum 100MB.</li>
                        <li><b>Best Practice:</b> Upload your images directly to <b>Media Assets Manager</b> inside Inspenox to obtain high-speed, Meta-optimized public CDN links.</li>
                    </ul>
                </div>
            `,
            tags: ['attachment', 'image', 'pdf', 'media', 'broadcast media', 'file']
        },
        {
            id: 'tpl-1',
            category: 'templates',
            categoryLabel: 'Meta Templates',
            icon: '📝',
            question: 'Why did Meta reject my template? (Common rejection reasons)',
            snippet: 'Guidelines on variable placeholders, promotional language in utility, and sensitive terms.',
            solution: `
                <div class="faq-solution-body">
                    <p>Meta uses automated AI classifiers to evaluate message templates against WhatsApp Business Messaging policies. Common causes of rejection:</p>
                    <ol>
                        <li><b>Category Mismatch:</b> Marking promotional offers, discount codes, or upsells as <i>UTILITY</i>. Meta requires all promotional content to be categorized as <b>MARKETING</b>.</li>
                        <li><b>Missing Variable Samples:</b> Every placeholder like <code>{{1}}</code>, <code>{{2}}</code> must have a realistic sample value provided during creation.</li>
                        <li><b>Floating or Adjacent Variables:</b> Having variables back-to-back like <code>{{1}} {{2}}</code> without intervening words.</li>
                        <li><b>Spelling or Grammar Errors:</b> Severe typos or abusive language trigger automatic rejection.</li>
                    </ol>
                    <p>💡 <b>Tip:</b> Browse our <b>Template Library (25+ Pre-approved Standards)</b> for instant, pre-verified formats with 100% approval rates.</p>
                </div>
            `,
            tags: ['template', 'rejected', 'rejection', 'meta approval', 'utility', 'marketing', 'variable']
        },
        {
            id: 'tpl-2',
            category: 'templates',
            categoryLabel: 'Meta Templates',
            icon: '📝',
            question: 'How do I edit or appeal a rejected template?',
            snippet: 'Step-by-step process to edit rejected templates or request Meta human review.',
            solution: `
                <div class="faq-solution-body">
                    <p>You can resubmit or appeal directly from your Meta Developer Account:</p>
                    <ol>
                        <li>Click <b>Meta WhatsApp Manager ↗</b> in the top right of the Templates page.</li>
                        <li>Navigate to <b>Account Tools &rarr; Message Templates</b>.</li>
                        <li>Click on the rejected template to view the specific rejection reason provided by Meta.</li>
                        <li>Click <b>Edit</b> to fix the issue, or click <b>Request Review</b> to have a human Meta reviewer inspect it.</li>
                    </ol>
                </div>
            `,
            tags: ['appeal', 'rejected template', 'edit template', 'resubmit']
        },
        {
            id: 'bill-1',
            category: 'billing',
            categoryLabel: 'Billing & Subscriptions',
            icon: '💳',
            question: 'How does Meta WhatsApp message billing work? (Zero Commission)',
            snippet: 'Understanding direct Meta billing, rate cards, and where to get GST invoices.',
            solution: `
                <div class="faq-solution-body">
                    <p><b>Zero Platform Markup & Direct Meta Billing:</b></p>
                    <ul>
                        <li><b>No Credit Packages or Wallets:</b> Inspenox never sells message credits or marks up WhatsApp rates. You connect your Meta Business Account directly.</li>
                        <li><b>Direct Meta Card / UPI Charge:</b> Meta directly bills the payment method on file in your Meta Business Account based on official published <a href="https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards" target="_blank" rel="noopener noreferrer">Meta WhatsApp Rate Cards ↗</a>.</li>
                        <li><b>GST Invoices:</b> Download official tax invoices with your company GSTIN directly from <a href="https://business.facebook.com/settings/billing" target="_blank" rel="noopener noreferrer">Meta Business Billing & Payments ↗</a>.</li>
                    </ul>
                </div>
            `,
            tags: ['billing', 'invoice', 'gst', 'meta charges', 'conversation cost', 'rate card', 'pricing']
        },
        {
            id: 'bill-2',
            category: 'billing',
            categoryLabel: 'Billing & Subscriptions',
            icon: '💳',
            question: 'My Inspenox platform subscription renewal failed or is past due',
            snippet: 'How to update payment method, retry Razorpay charge, and grace period.',
            solution: `
                <div class="faq-solution-body">
                    <p>If your monthly or annual platform subscription charge failed:</p>
                    <ol>
                        <li>Navigate to <b>Subscriptions & Billing</b> in the left sidebar.</li>
                        <li>Click <b>Renew Plan</b> or <b>Update Payment Method</b>.</li>
                        <li>Complete payment via UPI, Credit/Debit Card, or Netbanking powered by Razorpay.</li>
                        <li>Your workspace includes an automatic <b>3-day grace period</b> so customer conversations and inbound automations remain active while you update your card.</li>
                    </ol>
                </div>
            `,
            tags: ['subscription', 'renewal', 'failed payment', 'razorpay', 'past due', 'grace period']
        },
        {
            id: 'ads-1',
            category: 'ads',
            categoryLabel: 'Meta Ads & Leads',
            icon: '🎯',
            question: 'Click-to-WhatsApp (CTWA) ads are not routing inbound leads into Live Inbox',
            snippet: 'Verifying ad icebreaker messages and webhook referral payload subscription.',
            solution: `
                <div class="faq-solution-body">
                    <p><b>Checklist for CTWA Ad Redirection:</b></p>
                    <ol>
                        <li><b>Pre-filled Icebreaker Message:</b> When customers tap your ad on Facebook or Instagram, WhatsApp opens with your configured icebreaker message. The customer <b>must tap send</b> for Meta to deliver the inbound message.</li>
                        <li><b>Pre-Verified Number Selection:</b> Ensure your ad creative was configured with your pre-verified Cloud API WABA number (not a personal SIM number).</li>
                        <li><b>Webhook Subscription:</b> In Meta Developer Portal, verify your App Webhook is subscribed to both <code>messages</code> and <code>referral</code> fields.</li>
                    </ol>
                </div>
            `,
            tags: ['ads', 'ctwa', 'leads', 'inbox leads', 'ad redirection', 'facebook ads']
        },
        {
            id: 'auto-1',
            category: 'automation',
            categoryLabel: 'Automations & Live Inbox',
            icon: '🤖',
            question: 'Chatbot keyword rules are not responding to incoming messages',
            snippet: 'Checking keyword trigger matching, human agent takeover, and rule status.',
            solution: `
                <div class="faq-solution-body">
                    <p><b>Automations Troubleshooting:</b></p>
                    <ol>
                        <li><b>Rule Active Status:</b> Go to <b>Automations</b> and verify the rule toggle is green (Active).</li>
                        <li><b>Keyword Match Type:</b> Inspenox matches keywords case-insensitively. Check if you selected <i>Exact Match</i> vs <i>Contains Keyword</i>.</li>
                        <li><b>Human Agent Takeover:</b> If a live agent previously replied to this customer, the chat may have Human Takeover active. Check the contact in Live Inbox.</li>
                        <li><b>24-Hour Expiry:</b> If the customer sent a message more than 24 hours ago, freeform automation text cannot be delivered unless using an approved template.</li>
                    </ol>
                </div>
            `,
            tags: ['automation', 'chatbot', 'keyword', 'auto reply', 'human takeover']
        },
        {
            id: 'acc-1',
            category: 'account',
            categoryLabel: 'Account & Team Access',
            icon: '👥',
            question: 'How do I add team members and assign agent permissions?',
            snippet: 'Creating sub-users, setting roles (Admin vs Agent), and assigning customer leads.',
            solution: `
                <div class="faq-solution-body">
                    <p><b>Adding Team Members:</b></p>
                    <ol>
                        <li>Go to <b>Settings &rarr; Company & User Management</b>.</li>
                        <li>Click <b>+ Add New User</b>.</li>
                        <li>Enter the team member's name, email, phone number, and assign their password.</li>
                        <li>Select Role: <b>Agent</b> (restricted to Live Inbox and assigned leads) or <b>Admin</b> (full workspace access).</li>
                        <li>Team members can now log in at <code>marketing.inspenox.in/login.html</code> using their email and password.</li>
                    </ol>
                </div>
            `,
            tags: ['team', 'add user', 'agent', 'role', 'permissions', 'subuser']
        }
    ];

    // =========================================================================
    // 2. CONTROLLER INITIALIZATION & TAB SWITCHING
    // =========================================================================
    async function loadSupportPortal() {
        // Pre-fill user contact info in the ticket form
        prefillContactInfo();

        // Render FAQ categories and articles
        renderFaqCategories();
        renderFaqList();

        // Check if user is Superadmin
        const isSuper = typeof window.isSuperAdmin === 'function' ? window.isSuperAdmin() : false;
        const superTabBtn = document.getElementById('support-tab-btn-admin');
        const superTabSection = document.getElementById('support-tab-content-admin');

        if (superTabBtn) {
            superTabBtn.style.display = isSuper ? 'inline-flex' : 'none';
        }

        // Load company's existing tickets
        await loadMyCompanyTickets();

        // If Superadmin, also load all tickets
        if (isSuper) {
            await loadAdminTickets();
        }

        // Switch to default tab
        switchSupportTab(currentSupportTab || 'faqs');
    }
    window.loadSupportPortal = loadSupportPortal;

    function switchSupportTab(tabName) {
        currentSupportTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.support-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
        });

        // Update tab sections
        const tabs = ['faqs', 'create-ticket', 'my-tickets', 'admin-tickets'];
        tabs.forEach(t => {
            const el = document.getElementById(`support-tab-content-${t}`);
            if (el) el.style.display = (t === tabName) ? 'block' : 'none';
        });

        if (tabName === 'my-tickets') {
            loadMyCompanyTickets();
        } else if (tabName === 'admin-tickets') {
            loadAdminTickets();
        }
    }
    window.switchSupportTab = switchSupportTab;

    function prefillContactInfo() {
        let user = {};
        try {
            user = JSON.parse(localStorage.getItem('inspenox_user') || localStorage.getItem('induio_user') || '{}');
        } catch(e) {}

        const nameInput = document.getElementById('support-ticket-name');
        if (nameInput && !nameInput.value) {
            nameInput.value = user.name || user.username || '';
        }

        const emailInput = document.getElementById('support-ticket-email');
        if (emailInput && !emailInput.value) {
            emailInput.value = user.email || '';
        }

        const phoneInput = document.getElementById('support-ticket-phone');
        if (phoneInput && !phoneInput.value) {
            phoneInput.value = user.phone || '';
        }

        const compBadge = document.getElementById('support-ticket-company-name');
        if (compBadge) {
            compBadge.textContent = user.company_name || 'Active Company Workspace';
        }
    }

    // =========================================================================
    // 3. FAQS & PRE-TRAINED KNOWLEDGE BASE RENDERING
    // =========================================================================
    function renderFaqCategories() {
        const container = document.getElementById('support-faq-categories-list');
        if (!container) return;

        const categories = [
            { id: 'all', label: 'All Topics', icon: '🔍' },
            { id: 'whatsapp', label: 'WhatsApp API', icon: '💬' },
            { id: 'broadcast', label: 'Broadcasts', icon: '📢' },
            { id: 'templates', label: 'Templates', icon: '📝' },
            { id: 'billing', label: 'Billing & Rates', icon: '💳' },
            { id: 'ads', label: 'Meta Ads', icon: '🎯' },
            { id: 'automation', label: 'Automations', icon: '🤖' },
            { id: 'account', label: 'Account & Team', icon: '👥' }
        ];

        container.innerHTML = categories.map(cat => `
            <button type="button" class="faq-category-pill ${selectedFaqCategory === cat.id ? 'active' : ''}" 
                onclick="filterFaqCategory('${cat.id}')">
                <span>${cat.icon}</span>
                <span>${cat.label}</span>
            </button>
        `).join('');
    }

    function filterFaqCategory(catId) {
        selectedFaqCategory = catId;
        renderFaqCategories();
        renderFaqList();
    }
    window.filterFaqCategory = filterFaqCategory;

    function filterFaqSearch() {
        renderFaqList();
    }
    window.filterFaqSearch = filterFaqSearch;

    function renderFaqList() {
        const container = document.getElementById('support-faq-items-accordion');
        if (!container) return;

        const query = (document.getElementById('support-faq-search-input')?.value || '').toLowerCase().trim();

        const filtered = supportKnowledgeBase.filter(item => {
            const matchesCat = (selectedFaqCategory === 'all') || (item.category === selectedFaqCategory);
            const matchesQuery = !query || 
                item.question.toLowerCase().includes(query) || 
                item.snippet.toLowerCase().includes(query) ||
                item.tags.some(t => t.toLowerCase().includes(query));
            return matchesCat && matchesQuery;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="padding: 2.5rem; text-align: center; background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border);">
                    <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--text-main); font-size: 1.1rem;">No matching self-help solutions found</h4>
                    <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 1.5rem auto;">
                        We couldn't find a pre-trained solution for "${escapeHTML(query)}". Our engineering and support team is ready to assist you directly!
                    </p>
                    <button type="button" class="btn primary" onclick="escalateToTicket('', '${escapeHTML(query)}')" style="font-weight: 700; gap: 6px;">
                        <span>🎫 Raise a Support Ticket Now &rarr;</span>
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => `
            <div class="faq-accordion-card" id="faq-card-${item.id}">
                <div class="faq-accordion-header" onclick="toggleFaqAccordion('${item.id}')">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <span style="font-size: 1.25rem;">${item.icon}</span>
                        <div>
                            <div class="faq-accordion-title">${escapeHTML(item.question)}</div>
                            <div class="faq-accordion-snippet">${escapeHTML(item.snippet)}</div>
                        </div>
                    </div>
                    <span class="faq-accordion-arrow" id="faq-arrow-${item.id}">▾</span>
                </div>
                <div class="faq-accordion-content" id="faq-content-${item.id}" style="display: none;">
                    ${item.solution}
                    
                    <!-- Amazon/Flipkart Style Helpful Resolution Check -->
                    <div class="faq-resolution-box" id="faq-resolution-box-${item.id}">
                        <div class="faq-resolution-prompt">
                            <span>Did this solution resolve your problem?</span>
                        </div>
                        <div class="faq-resolution-actions">
                            <button type="button" class="btn-res-yes" onclick="markFaqResolved('${item.id}')">
                                <span>👍 Yes, Solved!</span>
                            </button>
                            <button type="button" class="btn-res-no" onclick="escalateToTicket('${item.category}', '${escapeHTML(item.question)}')">
                                <span>👎 No, I need more help</span>
                            </button>
                        </div>
                    </div>
                    <div id="faq-solved-badge-${item.id}" class="faq-solved-badge" style="display: none;">
                        ✅ <b>Great!</b> We're happy this solved your issue. Have a productive day!
                    </div>
                </div>
            </div>
        `).join('');
    }

    function toggleFaqAccordion(id) {
        const content = document.getElementById(`faq-content-${id}`);
        const arrow = document.getElementById(`faq-arrow-${id}`);
        if (!content) return;

        const isExpanded = content.style.display === 'block';
        content.style.display = isExpanded ? 'none' : 'block';
        if (arrow) arrow.textContent = isExpanded ? '▾' : '▴';
    }
    window.toggleFaqAccordion = toggleFaqAccordion;

    function markFaqResolved(id) {
        const resBox = document.getElementById(`faq-resolution-box-${id}`);
        const solvedBadge = document.getElementById(`faq-solved-badge-${id}`);
        if (resBox) resBox.style.display = 'none';
        if (solvedBadge) solvedBadge.style.display = 'block';
        if (typeof showToast === 'function') {
            showToast('Glad we could help! Issue marked solved.', 'success');
        }
    }
    window.markFaqResolved = markFaqResolved;

    // Escalates from Q&A straight to the ticket form with pre-filled context
    function escalateToTicket(category, subjectHint) {
        switchSupportTab('create-ticket');

        if (category) {
            const catSelect = document.getElementById('support-ticket-category');
            if (catSelect) {
                const map = {
                    'whatsapp': 'WhatsApp Cloud API',
                    'broadcast': 'Broadcast Campaigns',
                    'templates': 'Meta Templates',
                    'billing': 'Billing & Subscriptions',
                    'ads': 'Meta Ads & Leads',
                    'automation': 'Chatbot Automations',
                    'account': 'Account & Team Access'
                };
                catSelect.value = map[category] || 'General Inquiry';
            }
        }

        if (subjectHint) {
            const subInput = document.getElementById('support-ticket-subject');
            if (subInput && !subInput.value) {
                subInput.value = `Need assistance regarding: ${subjectHint}`;
            }
        }

        document.getElementById('support-ticket-desc')?.focus();
    }
    window.escalateToTicket = escalateToTicket;

    // =========================================================================
    // 4. SUBMIT SUPPORT TICKET (COMPANIES)
    // =========================================================================
    async function submitSupportTicket(event) {
        if (event) event.preventDefault();

        const name = (document.getElementById('support-ticket-name')?.value || '').trim();
        const email = (document.getElementById('support-ticket-email')?.value || '').trim();
        const phone = (document.getElementById('support-ticket-phone')?.value || '').trim();
        const category = document.getElementById('support-ticket-category')?.value || 'General Inquiry';
        const priority = document.getElementById('support-ticket-priority')?.value || 'medium';
        const subject = (document.getElementById('support-ticket-subject')?.value || '').trim();
        const description = (document.getElementById('support-ticket-desc')?.value || '').trim();
        const attachment = (document.getElementById('support-ticket-attachment')?.value || '').trim();

        if (!name) {
            showToast('Please enter your contact name.', 'warning');
            document.getElementById('support-ticket-name')?.focus();
            return;
        }
        if (!email || !email.includes('@')) {
            showToast('Please enter a valid contact email.', 'warning');
            document.getElementById('support-ticket-email')?.focus();
            return;
        }
        if (!subject) {
            showToast('Please enter a ticket subject.', 'warning');
            document.getElementById('support-ticket-subject')?.focus();
            return;
        }
        if (!description) {
            showToast('Please describe the problem you are experiencing.', 'warning');
            document.getElementById('support-ticket-desc')?.focus();
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-support-ticket');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<div class="spinner sm" style="margin-right:6px;"></div> Submitting Ticket...`;
        }

        try {
            const coId = typeof window.getActiveCompanyId === 'function' ? window.getActiveCompanyId() : '1';
            const payload = {
                company_id: coId,
                user_name: name,
                user_email: email,
                user_phone: phone,
                category: category,
                priority: priority,
                subject: subject,
                description: description,
                attachment_url: attachment
            };

            const res = await apiFetch('/api/support?action=create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success && data.ticket) {
                showToast(`🎉 Ticket #${data.ticket.ticket_number} created successfully! Superadmin notified.`, 'success');

                // Clear form
                if (document.getElementById('support-ticket-subject')) document.getElementById('support-ticket-subject').value = '';
                if (document.getElementById('support-ticket-desc')) document.getElementById('support-ticket-desc').value = '';
                if (document.getElementById('support-ticket-attachment')) document.getElementById('support-ticket-attachment').value = '';

                // Switch to My Tickets
                await loadMyCompanyTickets();
                switchSupportTab('my-tickets');
            } else {
                showToast(data.error || 'Failed to submit ticket', 'error');
            }
        } catch(err) {
            console.error('Error submitting support ticket:', err);
            showToast('Error submitting ticket: ' + err.message, 'error');
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<span>Submit Support Ticket 🚀</span>`;
            }
        }
    }
    window.submitSupportTicket = submitSupportTicket;

    // =========================================================================
    // 5. LOAD & RENDER MY COMPANY'S TICKETS
    // =========================================================================
    async function loadMyCompanyTickets() {
        const container = document.getElementById('my-support-tickets-list');
        const badgeEl = document.getElementById('support-my-tickets-badge');
        if (!container) return;

        const coId = typeof window.getActiveCompanyId === 'function' ? window.getActiveCompanyId() : '1';
        try {
            const res = await apiFetch(`/api/support?action=list&company_id=${coId}&my_company_only=true`);
            const data = await res.json();
            if (data.success && Array.isArray(data.tickets)) {
                companyTickets = data.tickets;
                if (badgeEl) {
                    const openCount = companyTickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
                    badgeEl.textContent = openCount;
                    badgeEl.style.display = openCount > 0 ? 'inline-flex' : 'none';
                }
                renderMyCompanyTickets(companyTickets);
            }
        } catch(err) {
            console.warn('Error loading company tickets:', err.message);
        }
    }
    window.loadMyCompanyTickets = loadMyCompanyTickets;

    function renderMyCompanyTickets(tickets) {
        const container = document.getElementById('my-support-tickets-list');
        if (!container) return;

        if (tickets.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="padding: 2.5rem; text-align: center; background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border);">
                    <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🎫</div>
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--text-main); font-size: 1.1rem;">No support tickets raised yet</h4>
                    <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 440px; margin: 0 auto 1.5rem auto;">
                        Have questions or encountering an issue? Check our self-help Q&A or raise a direct support ticket.
                    </p>
                    <button type="button" class="btn primary" onclick="switchSupportTab('create-ticket')" style="font-weight: 700; gap: 6px;">
                        <span>+ Raise a New Ticket</span>
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = tickets.map(t => {
            const statusBadge = getStatusBadgeHtml(t.status);
            const priorityPill = getPriorityBadgeHtml(t.priority);
            const dateStr = formatTicketDate(t.created_at);

            return `
                <div class="support-ticket-card">
                    <div class="support-ticket-card-header">
                        <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                            <span class="ticket-num-pill">${escapeHTML(t.ticket_number)}</span>
                            <span class="ticket-cat-pill">${escapeHTML(t.category)}</span>
                            ${priorityPill}
                        </div>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            ${statusBadge}
                        </div>
                    </div>
                    <div class="support-ticket-card-body">
                        <h4 class="ticket-subject-title">${escapeHTML(t.subject)}</h4>
                        <p class="ticket-desc-text">${escapeHTML(t.description)}</p>
                        ${t.attachment_url ? `
                            <div style="margin-top:0.5rem; font-size:0.75rem;">
                                📎 <b>Attachment:</b> <a href="${escapeHTML(t.attachment_url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:600;">View File ↗</a>
                            </div>
                        ` : ''}
                    </div>

                    ${t.resolution_notes ? `
                        <div class="ticket-resolution-callout">
                            <div style="font-weight:700; font-size:0.75rem; color:#10b981; margin-bottom:3px; display:flex; align-items:center; gap:4px;">
                                <span>🛠️ Resolution from Superadmin Support Team</span>
                                ${t.resolved_at ? `<span style="font-size:0.68rem; color:var(--text-muted); font-weight:normal;">(${formatTicketDate(t.resolved_at)})</span>` : ''}
                            </div>
                            <div style="font-size:0.8rem; color:var(--text-main); line-height:1.45;">
                                ${escapeHTML(t.resolution_notes)}
                            </div>
                        </div>
                    ` : ''}

                    <div class="support-ticket-card-footer">
                        <span>Created on ${dateStr}</span>
                        <span>Contact: ${escapeHTML(t.user_name)} (${escapeHTML(t.user_email)})</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // =========================================================================
    // 6. SUPERADMIN ONLY SUPPORT DESK (ALL COMPANY TICKETS)
    // =========================================================================
    async function loadAdminTickets() {
        const isSuper = typeof window.isSuperAdmin === 'function' ? window.isSuperAdmin() : false;
        if (!isSuper) return;

        const tableBody = document.getElementById('admin-support-tickets-tbody');
        if (!tableBody) return;

        const statusFilter = document.getElementById('admin-ticket-status-filter')?.value || 'ALL';
        const companyFilter = document.getElementById('admin-ticket-company-filter')?.value || '';

        let url = `/api/support?action=list&status=${encodeURIComponent(statusFilter)}`;
        if (companyFilter) url += `&filter_company_id=${encodeURIComponent(companyFilter)}`;

        try {
            const res = await apiFetch(url);
            const data = await res.json();
            if (data.success && Array.isArray(data.tickets)) {
                adminTickets = data.tickets;
                updateAdminMetrics(data.metrics || {});
                renderAdminTicketsTable(adminTickets);
                populateAdminCompanyFilter(adminTickets);
            }
        } catch(err) {
            console.error('Error loading admin tickets:', err);
        }
    }
    window.loadAdminTickets = loadAdminTickets;

    function updateAdminMetrics(metrics) {
        const elTotal = document.getElementById('support-admin-metric-total');
        const elOpen = document.getElementById('support-admin-metric-open');
        const elProgress = document.getElementById('support-admin-metric-progress');
        const elResolved = document.getElementById('support-admin-metric-resolved');

        if (elTotal) elTotal.textContent = metrics.total || 0;
        if (elOpen) elOpen.textContent = metrics.open || 0;
        if (elProgress) elProgress.textContent = metrics.in_progress || 0;
        if (elResolved) elResolved.textContent = (metrics.resolved || 0) + (metrics.closed || 0);
    }

    function populateAdminCompanyFilter(tickets) {
        const select = document.getElementById('admin-ticket-company-filter');
        if (!select || select.dataset.populated === 'true') return;

        const companiesMap = new Map();
        tickets.forEach(t => {
            if (t.company_id && !companiesMap.has(t.company_id)) {
                companiesMap.set(t.company_id, t.current_company_name || t.company_name || `Company #${t.company_id}`);
            }
        });

        // Also add companies from allCompanies global if present
        if (typeof window.allCompanies !== 'undefined' && Array.isArray(window.allCompanies)) {
            window.allCompanies.forEach(c => {
                if (c && c.id && !companiesMap.has(c.id)) {
                    companiesMap.set(c.id, c.name);
                }
            });
        }

        let opts = `<option value="">All Companies</option>`;
        companiesMap.forEach((name, id) => {
            opts += `<option value="${id}">${escapeHTML(name)} (ID: ${id})</option>`;
        });
        select.innerHTML = opts;
        select.dataset.populated = 'true';
    }

    function renderAdminTicketsTable(tickets) {
        const tableBody = document.getElementById('admin-support-tickets-tbody');
        if (!tableBody) return;

        const query = (document.getElementById('admin-ticket-search-input')?.value || '').toLowerCase().trim();

        const filtered = tickets.filter(t => {
            if (!query) return true;
            return (t.ticket_number || '').toLowerCase().includes(query) ||
                   (t.company_name || '').toLowerCase().includes(query) ||
                   (t.user_name || '').toLowerCase().includes(query) ||
                   (t.user_email || '').toLowerCase().includes(query) ||
                   (t.subject || '').toLowerCase().includes(query);
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:2.5rem; color:var(--text-muted);">
                        No support tickets matching current filters.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map(t => {
            const statusBadge = getStatusBadgeHtml(t.status);
            const priorityPill = getPriorityBadgeHtml(t.priority);
            const cleanPhone = (t.user_phone || '').replace(/\D/g, '');
            const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi ${t.user_name}, contacting you regarding Inspenox Ticket #${t.ticket_number}: ${t.subject}`)}` : null;

            return `
                <tr>
                    <td style="font-weight:700;">
                        <span class="ticket-num-pill">${escapeHTML(t.ticket_number)}</span>
                        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:3px;">${formatTicketDate(t.created_at)}</div>
                    </td>
                    <td>
                        <div style="font-weight:700; color:var(--text-main);">${escapeHTML(t.current_company_name || t.company_name || 'Company #' + t.company_id)}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">ID: ${t.company_id}</div>
                    </td>
                    <td>
                        <div style="font-weight:600; font-size:0.82rem;">${escapeHTML(t.user_name)}</div>
                        <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHTML(t.user_email)}</div>
                        ${t.user_phone ? `
                            <div style="font-size:0.72rem; margin-top:2px; display:flex; align-items:center; gap:4px;">
                                <span>📞 ${escapeHTML(t.user_phone)}</span>
                                ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" title="Chat on WhatsApp" style="color:#10b981; font-weight:700; text-decoration:none;">💬 WA</a>` : ''}
                            </div>
                        ` : ''}
                    </td>
                    <td>
                        <div style="font-size:0.78rem; font-weight:600;">${escapeHTML(t.category)}</div>
                        <div style="margin-top:2px;">${priorityPill}</div>
                    </td>
                    <td>
                        <div style="font-weight:700; font-size:0.82rem; color:var(--text-main); max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHTML(t.subject)}
                        </div>
                        <div style="font-size:0.72rem; color:var(--text-muted); max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHTML(t.description)}
                        </div>
                    </td>
                    <td>${statusBadge}</td>
                    <td style="text-align:right;">
                        <button type="button" class="btn secondary sm" onclick="openAdminManageTicketModal(${t.id})" 
                            style="font-size:0.75rem; font-weight:700; gap:4px; padding:4px 10px;">
                            <span>Manage / Resolve ⚙️</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Opens Superadmin Management Modal for a selected ticket
    function openAdminManageTicketModal(ticketId) {
        selectedAdminTicket = adminTickets.find(t => t.id === ticketId);
        if (!selectedAdminTicket) return;

        const modal = document.getElementById('admin-manage-ticket-modal');
        if (!modal) return;

        const t = selectedAdminTicket;
        const cleanPhone = (t.user_phone || '').replace(/\D/g, '');
        const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi ${t.user_name}, contacting you regarding Inspenox Ticket #${t.ticket_number}: ${t.subject}`)}` : '#';

        document.getElementById('m-adm-ticket-num').textContent = `#${t.ticket_number}`;
        document.getElementById('m-adm-ticket-company').textContent = t.current_company_name || t.company_name || `Company #${t.company_id}`;
        document.getElementById('m-adm-ticket-user').textContent = `${t.user_name} (${t.user_email} | ${t.user_phone || 'No phone'})`;
        document.getElementById('m-adm-ticket-cat').textContent = `${t.category} • Priority: ${t.priority.toUpperCase()}`;
        document.getElementById('m-adm-ticket-subject').textContent = t.subject;
        document.getElementById('m-adm-ticket-desc').textContent = t.description;

        const waBtn = document.getElementById('m-adm-ticket-wa-btn');
        if (waBtn) {
            waBtn.href = waLink;
            waBtn.style.display = cleanPhone ? 'inline-flex' : 'none';
        }

        const attachBlock = document.getElementById('m-adm-ticket-attach-block');
        const attachLink = document.getElementById('m-adm-ticket-attach-link');
        if (attachBlock && attachLink) {
            if (t.attachment_url) {
                attachBlock.style.display = 'block';
                attachLink.href = t.attachment_url;
            } else {
                attachBlock.style.display = 'none';
            }
        }

        const statusSelect = document.getElementById('m-adm-ticket-status');
        if (statusSelect) statusSelect.value = t.status || 'OPEN';

        const notesText = document.getElementById('m-adm-ticket-notes');
        if (notesText) notesText.value = t.resolution_notes || '';

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    window.openAdminManageTicketModal = openAdminManageTicketModal;

    function closeAdminManageTicketModal() {
        const modal = document.getElementById('admin-manage-ticket-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        document.body.style.overflow = '';
    }
    window.closeAdminManageTicketModal = closeAdminManageTicketModal;

    async function saveAdminTicketResolution() {
        if (!selectedAdminTicket) return;

        const newStatus = document.getElementById('m-adm-ticket-status')?.value || 'OPEN';
        const resolutionNotes = (document.getElementById('m-adm-ticket-notes')?.value || '').trim();

        const btnSave = document.getElementById('btn-save-admin-ticket');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = `<div class="spinner sm" style="margin-right:6px;"></div> Saving...`;
        }

        try {
            const res = await apiFetch('/api/support?action=update_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedAdminTicket.id,
                    status: newStatus,
                    resolution_notes: resolutionNotes,
                    role: 'superadmin'
                })
            });

            const data = await res.json();
            if (data.success) {
                showToast(`Ticket #${selectedAdminTicket.ticket_number} updated to ${newStatus}.`, 'success');
                closeAdminManageTicketModal();
                await loadAdminTickets();
            } else {
                showToast(data.error || 'Failed to update ticket', 'error');
            }
        } catch(err) {
            console.error('Error updating ticket status:', err);
            showToast('Error updating ticket: ' + err.message, 'error');
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = `<span>Save & Update Ticket</span>`;
            }
        }
    }
    window.saveAdminTicketResolution = saveAdminTicketResolution;

    // =========================================================================
    // 7. HELPER BADGE & FORMATTING UTILITIES
    // =========================================================================
    function getStatusBadgeHtml(status) {
        const s = (status || 'OPEN').toUpperCase();
        if (s === 'OPEN') {
            return `<span class="ticket-status-badge badge-open">🔵 Open</span>`;
        } else if (s === 'IN_PROGRESS') {
            return `<span class="ticket-status-badge badge-progress">🟡 In Progress</span>`;
        } else if (s === 'RESOLVED') {
            return `<span class="ticket-status-badge badge-resolved">🟢 Resolved</span>`;
        } else if (s === 'CLOSED') {
            return `<span class="ticket-status-badge badge-closed">⚪ Closed</span>`;
        }
        return `<span class="ticket-status-badge">${escapeHTML(s)}</span>`;
    }

    function getPriorityBadgeHtml(priority) {
        const p = (priority || 'medium').toLowerCase();
        if (p === 'urgent') {
            return `<span class="ticket-priority-badge priority-urgent">🔴 Urgent</span>`;
        } else if (p === 'high') {
            return `<span class="ticket-priority-badge priority-high">🟠 High</span>`;
        } else if (p === 'low') {
            return `<span class="ticket-priority-badge priority-low">⚪ Low</span>`;
        }
        return `<span class="ticket-priority-badge priority-medium">🟡 Normal</span>`;
    }

    function formatTicketDate(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch(e) {
            return String(isoStr);
        }
    }

    function escapeHTML(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

})();
