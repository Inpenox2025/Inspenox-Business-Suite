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
                return res.status(401).json({ 
                    error: 'WhatsApp Access Token is not configured for this workspace. Please configure it in Meta Credentials.',
                    code: 190,
                    is_auth_error: true
                });
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
                    const isAuthErr = metaData.error.code === 190 || metaData.error.type === 'OAuthException';
                    return res.status(isAuthErr ? 401 : 404).json({
                        error: isAuthErr 
                            ? 'Meta WhatsApp Access Token has expired or is invalid. Please update the System User Access Token in Workspace / Company Settings.' 
                            : (metaData.error.message || 'Media expired on Meta servers.'),
                        code: metaData.error.code || (isAuthErr ? 190 : 404),
                        is_auth_error: isAuthErr
                    });
                }
            } catch (err) {
                console.error('Error fetching media details from Meta Graph API:', err);
                return res.status(502).json({ error: 'Failed to contact Meta Graph API: ' + err.message });
            }
        }

        if (!downloadUrl) {
            return res.status(404).json({ error: 'Media download URL not found or media has expired.' });
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
            const isAuthErr = binaryRes.status === 401 || binaryRes.status === 403;
            return res.status(isAuthErr ? 401 : 404).json({
                error: isAuthErr 
                    ? 'Meta authorization failed when downloading media. Please refresh the WhatsApp Access Token.' 
                    : `Failed to download media: ${binaryRes.statusText}`,
                is_auth_error: isAuthErr
            });
        }

        const arrayBuf = await binaryRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        // 4. Detect real file type from binary magic bytes (100% reliable)
        const detected = detectFileTypeFromBuffer(buffer);
        const cdnContentType = binaryRes.headers.get('content-type');
        let finalContentType = (detected && detected.mime) 
            || (mimeType && mimeType !== 'application/octet-stream' ? mimeType : null) 
            || (cdnContentType && cdnContentType !== 'application/octet-stream' ? cdnContentType : null) 
            || mimeType 
            || 'application/octet-stream';

        const finalExt = (detected && detected.ext) || getExtFromMime(finalContentType);

        let outFilename = filename ? String(filename).trim() : `whatsapp_media_${cleanMediaId || Date.now()}`;
        if (!outFilename.includes('.')) {
            outFilename += finalExt;
        } else if (outFilename.endsWith('.bin') && finalExt !== '.bin') {
            outFilename = outFilename.replace(/\.bin$/, finalExt);
        }

        // 5. Return binary media with caching and content disposition
        res.setHeader('Content-Type', finalContentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');

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

function detectFileTypeFromBuffer(buffer) {
    if (!buffer || buffer.length < 4) return null;
    
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return { ext: '.jpg', mime: 'image/jpeg' };
    }
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return { ext: '.png', mime: 'image/png' };
    }
    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return { ext: '.gif', mime: 'image/gif' };
    }
    // WebP: RIFF .... WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return { ext: '.webp', mime: 'image/webp' };
    }
    // PDF: %PDF (25 50 44 46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return { ext: '.pdf', mime: 'application/pdf' };
    }
    // Ogg audio (WhatsApp voice notes): OggS (4F 67 67 53)
    if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
        return { ext: '.ogg', mime: 'audio/ogg' };
    }
    // MP4 / QuickTime: ....ftyp
    if (buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return { ext: '.mp4', mime: 'video/mp4' };
    }
    // MP3: ID3
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
        return { ext: '.mp3', mime: 'audio/mpeg' };
    }

    return null;
}

function getExtFromMime(mime) {
    if (!mime) return '.bin';
    const m = mime.toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('png')) return '.png';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    if (m.includes('svg')) return '.svg';
    if (m.includes('mp4') || m.includes('video/mp4')) return '.mp4';
    if (m.includes('quicktime') || m.includes('mov')) return '.mov';
    if (m.includes('webm')) return '.webm';
    if (m.includes('pdf')) return '.pdf';
    if (m.includes('ogg') || m.includes('opus')) return '.ogg';
    if (m.includes('mp3') || m.includes('mpeg')) return '.mp3';
    if (m.includes('wav')) return '.wav';
    if (m.includes('csv')) return '.csv';
    if (m.includes('sheet') || m.includes('excel') || m.includes('xls')) return '.xlsx';
    if (m.includes('word') || m.includes('docx')) return '.docx';
    if (m.includes('text/plain')) return '.txt';
    if (m.includes('zip')) return '.zip';
    return '.bin';
}
