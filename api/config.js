module.exports = async (req, res) => {
    // Only allow GET requests
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

    const env = req.env || process.env || {};

    res.status(200).json({
        meta_phone_id: env.WHATSAPP_PHONE_NUMBER_ID || '1196613988211733',
        meta_token: env.WHATSAPP_ACCESS_TOKEN
    });
};

