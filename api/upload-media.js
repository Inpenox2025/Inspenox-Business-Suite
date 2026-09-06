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
        const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
        const token = env.WHATSAPP_ACCESS_TOKEN;

        let mediaId = null;
        if (phoneId && token) {
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
            if (metaData.error) {
                console.error("Meta upload error:", metaData.error);
                return res.status(500).json({ error: metaData.error.message });
            }
            mediaId = metaData.id;
        }

        return res.status(200).json({
            success: true,
            media_id: mediaId
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};

