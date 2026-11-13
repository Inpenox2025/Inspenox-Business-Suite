# Inspenox Frontend Controllers Architecture

This directory contains the modularized frontend controllers migrated directly from `app.js`. Every function, helper, event listener, and variable from `app.js` has been preserved without any missing functionality.

---

## 📁 Controller Directory Overview

| # | Controller File | Primary Functional Responsibilities | Original Lines in `app.js` |
|---|----------------|--------------------------------------|---------------------------|
| 1 | **`coreController.js`** | Core utilities, HTML escaping, empty-table generator, customer 6h quarantine info, thumbnails, sound notifications, shared globals, modal dialogs (`showModal`, `closeModal`), theme toggle (dark/light), sidebar navigation accordion, and SPA routing (`switchView`, history, `initApp`). | `1 - 316`, `2508 - 2848`, `3370 - 3539` |
| 2 | **`companyController.js`** | Multi-tenant organization state, `apiFetch` wrapper with `X-Company-ID` signing, workspace switching, Superadmin detection, company settings, Meta credentials management, phone number limit controls, and Superadmin manual overrides modal. | `317 - 2507` |
| 3 | **`dashboardController.js`** | Real-time analytics dashboard loader (`loadDashboard`), broadcast message delivery rates, read rates, active contacts growth trends, and quick-action navigation shortcuts. | `4754 - 4908` |
| 4 | **`customersController.js`** | Customer CRM contacts loader (`loadCustomers`), table rendering with pagination and search, customer tags management & color palettes, lead status pipeline (Open, Contacted, Qualified, Converted, Lost), customer add/edit modal with auto-scroll, quick conversation notes sync (`syncChatNotesUI`), and CSV/Excel/PDF export tools. | `3540 - 4753` |
| 5 | **`templatesController.js`** | Pre-approved WhatsApp template management (`loadTemplates`), Meta Graph API template sync, interactive multi-step template builder wizard (Marketing, Utility, Auth OTP, Catalogues, Calling permissions), media sample upload & validation (up to 16MB), variable replacement picker (`{{1}}`, `{{name}}`), and live smartphone mockup preview. | `4909 - 7334` |
| 6 | **`broadcastController.js`** | Outbound bulk broadcast campaign setup (`loadCustomersForSelect`, `renderBroadcastCustomersList`), audience selection by range and tag segmentation, automatic exclusion of contacts in Meta's 6-hour maturation quarantine, template picker, message types, cost estimation, and broadcast progress modal with animated SVG circular countdown (`bcProgressModal`). | `7335 - 8671` |
| 7 | **`campaignsController.js`** | All Broadcast Campaigns analytics dashboard (`loadCampaignsDashboard`, `renderCampaignsTable`), sent/delivered/read rates, campaign search, and Detailed Campaign Audit Modal (`viewCampaignDetailsModal`) showing initiating user, sender phone ID, template name, sent timestamp, and full searchable recipient delivery log. | `8672 - 9402` |
| 8 | **`inboxController.js`** | Real-time WhatsApp Web replica live chat (`loadInboxSidebar`, `renderInboxCustomerList`, `openCustomerChat`, `closeChat`), 24-hour service window tracking, chat filters (All, 24h Active, 24h Expired), searchable contact list, rich message bubbles (text, media, audio, video, documents, location, interactive buttons), file staging & sending, Escape key to close chat, and in-chat notes & lead status updating. | `9403 - 11340` |
| 9 | **`mediaController.js`** | Workspace Media Asset Library controller (`loadMedia`, `renderMediaGrid`), file uploads (images, PDFs, documents, brochures, videos), generating public HTTPS URLs for template sample headers and broadcast media attachments, media search, and copy-link utilities. | `11341 - 11774` |
| 10 | **`billingController.js`** | Subscriptions & Billing controller, subscription packages (Starter, Growth, Enterprise Elite), instant UI engine, billing cycle toggle (Monthly, Quarterly, Annual with discount badges), Razorpay INR checkout integration with convenience fee gross-up, coupon redemption & influencer referral discount engine, and downloadable official workspace invoices & payment receipts. | `2849 - 3369`, `11775 - 12808` |
| 11 | **`automationController.js`** | Enterprise 24/7 Automation Board controller (`loadAutomationBoard`, `renderAutomationRulesList`), trigger events (First Contact / Welcome, Inbound Keyword, Button Click Reply), 6-step workflow chaining, interactive Meta template button reply chip picker, rule add/edit modal, test dispatch, active/inactive toggle, and custom delete confirmation modal. | `12809 - 13802` |
| 12 | **`simulatorController.js`** | Interactive WhatsApp Smartphone Simulator controller (used in the Automation Board and Landing Page), multi-step bot progression simulation (Welcome ➔ Location ➔ List Menu ➔ Order ➔ Live Agent), stepper pills, button click simulation, hover detection, and auto-play replay loops. | `13803 - 14141` |

---

## 🚀 Future Integration in `index.html`

When you are ready to integrate these modular controllers into `index.html` in place of the single `app.js`, simply replace:

```html
<script src="/app.js"></script>
```

with the following ordered script tags:

```html
<!-- Inspenox Modular Controllers -->
<script src="/controllers/coreController.js"></script>
<script src="/controllers/companyController.js"></script>
<script src="/controllers/dashboardController.js"></script>
<script src="/controllers/customersController.js"></script>
<script src="/controllers/templatesController.js"></script>
<script src="/controllers/broadcastController.js"></script>
<script src="/controllers/campaignsController.js"></script>
<script src="/controllers/inboxController.js"></script>
<script src="/controllers/mediaController.js"></script>
<script src="/controllers/billingController.js"></script>
<script src="/controllers/automationController.js"></script>
<script src="/controllers/simulatorController.js"></script>
```

