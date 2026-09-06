module.exports = async (req, res) => {
    // Only allow GET requests
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    // Return the configuration for client-side direct uploads
    // Note: Since this is an internal tool, returning tokens here allows the browser
    // to bypass Vercel's 4.5MB limit and upload directly to Meta/GitHub.
    res.status(200).json({
        meta_phone_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '1196613988211733',
        meta_token: process.env.WHATSAPP_ACCESS_TOKEN,
        github_token: process.env.GITHUB_TOKEN,
        github_owner: process.env.GITHUB_OWNER,
        github_repo: process.env.GITHUB_REPO
    });
};
