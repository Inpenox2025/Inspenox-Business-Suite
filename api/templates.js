module.exports = async (req, res) => {
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!wabaId || !token) {
        return res.status(400).json({ error: 'WhatsApp credentials not fully configured in environment variables.' });
    }

    if (req.method === 'GET') {
        try {
            const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?limit=100`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (data.error) {
                return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
            }

            return res.status(200).json(data.data || []);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Edit Template Endpoint (PUT or POST with action=edit / id)
    if (req.method === 'PUT' || (req.method === 'POST' && (req.query.action === 'edit' || req.query.id || (req.body && req.body.id && req.body.is_edit)))) {
        try {
            const { id, category, components } = req.body || {};
            const rawTemplateId = req.query.id || id;

            if (!rawTemplateId) {
                return res.status(400).json({ error: 'Template ID is required for editing.' });
            }

            let targetId = rawTemplateId;

            // If rawTemplateId is a template name slug (non-numeric), lookup numeric Meta template ID from WABA list
            if (isNaN(rawTemplateId)) {
                try {
                    const listRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(rawTemplateId)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const listData = await listRes.json();
                    if (listData.data && listData.data.length > 0 && listData.data[0].id) {
                        targetId = listData.data[0].id;
                    }
                } catch (e) {
                    console.error('Template ID lookup error:', e);
                }
            }

            const url = `https://graph.facebook.com/v19.0/${targetId}`;
            const bodyPayload = {};
            if (category) bodyPayload.category = category.toUpperCase();
            if (components && Array.isArray(components)) bodyPayload.components = components;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyPayload)
            });

            const data = await response.json();
            if (data.error) {
                const errorMsg = data.error.error_user_msg || data.error.error_data?.details || data.error.message || JSON.stringify(data.error);
                return res.status(400).json({ error: errorMsg });
            }

            return res.status(200).json({ success: true, template: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Create Template Endpoint (POST)
    if (req.method === 'POST') {
        try {
            const { name, category, language, components, parameter_format } = req.body || {};

            if (!name || !category || !language || !components || !Array.isArray(components)) {
                return res.status(400).json({ error: 'Missing required template parameters (name, category, language, components array).' });
            }

            const formattedName = name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

            const payloadToMeta = {
                name: formattedName,
                category: category.toUpperCase(),
                language: language,
                components: components
            };
            if (parameter_format) {
                payloadToMeta.parameter_format = parameter_format;
            }

            const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payloadToMeta)
            });

            const data = await response.json();
            if (data.error) {
                const errorMsg = data.error.error_user_msg || data.error.error_data?.details || data.error.message || JSON.stringify(data.error);
                return res.status(400).json({ error: errorMsg });
            }

            return res.status(200).json({ success: true, template: data });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // Delete Template Endpoint (DELETE)
    if (req.method === 'DELETE') {
        try {
            const name = req.query.name || (req.body && req.body.name);
            const templateId = req.query.id || (req.body && req.body.id);

            if (!name && !templateId) {
                return res.status(400).json({ error: 'Template name or ID required for deletion.' });
            }

            // Fallback strategy list for Meta Cloud API deletion
            const urlsToTry = [];

            if (name) {
                let urlWithName = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;
                if (templateId && !isNaN(templateId)) {
                    urlWithName += `&hsm_id=${templateId}`;
                }
                urlsToTry.push(urlWithName);
            }

            if (templateId && !isNaN(templateId)) {
                urlsToTry.push(`https://graph.facebook.com/v19.0/${templateId}`);
            }

            if (name) {
                urlsToTry.push(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${encodeURIComponent(name)}`);
            }

            let lastError = null;
            for (const targetUrl of urlsToTry) {
                try {
                    const response = await fetch(targetUrl, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    const data = await response.json();
                    if (!data.error && (data.success || data.result)) {
                        return res.status(200).json({ success: true, result: data });
                    }
                    if (data.error) {
                        lastError = data.error;
                    }
                } catch (err) {
                    console.error('Fetch error during template delete try:', err);
                }
            }

            // Format Meta response error clearly
            let errorMsg = lastError ? (lastError.message || JSON.stringify(lastError)) : 'Meta API failed to delete template.';
            if (errorMsg.includes('Invalid parameter') || (name && name.toLowerCase().startsWith('hello_world'))) {
                errorMsg = `Meta Cloud API Notice: Default system sample templates (such as "hello_world") are pre-provisioned and locked by Meta, so they cannot be deleted. Any custom templates created by your account can be deleted freely.`;
            }

            return res.status(200).json({ error: errorMsg });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).send('Method Not Allowed');
};

