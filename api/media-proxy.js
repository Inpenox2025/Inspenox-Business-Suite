const { getDb } = require('../lib/db');

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const env = req.env || process.env || {};
        const { media_id, company_id, url: directUrl, filename, mime: hintMime, download } = req.query || {};

        if (!media_id && !directUrl) {
            return res.status(400).json({ error: 'media_id or url parameter is required' });
        }

        // Handle direct external URLs (not Facebook/Meta CDNs)
        if (directUrl && !directUrl.includes('fbsbx.com') && !directUrl.includes('facebook.com')) {
            if (directUrl.startsWith('http://') || directUrl.startsWith('https://')) {
                if (typeof res.redirect === 'function') {
                    return res.redirect(directUrl);
                }
                res.setHeader('Location', directUrl);
                return res.status(302).send('');
            }
        }

        let sql = null;
        try {
            sql = getDb(env);
        } catch(e) {}

        // 1. Resolve WhatsApp Access Token
        let token = null;
        if (company_id && sql) {
            try {
                const parsedCoId = parseInt(company_id, 10);
                if (!isNaN(parsedCoId)) {
                    const cos = await sql`SELECT whatsapp_access_token FROM companies WHERE id = ${parsedCoId} LIMIT 1`;
                    if (cos.length > 0 && cos[0].whatsapp_access_token) {
                        token = cos[0].whatsapp_access_token.trim();
                    }
                }
            } catch (e) {
                console.error('DB error fetching company token in media-proxy:', e);
            }
        }

        if (!token) {
            token = (env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
        }

        if (!token && sql) {
            try {
                const fallbackCos = await sql`SELECT whatsapp_access_token FROM companies WHERE whatsapp_access_token IS NOT NULL AND LENGTH(whatsapp_access_token) > 20 ORDER BY id ASC LIMIT 1`;
                if (fallbackCos.length > 0 && fallbackCos[0].whatsapp_access_token) {
                    token = fallbackCos[0].whatsapp_access_token.trim();
                }
            } catch (e) {}
        }

        let downloadUrl = directUrl;
        let mimeType = hintMime || 'application/octet-stream';
        let cleanMediaId = media_id ? String(media_id).trim() : null;

        // 2. Query Meta Graph API for media information if media_id is provided
        if (cleanMediaId) {
            if (!token) {
                return sendMediaError(res, hintMime, 'WhatsApp Access Token is not configured');
            }

            try {
                const metaRes = await fetch(`https://graph.facebook.com/v19.0/${cleanMediaId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const metaData = await metaRes.json();

                if (metaData && metaData.url) {
                    downloadUrl = metaData.url;
                    if (metaData.mime_type) mimeType = metaData.mime_type;
                } else if (metaData && metaData.error) {
                    console.error('Meta Graph API media query error:', metaData.error);
                    return sendMediaError(res, hintMime, metaData.error.message || 'Media expired or inaccessible');
                }
            } catch (err) {
                console.error('Error fetching media details from Meta Graph API:', err);
                return sendMediaError(res, hintMime, err.message);
            }
        }

        if (!downloadUrl) {
            return sendMediaError(res, hintMime, 'Media download URL not found');
        }

        // 3. Fetch media binary from Meta CDN URL
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        if (token && (downloadUrl.includes('fbsbx.com') || downloadUrl.includes('facebook.com') || downloadUrl.includes('graph.facebook.com'))) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const binaryRes = await fetch(downloadUrl, { headers });
        if (!binaryRes.ok) {
            console.error('Failed to download media binary from CDN:', binaryRes.status, binaryRes.statusText);
            return sendMediaError(res, mimeType, `Failed to download media: ${binaryRes.statusText}`);
        }

        const finalContentType = binaryRes.headers.get('content-type') || mimeType;
        const arrayBuf = await binaryRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        // 4. Return binary media with caching and content disposition
        res.setHeader('Content-Type', finalContentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const outFilename = filename || `whatsapp_media_${cleanMediaId || 'file'}`;
        if (download === '1' || download === 'true') {
            res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
        } else {
            res.setHeader('Content-Disposition', `inline; filename="${outFilename}"`);
        }

        return res.status(200).send(buffer);

    } catch (err) {
        console.error('Unhandled error in media-proxy:', err);
        return res.status(500).json({ error: err.message });
    }
};

function sendMediaError(res, mime, message) {
    if (mime && (mime.startsWith('image/') || mime.includes('image') || mime.includes('png') || mime.includes('jpg') || mime.includes('jpeg'))) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180" fill="none">
            <rect width="100%" height="100%" fill="#f1f5f9" rx="10"/>
            <circle cx="150" cy="75" r="28" fill="#e2e8f0"/>
            <path d="M141 75a9 9 0 1018 0 9 9 0 00-18 0zm14-18h-10l-3 4h-5c-1.65 0-3 1.35-3 3v18c0 1.65 1.35 3 3 3h26c1.65 0 3-1.35 3-3V64c0-1.65-1.35-3-3-3h-5l-3-4z" fill="#94a3b8"/>
            <text x="150" y="125" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="12" font-weight="600" fill="#64748b" text-anchor="middle">Media Unavailable</text>
            <text x="150" y="142" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Expired on Meta servers</text>
        </svg>`;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(200).send(svg);
    }
    return res.status(404).json({ error: message || 'Media unavailable' });
}
