/**
 * ==========================================================================
 * TEMPLATELIBRARY.JS - Official Meta WhatsApp Template Library & Starter Catalog
 * ==========================================================================
 * Provides a comprehensive, battle-tested library of pre-approved Meta WhatsApp 
 * message templates across Utility, Marketing, and Authentication categories in
 * English, Telugu, and Hindi. Users can browse, preview with realistic examples,
 * and 1-click customize or submit directly to Meta without creating from scratch.
 * ==========================================================================
 */

const META_TEMPLATE_LIBRARY = [
    // --- TELUGU UTILITY TEMPLATES (From Meta Library) ---
    {
        id: 'te_address_update',
        name: 'address_update',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Delivery update',
        industry: 'E-commerce & Logistics',
        language: 'te',
        languageName: 'Telugu',
        title: 'చిరునామా నవీకరణ',
        breadcrumbs: 'Utility > Order management > Delivery update',
        header: { format: 'TEXT', text: 'చిరునామా నవీకరణ' },
        body: {
            text: 'హాయ్ {{text}}, మీ డెలివరీ చిరునామా 123 మెయిన్ స్ట్రీట్‌కు విజయవంతంగా నవీకరించబడింది. ఏదైనా విచారణల కొరకు సంప్రదించండి support@telco.com .',
            exampleText: 'హాయ్ రాజీవ్, మీ డెలివరీ చిరునామా 123 మెయిన్ స్ట్రీట్‌కు విజయవంతంగా నవీకరించబడింది. ఏదైనా విచారణల కొరకు సంప్రదించండి support@telco.com .'
        },
        footer: { text: 'Inspenox Delivery Alert' },
        buttons: []
    },
    {
        id: 'te_account_creation_confirmation',
        name: 'account_creation_confirmation',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Account updates',
        industry: 'General Business & Apps',
        language: 'te',
        languageName: 'Telugu',
        title: 'అకౌంట్ సెటప్‌ను ఫైనలైజ్ చేయండి',
        breadcrumbs: 'Utility > Account management > Account updates',
        header: { format: 'TEXT', text: 'అకౌంట్ సెటప్‌ను ఫైనలైజ్ చేయండి' },
        body: {
            text: 'హాయ్ {{text}}, మీ కొత్త అకౌంట్ విజయవంతంగా సృష్టించబడింది. మీ ప్రొఫైల్‌ను పూర్తి చేయడం కోసం దయచేసి {{text}}ను ధృవీకరించండి.',
            exampleText: 'హాయ్ సాయి, మీ కొత్త అకౌంట్ విజయవంతంగా సృష్టించబడింది. మీ ప్రొఫైల్‌ను పూర్తి చేయడం కోసం దయచేసి మొబైల్ నంబర్‌ను ధృవీకరించండి.'
        },
        footer: { text: '' },
        buttons: [
            { type: 'URL', text: 'అకౌంట్‌ను ధృవీకరించండి', url: 'https://example.com/verify' }
        ]
    },
    {
        id: 'te_order_delivery_tracking',
        name: 'order_delivery_tracking',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Order status',
        industry: 'E-Commerce & Retail',
        language: 'te',
        languageName: 'Telugu',
        title: 'ఆర్డర్ షిప్పింగ్ సమాచారం',
        breadcrumbs: 'Utility > Order tracking > Delivery status',
        header: { format: 'TEXT', text: 'ఆర్డర్ షిప్పింగ్ అప్‌డేట్' },
        body: {
            text: 'హాయ్ {{customer_name}}, మీ ఆర్డర్ #{{order_id}} విజయవంతంగా పంపబడింది! అంచనా డెలివరీ తేదీ: {{delivery_date}}. క్రింది బటన్ నొక్కి ప్రత్యక్షంగా ట్రాక్ చేయండి.',
            exampleText: 'హాయ్ విక్రమ్, మీ ఆర్డర్ #INSP-89201 విజయవంతంగా పంపబడింది! అంచనా డెలివరీ తేదీ: 22 నవంబర్. క్రింది బటన్ నొక్కి ప్రత్యక్షంగా ట్రాక్ చేయండి.'
        },
        footer: { text: 'షాపింగ్ చేసినందుకు ధన్యవాదాలు' },
        buttons: [
            { type: 'URL', text: 'ఆర్డర్ ట్రాక్ చేయండి', url: 'https://example.com/track/{{1}}' }
        ]
    },
    {
        id: 'te_catalog_showcase',
        name: 'telugu_catalog_showcase',
        category: 'MARKETING',
        subtype: 'catalogue',
        feature: 'Catalog & Products',
        industry: 'Machinery & Equipment',
        language: 'te',
        languageName: 'Telugu',
        title: 'ఉత్పత్తుల కేటలాగ్',
        breadcrumbs: 'Marketing > Product discovery > Catalog message',
        header: { format: 'CATALOG_HEADER', text: 'మా కొత్త ఉత్పత్తుల కేటలాగ్' },
        body: {
            text: 'నమస్కారం {{customer_name}}! మా సరికొత్త రోటవేటర్లు, ట్రాక్టర్లు మరియు వ్యవసాయ యంత్రాల కేటలాగ్‌ను పరిశీలించండి. ఉత్తమ ధరలు మరియు తక్షణ డెలివరీ అందుబాటులో ఉన్నాయి.',
            exampleText: 'నమస్కారం రాజేష్ గారు! మా సరికొత్త రోటవేటర్లు, ట్రాక్టర్లు మరియు వ్యవసాయ యంత్రాల కేటలాగ్‌ను పరిశీలించండి. ఉత్తమ ధరలు మరియు తక్షణ డెలివరీ అందుబాటులో ఉన్నాయి.'
        },
        footer: { text: 'Inspenox Machinery' },
        buttons: [
            { type: 'CATALOG', text: 'కేటలాగ్ చూడండి' }
        ]
    },

    // --- ENGLISH UTILITY TEMPLATES ---
    {
        id: 'en_address_update',
        name: 'address_update_en',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Delivery update',
        industry: 'E-commerce & Logistics',
        language: 'en',
        languageName: 'English',
        title: 'Address Update Confirmation',
        breadcrumbs: 'Utility > Order management > Delivery update',
        header: { format: 'TEXT', text: 'Delivery Address Updated' },
        body: {
            text: 'Hi {{customer_name}}, your shipping address for shipment #{{order_id}} has been updated to: {{new_address}}. For questions, email support@inspenox.com.',
            exampleText: 'Hi Alex, your shipping address for shipment #ORD-98412 has been updated to: 42 Palm Street, Suite 3B. For questions, email support@inspenox.com.'
        },
        footer: { text: 'Inspenox Logistics Dispatch' },
        buttons: [
            { type: 'PHONE_NUMBER', text: 'Call Support', phone_number: '+919553262002' }
        ]
    },
    {
        id: 'en_order_status_tracking',
        name: 'order_status_tracking',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Order status',
        industry: 'E-Commerce & Retail',
        language: 'en',
        languageName: 'English',
        title: 'Order Dispatched & Tracking',
        breadcrumbs: 'Utility > Order tracking > Delivery status',
        header: { format: 'TEXT', text: 'Your Order is on the Way! 🚚' },
        body: {
            text: 'Hello {{customer_name}}, great news! Your order #{{order_id}} has shipped via {{carrier_name}}. Expected delivery date is {{delivery_date}}.',
            exampleText: 'Hello Sarah, great news! Your order #94821 has shipped via BlueDart Express. Expected delivery date is Friday, Nov 21.'
        },
        footer: { text: 'Thank you for your purchase!' },
        buttons: [
            { type: 'URL', text: 'Track Shipment ↗', url: 'https://example.com/track/{{1}}' }
        ]
    },
    {
        id: 'en_payment_reminder',
        name: 'payment_reminder_notice',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Payment reminders',
        industry: 'Finance & B2B Services',
        language: 'en',
        languageName: 'English',
        title: 'Payment Reminder & Invoice',
        breadcrumbs: 'Utility > Billing > Payment reminder',
        header: { format: 'TEXT', text: 'Payment Due Reminder' },
        body: {
            text: 'Dear {{customer_name}}, this is a friendly reminder that invoice #{{invoice_id}} for ₹{{amount}} is due on {{due_date}}. Tap below to view invoice and pay securely.',
            exampleText: 'Dear Rajesh, this is a friendly reminder that invoice #INV-2026-88 for ₹14,500.00 is due on 25 Nov 2026. Tap below to view invoice and pay securely.'
        },
        footer: { text: 'Inspenox Finance Accounts' },
        buttons: [
            { type: 'URL', text: 'Pay Invoice Securely ↗', url: 'https://example.com/pay/{{1}}' }
        ]
    },
    {
        id: 'en_appointment_confirmation',
        name: 'appointment_confirmation',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Account updates',
        industry: 'Healthcare & Consulting',
        language: 'en',
        languageName: 'English',
        title: 'Appointment Confirmation',
        breadcrumbs: 'Utility > Bookings > Appointment confirmation',
        header: { format: 'TEXT', text: 'Appointment Confirmed' },
        body: {
            text: 'Hello {{customer_name}}, your consultation with {{advisor_name}} is confirmed for {{date}} at {{time}}. Please arrive 10 minutes prior.',
            exampleText: 'Hello Michael, your consultation with Dr. Arvind Kumar is confirmed for Thursday, Nov 20 at 10:30 AM. Please arrive 10 minutes prior.'
        },
        footer: { text: 'Please notify us 24h in advance if rescheduling.' },
        buttons: [
            { type: 'QUICK_REPLY', text: 'Confirm Attendance' },
            { type: 'QUICK_REPLY', text: 'Reschedule' }
        ]
    },

    // --- ENGLISH MARKETING TEMPLATES ---
    {
        id: 'en_catalog_product_showcase',
        name: 'catalog_product_showcase',
        category: 'MARKETING',
        subtype: 'catalogue',
        feature: 'Catalog & Products',
        industry: 'E-commerce & Manufacturing',
        language: 'en',
        languageName: 'English',
        title: 'Interactive Product Catalog',
        breadcrumbs: 'Marketing > Product discovery > Catalog message',
        header: { format: 'CATALOG_HEADER', text: 'Explore Our New Product Catalog' },
        body: {
            text: 'Discover our latest equipment, rotavators, tractors, and machinery in our digital WhatsApp catalog! Browse specs, view photos, and place orders directly in chat. #happyshopping',
            exampleText: 'Discover our latest equipment, rotavators, tractors, and machinery in our digital WhatsApp catalog! Browse specs, view photos, and place orders directly in chat. #happyshopping'
        },
        footer: { text: 'Inspenox Machinery Systems' },
        buttons: [
            { type: 'CATALOG', text: 'View catalog' }
        ]
    },
    {
        id: 'en_multi_product_showcase',
        name: 'multi_product_collection',
        category: 'MARKETING',
        subtype: 'catalogue',
        feature: 'Catalog & Products',
        industry: 'E-commerce & Retail',
        language: 'en',
        languageName: 'English',
        title: 'Curated Multi-Product Showcase (MPM)',
        breadcrumbs: 'Marketing > Curated collections > Multi-product message',
        header: { format: 'CATALOG_HEADER', text: 'Featured Equipment Picks' },
        body: {
            text: 'Hi {{customer_name}}, we have handpicked our top-rated agricultural rotavators and tillers matching your regional soil type. Take a look below and order in chat with 0% interest financing!',
            exampleText: 'Hi Venkat, we have handpicked our top-rated agricultural rotavators and tillers matching your regional soil type. Take a look below and order in chat with 0% interest financing!'
        },
        footer: { text: 'Available while seasonal stocks last' },
        buttons: [
            { type: 'MPM', text: 'View Products' }
        ]
    },
    {
        id: 'en_festive_discount_sale',
        name: 'festive_discount_sale',
        category: 'MARKETING',
        subtype: 'custom',
        feature: 'Offers & Promotions',
        industry: 'Retail & Consumer Goods',
        language: 'en',
        languageName: 'English',
        title: 'Festive Flash Sale & Coupon',
        breadcrumbs: 'Marketing > Promotions > Coupon & discount',
        header: { format: 'TEXT', text: 'Special Festive Offer! 🎁' },
        body: {
            text: 'Celebrate this season with up to {{discount}}% OFF on all purchases! Use coupon code {{coupon_code}} at checkout. Valid until {{expiry_date}}.',
            exampleText: 'Celebrate this season with up to 30% OFF on all purchases! Use coupon code FESTIVE30 at checkout. Valid until Sunday Midnight.'
        },
        footer: { text: 'Terms & conditions apply' },
        buttons: [
            { type: 'COPY_CODE', text: 'Copy Offer Code', example: 'FESTIVE30' },
            { type: 'URL', text: 'Shop Online ↗', url: 'https://example.com/shop' }
        ]
    },
    {
        id: 'en_abandoned_cart_recovery',
        name: 'abandoned_cart_recovery',
        category: 'MARKETING',
        subtype: 'custom',
        feature: 'Offers & Promotions',
        industry: 'E-Commerce & Retail',
        language: 'en',
        languageName: 'English',
        title: 'Abandoned Cart Recovery & Free Delivery',
        breadcrumbs: 'Marketing > Sales recovery > Cart reminder',
        header: { format: 'TEXT', text: 'Did You Forget Something? 🛒' },
        body: {
            text: 'Hi {{customer_name}}, items in your shopping cart are selling fast! Complete your purchase in the next 24 hours to receive FREE express shipping.',
            exampleText: 'Hi Anita, items in your shopping cart are selling fast! Complete your purchase in the next 24 hours to receive FREE express shipping.'
        },
        footer: { text: 'Inspenox Store' },
        buttons: [
            { type: 'URL', text: 'Complete Your Order ↗', url: 'https://example.com/checkout' }
        ]
    },
    {
        id: 'en_call_permission_request',
        name: 'call_permission_request',
        category: 'MARKETING',
        subtype: 'calling_permissions',
        feature: 'Call permissions',
        industry: 'Consulting & High-Ticket Sales',
        language: 'en',
        languageName: 'English',
        title: 'WhatsApp Calling Permission Request',
        breadcrumbs: 'Marketing > Customer contact > Call permissions',
        header: { format: 'TEXT', text: 'Direct Consultation Request' },
        body: {
            text: 'Hi {{customer_name}}, our senior equipment specialist would like to briefly call you on WhatsApp regarding your inquiry about {{product_name}}. May we place a call?',
            exampleText: 'Hi Pradeep, our senior equipment specialist would like to briefly call you on WhatsApp regarding your inquiry about Shaktiman Rotavator. May we place a call?'
        },
        footer: { text: 'Tap below to select your preference' },
        buttons: [
            { type: 'QUICK_REPLY', text: 'Always allow calls' },
            { type: 'QUICK_REPLY', text: 'Temporarily allow' },
            { type: 'QUICK_REPLY', text: 'Not now' }
        ]
    },

    // --- AUTHENTICATION TEMPLATES ---
    {
        id: 'en_two_factor_auth_otp',
        name: 'two_factor_auth_otp',
        category: 'AUTHENTICATION',
        subtype: 'custom',
        feature: 'Account & Security',
        industry: 'Security & Access',
        language: 'en',
        languageName: 'English',
        title: 'One-Time Verification Password (OTP)',
        breadcrumbs: 'Authentication > Security > OTP verification',
        header: { format: 'NONE', text: '' },
        body: {
            text: '{{1}} is your Inspenox verification code. For your security, do not share this code with anyone. Code expires in 10 minutes.',
            exampleText: '582910 is your Inspenox verification code. For your security, do not share this code with anyone. Code expires in 10 minutes.'
        },
        footer: { text: '' },
        buttons: [
            { type: 'OTP', text: 'Copy Code', otp_type: 'COPY_CODE' }
        ]
    },
    {
        id: 'te_auth_otp_code',
        name: 'telugu_auth_otp_code',
        category: 'AUTHENTICATION',
        subtype: 'custom',
        feature: 'Account & Security',
        industry: 'Security & Access',
        language: 'te',
        languageName: 'Telugu',
        title: 'వన్ టైమ్ పాస్‌వర్డ్ (OTP)',
        breadcrumbs: 'Authentication > Security > OTP code',
        header: { format: 'NONE', text: '' },
        body: {
            text: '{{1}} మీ భద్రతా ధృవీకరణ కోడ్. మీ ఖాతా భద్రత కోసం, ఈ కోడ్‌ను ఎవరితోనూ పంచుకోవద్దు. ఇది 10 నిమిషాలు మాత్రమే చెల్లుబాటు అవుతుంది.',
            exampleText: '934812 మీ భద్రతా ధృవీకరణ కోడ్. మీ ఖాతా భద్రత కోసం, ఈ కోడ్‌ను ఎవరితోనూ పంచుకోవద్దు. ఇది 10 నిమిషాలు మాత్రమే చెల్లుబాటు అవుతుంది.'
        },
        footer: { text: '' },
        buttons: [
            { type: 'OTP', text: 'కోడ్‌ను కాపీ చేయండి', otp_type: 'COPY_CODE' }
        ]
    },

    // --- HINDI UTILITY & MARKETING TEMPLATES ---
    {
        id: 'hi_order_delivery_tracking',
        name: 'hindi_order_tracking',
        category: 'UTILITY',
        subtype: 'custom',
        feature: 'Order status',
        industry: 'E-Commerce & Retail',
        language: 'hi',
        languageName: 'Hindi',
        title: 'ऑर्डर डिलीवरी ट्रैकिंग',
        breadcrumbs: 'Utility > Order tracking > Delivery update',
        header: { format: 'TEXT', text: 'आपका ऑर्डर भेज दिया गया है 📦' },
        body: {
            text: 'नमस्ते {{customer_name}}, आपका ऑर्डर #{{order_id}} भेज दिया गया है। अनुमानित डिलीवरी तिथि {{delivery_date}} है। नीचे दिए गए लिंक से लाइव ट्रैक करें।',
            exampleText: 'नमस्ते अमित, आपका ऑर्डर #ORD-55412 भेज दिया गया है। अनुमानित डिलीवरी तिथि 22 नवंबर है। नीचे दिए गए लिंक से लाइव ट्रैक करें।'
        },
        footer: { text: 'हमारे साथ खरीदारी करने के लिए धन्यवाद!' },
        buttons: [
            { type: 'URL', text: 'ऑर्डर ट्रैक करें ↗', url: 'https://example.com/track/{{1}}' }
        ]
    },
    {
        id: 'hi_catalog_showcase',
        name: 'hindi_catalog_showcase',
        category: 'MARKETING',
        subtype: 'catalogue',
        feature: 'Catalog & Products',
        industry: 'Machinery & Equipment',
        language: 'hi',
        languageName: 'Hindi',
        title: 'उत्पाद कैटलॉग एक्सप्लोर करें',
        breadcrumbs: 'Marketing > Product discovery > Catalog message',
        header: { format: 'CATALOG_HEADER', text: 'हमारा नया उत्पाद कैटलॉग' },
        body: {
            text: 'नमस्ते {{customer_name}}! हमारे नवीनतम रोटावेटर, ट्रैक्टर और कृषि उपकरणों की पूरी सूची हमारे व्हाट्सएप कैटलॉग में देखें।',
            exampleText: 'नमस्ते विजय जी! हमारे नवीनतम रोटावेटर, ट्रैक्टर और कृषि उपकरणों की पूरी सूची हमारे व्हाट्सएप कैटलॉग में देखें।'
        },
        footer: { text: 'Inspenox Machinery' },
        buttons: [
            { type: 'CATALOG', text: 'View catalog' }
        ]
    }
];

// --- State Management ---
let currentLibraryCategory = 'ALL';
let currentLibraryFeature = 'ALL';
let currentLibraryLanguage = 'ALL';
let currentLibrarySearch = '';
let activeModalTemplate = null;
let activeModalPreviewTab = 'parameters'; // 'parameters' | 'example'

// Smart sample generator for Example preview mode
function getRealisticSampleValue(varKey, lang) {
    const k = String(varKey).toLowerCase();
    if (lang === 'te') {
        if (k.includes('name') || k.includes('customer')) return 'రాజీవ్';
        if (k.includes('order')) return '#INSP-89412';
        if (k.includes('date')) return '24 నవంబర్';
        if (k.includes('address')) return 'ప్లాట్ నెం. 12, మాదాపూర్, హైదరాబాద్';
        if (k.includes('code') || k === '1') return '582910';
        if (k.includes('product')) return 'రోటవేటర్';
        return 'రాజేష్';
    } else if (lang === 'hi') {
        if (k.includes('name') || k.includes('customer')) return 'अमित';
        if (k.includes('order')) return '#ORD-55412';
        if (k.includes('date')) return '24 नवंबर';
        if (k.includes('address')) return 'प्लॉट 42, मालवीय नगर, जयपुर';
        if (k.includes('code') || k === '1') return '582910';
        if (k.includes('product')) return 'रोटावेटर';
        return 'विजय';
    } else {
        if (k.includes('name') || k.includes('customer')) return 'Alex';
        if (k.includes('order')) return '#ORD-98412';
        if (k.includes('date')) return 'Nov 24';
        if (k.includes('address')) return '42 Palm Street, Suite 3B';
        if (k.includes('code') || k === '1') return '582910';
        if (k.includes('product')) return 'Rotavator';
        return 'John Doe';
    }
}

// --- View Tabs Switcher (My Templates vs Template Library) ---
window.switchTemplateTab = function switchTemplateTab(tab) {
    const isLib = tab === 'library';
    const myTabBtn = document.getElementById('tab-btn-my-templates') || document.getElementById('tab-my-templates');
    const libTabBtn = document.getElementById('tab-btn-library-templates') || document.getElementById('tab-library-templates');
    const myView = document.getElementById('templates-my-container');
    const libView = document.getElementById('templates-library-container');

    if (myTabBtn) {
        myTabBtn.classList.toggle('active', !isLib);
        myTabBtn.style.color = !isLib ? 'var(--primary)' : 'var(--text-muted)';
        myTabBtn.style.borderBottom = !isLib ? '3px solid var(--primary)' : '3px solid transparent';
        myTabBtn.style.background = !isLib ? 'var(--bg-card)' : 'transparent';
        myTabBtn.style.fontWeight = !isLib ? '700' : '600';
    }
    if (libTabBtn) {
        libTabBtn.classList.toggle('active', isLib);
        libTabBtn.style.color = isLib ? 'var(--primary)' : 'var(--text-muted)';
        libTabBtn.style.borderBottom = isLib ? '3px solid var(--primary)' : '3px solid transparent';
        libTabBtn.style.background = isLib ? 'var(--bg-card)' : 'transparent';
        libTabBtn.style.fontWeight = isLib ? '700' : '600';
    }
    if (myView) myView.style.display = isLib ? 'none' : 'block';
    if (libView) {
        libView.style.display = isLib ? 'block' : 'none';
        if (isLib) {
            if (typeof populateLibraryFeatureFilters === 'function') {
                populateLibraryFeatureFilters();
            }
            renderTemplateLibrary();
        }
    }
};

// --- Populate Feature / Type Filters in Left Sidebar ---
window.populateLibraryFeatureFilters = function populateLibraryFeatureFilters() {
    const container = document.getElementById('tpl-lib-feature-filters');
    if (!container) return;

    const features = {};
    META_TEMPLATE_LIBRARY.forEach(t => {
        if (!t.feature) return;
        features[t.feature] = (features[t.feature] || 0) + 1;
    });

    let html = `
        <button type="button" class="btn text-left tpl-lib-feat-btn ${currentLibraryFeature === 'ALL' ? 'active' : ''}"
            onclick="setLibraryFeatureFilter('ALL', this)"
            style="text-align: left; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.825rem; font-weight: ${currentLibraryFeature === 'ALL' ? '700' : '500'}; background: ${currentLibraryFeature === 'ALL' ? 'rgba(0, 168, 132, 0.12)' : 'transparent'}; color: ${currentLibraryFeature === 'ALL' ? 'var(--primary)' : 'var(--text-main)'}; border: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; width: 100%; transition: all 0.15s ease;">
            <span>All Features</span>
            <span style="font-size: 0.75rem; background: var(--bg-main, #f1f5f9); padding: 1px 7px; border-radius: 10px; color: var(--text-muted); font-weight: 600;">${META_TEMPLATE_LIBRARY.length}</span>
        </button>
    `;

    Object.keys(features).sort().forEach(feat => {
        const isActive = currentLibraryFeature === feat;
        const count = features[feat];
        html += `
            <button type="button" class="btn text-left tpl-lib-feat-btn ${isActive ? 'active' : ''}"
                onclick="setLibraryFeatureFilter('${escapeHtml(feat)}', this)"
                style="text-align: left; padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.825rem; font-weight: ${isActive ? '700' : '500'}; background: ${isActive ? 'rgba(0, 168, 132, 0.12)' : 'transparent'}; color: ${isActive ? 'var(--primary)' : 'var(--text-main)'}; border: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; width: 100%; transition: all 0.15s ease;">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">${escapeHtml(feat)}</span>
                <span style="font-size: 0.75rem; background: var(--bg-main, #f1f5f9); padding: 1px 7px; border-radius: 10px; color: var(--text-muted); margin-left: 4px; font-weight: 600;">${count}</span>
            </button>
        `;
    });

    container.innerHTML = html;
};

// --- Render Template Library ---
window.renderTemplateLibrary = function renderTemplateLibrary() {
    const grid = document.getElementById('template-library-grid');
    const countBadge = document.getElementById('library-templates-count');
    const countLabel = document.getElementById('tpl-lib-count-label');
    if (!grid) return;

    // Always synchronize live state from the DOM controls
    const langSel = document.getElementById('tpl-lib-language');
    if (langSel && langSel.value) {
        currentLibraryLanguage = langSel.value === 'all' ? 'ALL' : langSel.value;
    }
    const searchInp = document.getElementById('tpl-lib-search');
    if (searchInp && searchInp.value !== undefined) {
        currentLibrarySearch = searchInp.value.toLowerCase().trim();
    }

    const filtered = META_TEMPLATE_LIBRARY.filter(t => {
        const matchCat = currentLibraryCategory === 'ALL' || t.category === currentLibraryCategory;
        const matchFeature = currentLibraryFeature === 'ALL' || t.feature === currentLibraryFeature;
        const matchLang = currentLibraryLanguage === 'ALL' || t.language === currentLibraryLanguage;
        const matchSearch = !currentLibrarySearch || 
            (t.name || '').toLowerCase().includes(currentLibrarySearch) ||
            (t.title || '').toLowerCase().includes(currentLibrarySearch) ||
            (t.body?.text || '').toLowerCase().includes(currentLibrarySearch) ||
            (t.feature || '').toLowerCase().includes(currentLibrarySearch);

        return matchCat && matchFeature && matchLang && matchSearch;
    });

    if (countBadge) {
        countBadge.textContent = `${filtered.length} templates`;
    }
    if (countLabel) {
        countLabel.textContent = `Showing ${filtered.length} of ${META_TEMPLATE_LIBRARY.length} templates`;
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1rem; color: var(--text-muted);">
                <div style="font-size: 2.4rem; margin-bottom: 0.6rem;">🔍</div>
                <h4 style="color: var(--text-main); margin: 0 0 0.35rem 0; font-size: 1.1rem;">No templates match your filters</h4>
                <p style="font-size: 0.85rem; margin: 0 0 1.25rem 0;">Try resetting the language, category, or search keywords.</p>
                <button type="button" class="btn secondary sm" onclick="resetLibraryFilters()">Reset Filters</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(t => {
        const catBadgeColor = t.category === 'UTILITY' ? 'badge-blue' : (t.category === 'MARKETING' ? 'badge-green' : 'badge-amber');
        
        // Highlight parameters like {{text}} or {{customer_name}} with distinct green WhatsApp pills
        const formattedBody = escapeHtml(t.body.text).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, '<span class="tpl-param-pill">{{$1}}</span>');

        // Buttons HTML preview
        let buttonsHtml = '';
        if (Array.isArray(t.buttons) && t.buttons.length > 0) {
            buttonsHtml = `
                <div style="display:flex; flex-direction:column; gap:0.35rem; margin-top:0.65rem; border-top:1px solid #e9edef; padding-top:0.55rem;">
                    ${t.buttons.map(b => {
                        const icon = b.type === 'CATALOG' ? '🛒' : (b.type === 'MPM' ? '🛍️' : (b.type === 'URL' ? '↗' : (b.type === 'PHONE_NUMBER' ? '📞' : '📋')));
                        return `<div style="color:#00a884; font-size:0.75rem; font-weight:600; text-align:center; padding:0.35rem; background:#fff; border-radius:6px; border:1px solid #e9edef; display:flex; align-items:center; justify-content:center; gap:5px; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
                            <span>${icon}</span> <span>${escapeHtml(b.text || 'View')}</span>
                        </div>`;
                    }).join('')}
                </div>
            `;
        }

        return `
            <div class="card library-template-card" style="cursor:pointer;" onclick="openLibraryTemplateModal('${t.id}')">
                <div>
                    <!-- Top Category & Language Bar -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                        <span class="badge ${catBadgeColor}" style="font-size:0.7rem; font-weight:700; letter-spacing:0.04em;">${t.category}</span>
                        <div style="display:flex; align-items:center; gap:5px; background:rgba(0,0,0,0.04); padding:2px 8px; border-radius:12px;">
                            <span style="font-size:0.72rem; color:var(--text-muted); font-weight:600;">${t.languageName}</span>
                            <span style="font-size:0.85rem;">🌐</span>
                        </div>
                    </div>

                    <!-- WhatsApp Preview Screen -->
                    <div class="tpl-lib-bubble-wrap">
                        <div class="tpl-lib-bubble-msg">
                            ${t.header?.text ? `
                                <div style="font-weight:700; font-size:0.85rem; color:#111b21; margin-bottom:0.4rem; display:flex; align-items:center; gap:5px;">
                                    ${t.header.format === 'CATALOG_HEADER' ? '🛍️' : ''}
                                    <span>${escapeHtml(t.header.text)}</span>
                                </div>
                            ` : ''}
                            <div style="font-size:0.8rem; color:#111b21; line-height:1.45; word-break:break-word;">
                                ${formattedBody}
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.4rem; font-size:0.65rem; color:#667781;">
                                <span>${escapeHtml(t.footer?.text || '')}</span>
                                <span style="display:flex; align-items:center; gap:2px;">
                                    <span>07:01</span>
                                    <span style="color:#53bdeb; font-weight:bold;">✓✓</span>
                                </span>
                            </div>
                            ${buttonsHtml}
                        </div>
                    </div>
                </div>

                <!-- Bottom Meta & Action Button -->
                <div style="border-top:1px solid var(--border); padding-top:0.75rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem; margin-top:auto;">
                    <div style="overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1;" title="${escapeHtml(t.name)}">
                        <div style="font-weight:700; font-size:0.825rem; color:var(--text-main); font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.name)}</div>
                        <div style="font-size:0.72rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(t.feature)}</div>
                    </div>
                    <button type="button" class="btn primary sm tpl-lib-use-btn" onclick="event.stopPropagation(); openLibraryTemplateModal('${t.id}')">
                        Use Template ➔
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

// --- Library Filters Helpers ---
window.setLibraryCategoryFilter = function setLibraryCategoryFilter(cat, btn) {
    currentLibraryCategory = cat;
    document.querySelectorAll('.lib-cat-pill').forEach(b => {
        b.classList.remove('active');
        b.classList.add('secondary');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
        b.style.fontWeight = '500';
    });
    if (btn) {
        btn.classList.add('active');
        btn.classList.remove('secondary');
        btn.style.background = 'var(--primary)';
        btn.style.color = '#fff';
        btn.style.fontWeight = '700';
    }
    renderTemplateLibrary();
};

window.setLibraryFeatureFilter = function setLibraryFeatureFilter(feat, btn) {
    currentLibraryFeature = feat;
    populateLibraryFeatureFilters();
    renderTemplateLibrary();
};

window.filterTemplateLibrary = function filterTemplateLibrary() {
    const searchInp = document.getElementById('tpl-lib-search');
    const langSel = document.getElementById('tpl-lib-language');

    currentLibrarySearch = (searchInp?.value || '').toLowerCase().trim();
    const selectedLang = langSel?.value || 'all';
    currentLibraryLanguage = selectedLang === 'all' ? 'ALL' : selectedLang;

    renderTemplateLibrary();
};

window.filterLibraryByCategory = function filterLibraryByCategory(cat) {
    currentLibraryCategory = cat;
    renderTemplateLibrary();
};

window.filterLibraryByFeature = function filterLibraryByFeature(feat) {
    currentLibraryFeature = feat;
    renderTemplateLibrary();
};

window.filterLibraryByLanguage = function filterLibraryByLanguage(lang) {
    currentLibraryLanguage = lang;
    const langSelect = document.getElementById('tpl-lib-language') || document.getElementById('library-lang-select');
    if (langSelect) langSelect.value = lang.toLowerCase();
    renderTemplateLibrary();
};

window.filterLibraryBySearch = function filterLibraryBySearch(val) {
    currentLibrarySearch = (val || '').toLowerCase().trim();
    renderTemplateLibrary();
};

window.resetLibraryFilters = function resetLibraryFilters() {
    currentLibraryCategory = 'ALL';
    currentLibraryFeature = 'ALL';
    currentLibraryLanguage = 'ALL';
    currentLibrarySearch = '';

    const searchInput = document.getElementById('tpl-lib-search') || document.getElementById('library-search-input');
    const langSelect = document.getElementById('tpl-lib-language') || document.getElementById('library-lang-select');
    if (searchInput) searchInput.value = '';
    if (langSelect) langSelect.value = 'all';

    document.querySelectorAll('.lib-cat-pill').forEach((btn, idx) => {
        if (idx === 0) {
            btn.classList.add('active');
            btn.classList.remove('secondary');
            btn.style.background = 'var(--primary)';
            btn.style.color = '#fff';
            btn.style.fontWeight = '700';
        } else {
            btn.classList.remove('active');
            btn.classList.add('secondary');
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-muted)';
            btn.style.fontWeight = '500';
        }
    });

    populateLibraryFeatureFilters();
    renderTemplateLibrary();
};

// --- Template Details Preview Modal ---
window.updateLibraryModalNameCounter = function updateLibraryModalNameCounter(val) {
    const counter = document.getElementById('lib-modal-name-counter');
    if (counter) {
        const len = (val || '').length;
        counter.textContent = `${len}/512`;
        counter.style.color = len > 512 ? 'var(--danger, #ef4444)' : 'var(--text-muted)';
    }
};

window.openLibraryTemplateModal = function openLibraryTemplateModal(templateId) {
    const tpl = META_TEMPLATE_LIBRARY.find(t => t.id === templateId || t.name === templateId);
    if (!tpl) return;

    activeModalTemplate = tpl;
    activeModalPreviewTab = 'parameters';

    const modal = document.getElementById('modal-template-library-preview');
    if (!modal) return;

    // Header & Breadcrumbs
    const titleEl = document.getElementById('lib-modal-tpl-title') || document.getElementById('lib-modal-title');
    const breadcrumbsEl = document.getElementById('lib-modal-breadcrumbs');
    if (titleEl) titleEl.textContent = tpl.name;
    if (breadcrumbsEl) breadcrumbsEl.textContent = tpl.breadcrumbs || `${tpl.category} › ${tpl.feature}`;

    // Suggested Template Name Input
    const nameInput = document.getElementById('lib-modal-tpl-name');
    if (nameInput) {
        nameInput.value = tpl.name;
        updateLibraryModalNameCounter(tpl.name);
    }

    setLibraryPreviewTab('params');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeLibraryTemplateModal = function closeLibraryTemplateModal() {
    const modal = document.getElementById('modal-template-library-preview');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    activeModalTemplate = null;
};

window.setLibraryPreviewTab = function setLibraryPreviewTab(tabName) {
    activeModalPreviewTab = (tabName === 'example' ? 'example' : 'parameters');
    
    const btnParams = document.getElementById('lib-preview-tab-params');
    const btnExample = document.getElementById('lib-preview-tab-example');

    if (btnParams && btnExample) {
        const isParams = activeModalPreviewTab === 'parameters';
        btnParams.classList.toggle('active', isParams);
        btnExample.classList.toggle('active', !isParams);
    }
    renderLibraryModalBubblePreview();
};

window.switchLibraryModalTab = window.setLibraryPreviewTab;

function renderLibraryModalBubblePreview() {
    if (!activeModalTemplate) return;
    const tpl = activeModalTemplate;
    const isExample = activeModalPreviewTab === 'example';

    const headerEl = document.getElementById('lib-preview-header');
    const bodyEl = document.getElementById('lib-preview-body');
    const footerEl = document.getElementById('lib-preview-footer');
    const buttonsEl = document.getElementById('lib-preview-buttons');

    // Body rendering:
    // In Parameters mode: show with {{variable_name}} highlighted in green pill
    // In Example mode: show with actual realistic values substituted
    let displayText = '';
    if (isExample) {
        let textToUse = tpl.body.exampleText || tpl.body.text;
        // If text still contains {{...}}, substitute with realistic values
        textToUse = textToUse.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
            return getRealisticSampleValue(p1, tpl.language);
        });
        displayText = escapeHtml(textToUse);
    } else {
        displayText = escapeHtml(tpl.body.text).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, '<span class="tpl-param-pill">{{$1}}</span>');
    }

    // Header element
    if (headerEl) {
        if (tpl.header?.text) {
            headerEl.style.display = 'block';
            const isCatalog = tpl.header.format === 'CATALOG_HEADER';
            headerEl.innerHTML = `${isCatalog ? '🛍️ ' : ''}<span>${escapeHtml(tpl.header.text)}</span>`;
        } else {
            headerEl.style.display = 'none';
            headerEl.innerHTML = '';
        }
    }

    // Body element
    if (bodyEl) {
        bodyEl.innerHTML = displayText;
    }

    // Footer element
    if (footerEl) {
        if (tpl.footer?.text) {
            footerEl.style.display = 'block';
            footerEl.textContent = tpl.footer.text;
        } else {
            footerEl.style.display = 'none';
            footerEl.textContent = '';
        }
    }

    // Buttons element
    if (buttonsEl) {
        if (Array.isArray(tpl.buttons) && tpl.buttons.length > 0) {
            buttonsEl.style.display = 'flex';
            buttonsEl.innerHTML = tpl.buttons.map(b => {
                const icon = b.type === 'CATALOG' ? '🛒' : (b.type === 'MPM' ? '🛍️' : (b.type === 'URL' ? '↗' : (b.type === 'PHONE_NUMBER' ? '📞' : '📋')));
                return `<div style="color:#00a884; font-size:0.8rem; font-weight:600; text-align:center; padding:0.45rem; background:#fff; border-radius:6px; border:1px solid #e9edef; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <span>${icon}</span> <span>${escapeHtml(b.text || 'View')}</span>
                </div>`;
            }).join('');
        } else {
            buttonsEl.style.display = 'none';
            buttonsEl.innerHTML = '';
        }
    }
}

// --- Action 1: "Customise Template" (Pre-fills Step 2 Template Builder Wizard) ---
window.customizeLibraryTemplate = function customizeLibraryTemplate() {
    if (!activeModalTemplate) return;
    const tpl = activeModalTemplate;
    const customName = document.getElementById('lib-modal-tpl-name')?.value.trim() || tpl.name;

    closeLibraryTemplateModal();

    // Open Template Creator Modal directly on Step 2 with all data populated
    if (typeof openTemplateModal === 'function') {
        openTemplateModal();
    }

    currentSelectedCategory = tpl.category;
    currentSelectedSubtype = tpl.subtype || 'custom';

    if (typeof goToStep === 'function') {
        goToStep(2);
    }
    if (typeof renderStep2Form === 'function') {
        renderStep2Form(currentSelectedCategory, currentSelectedSubtype);
    }

    // Populate Fields
    setTimeout(() => {
        const nameInp = document.getElementById('tpl-name');
        const langSel = document.getElementById('tpl-lang');
        const bodyInp = document.getElementById('tpl-body');
        const footerInp = document.getElementById('tpl-footer');
        const headerType = document.getElementById('tpl-header-type');
        const headerText = document.getElementById('tpl-header-text');

        if (nameInp) nameInp.value = customName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (langSel && tpl.language) {
            let opt = Array.from(langSel.options).find(o => o.value === tpl.language);
            if (!opt) {
                const newOpt = document.createElement('option');
                newOpt.value = tpl.language;
                newOpt.textContent = `${tpl.languageName} (${tpl.language})`;
                langSel.appendChild(newOpt);
            }
            langSel.value = tpl.language;
        }

        if (headerType && tpl.header) {
            if (tpl.header.format === 'TEXT' && headerText) {
                headerType.value = 'TEXT';
                headerText.value = tpl.header.text;
                const hGroup = document.getElementById('tpl-header-text-group');
                if (hGroup) hGroup.style.display = 'block';
            }
        }

        if (bodyInp) bodyInp.value = tpl.body.text;
        if (footerInp && tpl.footer) footerInp.value = tpl.footer.text || '';

        // Add pre-defined buttons if applicable
        if (Array.isArray(tpl.buttons) && typeof addTemplateButton === 'function') {
            tpl.buttons.forEach(b => {
                if (['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE'].includes(b.type)) {
                    addTemplateButton(b.type, b);
                }
            });
        }

        if (typeof updateBannerTitle === 'function') updateBannerTitle();
        if (typeof updateLivePreview === 'function') updateLivePreview();

        showToast(`Loaded "${tpl.name}" from Template Library! Tweak any details and submit.`, 'success');
    }, 50);
};

// --- Action 2: "Submit to Meta" Directly from Library Modal ---
window.submitLibraryTemplateDirectly = async function submitLibraryTemplateDirectly() {
    if (!activeModalTemplate) return;
    const tpl = activeModalTemplate;
    const nameInput = document.getElementById('lib-modal-tpl-name');
    const customName = (nameInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (!customName) {
        if (nameInput) {
            nameInput.focus();
            nameInput.style.borderColor = '#ef4444';
        }
        showToast('Please enter a template name', 'warning');
        return;
    }

    const submitBtn = document.getElementById('btn-lib-modal-submit');
    const origHtml = submitBtn ? submitBtn.innerHTML : 'Submit to Meta';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="width:14px; height:14px;"></span> Submitting to Meta...';
    }

    try {
        const components = [];

        // Header
        if (tpl.header && tpl.header.format === 'TEXT' && tpl.header.text) {
            components.push({
                type: 'HEADER',
                format: 'TEXT',
                text: tpl.header.text
            });
        }

        // Body
        const bodyComp = {
            type: 'BODY',
            text: tpl.body.text
        };
        const posMatches = [...tpl.body.text.matchAll(/\{\{(\d+)\}\}/g)];
        if (posMatches.length > 0) {
            bodyComp.example = { body_text: [['Sample_1']] };
        }
        components.push(bodyComp);

        // Footer
        if (tpl.footer && tpl.footer.text) {
            components.push({
                type: 'FOOTER',
                text: tpl.footer.text
            });
        }

        // Buttons
        if (Array.isArray(tpl.buttons) && tpl.buttons.length > 0) {
            const btnList = [];
            tpl.buttons.forEach(b => {
                if (b.type === 'CATALOG') btnList.push({ type: 'CATALOG', text: b.text || 'View catalog' });
                else if (b.type === 'MPM') btnList.push({ type: 'MPM', text: b.text || 'View Products' });
                else if (b.type === 'URL') btnList.push({ type: 'URL', text: b.text, url: b.url });
                else if (b.type === 'QUICK_REPLY') btnList.push({ type: 'QUICK_REPLY', text: b.text });
                else if (b.type === 'OTP') btnList.push({ type: 'OTP', otp_type: 'COPY_CODE', text: b.text || 'Copy Code' });
            });
            if (btnList.length > 0) {
                components.push({ type: 'BUTTONS', buttons: btnList });
            }
        }

        const payload = {
            name: customName,
            category: tpl.category,
            language: tpl.language,
            components
        };

        const res = await apiFetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.error) {
            showModal('Submission Error', data.error);
        } else {
            closeLibraryTemplateModal();
            showModal('Success!', `Template "${customName}" submitted to Meta Cloud API successfully! Status: ${data.template?.status || 'PENDING'}`);
            if (typeof loadTemplates === 'function') loadTemplates();
            switchTemplateTab('my');
        }
    } catch(err) {
        showModal('Error', 'Failed to connect to template API: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origHtml;
        }
    }
};

// Initialize Library on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    const langSel = document.getElementById('tpl-lib-language');
    if (langSel) {
        langSel.addEventListener('change', filterTemplateLibrary);
    }
    const searchInp = document.getElementById('tpl-lib-search');
    if (searchInp) {
        searchInp.addEventListener('input', filterTemplateLibrary);
    }

    // If the template view is loaded, ensure library can be rendered
    const libView = document.getElementById('templates-library-container');
    if (libView) {
        if (typeof populateLibraryFeatureFilters === 'function') {
            populateLibraryFeatureFilters();
        }
        renderTemplateLibrary();
    }
});
