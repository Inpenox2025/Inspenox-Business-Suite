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

// --- Dashboard Logic ---
async function loadDashboard() {
    if (typeof window.loadDashboard === 'function') {
        return window.loadDashboard();
    }
}

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



