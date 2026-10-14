/**
 * WhatsApp Meta Cloud API Utilities
 */

async function subscribeWabaToApp(wabaId, accessToken) {
    if (!wabaId || !accessToken) return null;
    try {
        const fetchFn = typeof fetch !== 'undefined' ? fetch : globalThis.fetch;
        const res = await fetchFn(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        const data = await res.json();
        console.log(`Subscribed WABA ${wabaId} to App:`, res.status, data);
        return data;
    } catch (e) {
        console.warn(`Failed to subscribe WABA ${wabaId} to App:`, e.message);
        return null;
    }
}

module.exports = {
    subscribeWabaToApp
};
