const { Octokit } = require('@octokit/rest');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { base64Data, fileName, mimeType } = req.body;
        if (!base64Data || !fileName || !mimeType) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(cleanBase64, 'base64');

        // 1. Upload to Meta Media API
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        
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

        // 2. Upload to GitHub for self-hosted copy
        let githubUrl = null;
        if (process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO) {
            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const uploadPath = `uploads/${Date.now()}_${fileName}`;

            await octokit.repos.createOrUpdateFileContents({
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO,
                path: uploadPath,
                message: `Upload media ${fileName}`,
                content: cleanBase64,
                branch: "main" // Defaulting to main branch
            });

            githubUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/${uploadPath}`;
        }

        return res.status(200).json({
            success: true,
            media_id: mediaId,
            github_url: githubUrl
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
