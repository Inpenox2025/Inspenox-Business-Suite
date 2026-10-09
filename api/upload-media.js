module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const env = req.env || process.env || {};
        const { base64Data, fileName, mimeType } = req.body;
        if (!base64Data || !fileName || !mimeType) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(cleanBase64, 'base64');

        // Upload to Meta Media API
        const phoneId = env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
        const token = env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

        let handle = null;
        let mediaId = null;

        if (token) {
            // Step A: Attempt Resumable Upload Session API to get handle 'h' for template headers
            try {
                const sessionUrl = `https://graph.facebook.com/v19.0/app/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${token}`;
                const sessionRes = await fetch(sessionUrl, { method: 'POST' });
                const sessionData = await sessionRes.json();

                if (sessionData && sessionData.id) {
                    const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${sessionData.id}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `OAuth ${token}`,
                            'file_offset': '0',
                            'Content-Type': mimeType
                        },
                        body: buffer
                    });
                    const uploadData = await uploadRes.json();
                    if (uploadData && uploadData.h) {
                        handle = uploadData.h;
                    }
                }
            } catch (err) {
                console.error("Server-side Meta Resumable Upload Session error:", err);
            }

            // Step B: Standard WhatsApp Media API upload (/{phone_id}/media)
            if (phoneId) {
                try {
                    const formData = new FormData();
                    formData.append('messaging_product', 'whatsapp');
                    formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

                    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/media`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });
                    const metaData = await metaRes.json();
                    if (metaData && metaData.id) {
                        mediaId = metaData.id;
                        if (!handle) handle = metaData.id;
                    }
                } catch (err) {
                    console.error("Meta media upload error:", err);
                }
            }
        }

        return res.status(200).json({
            success: true,
            handle: handle,
            media_id: mediaId
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};

