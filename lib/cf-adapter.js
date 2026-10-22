/**
 * Adapter to bridge Cloudflare Pages Functions & Workers (Web Fetch API Request/Response)
 * with Node.js style (req, res) API route handlers.
 */
async function handleCloudflareRequest(handler, context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // Hydrate process.env with Cloudflare environment bindings
    if (env && typeof env === 'object') {
        if (typeof process !== 'undefined' && process.env) {
            Object.assign(process.env, env);
        }
    }

    // Handle OPTIONS preflight requests automatically
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    }

    // Extract search query parameters into req.query
    const query = {};
    for (const [key, value] of url.searchParams.entries()) {
        query[key] = value;
    }

    // Parse request body
    let body = {};
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        const contentType = request.headers.get('content-type') || '';
        try {
            if (contentType.includes('application/json')) {
                body = await request.json();
            } else if (contentType.includes('application/x-www-form-urlencoded')) {
                const text = await request.text();
                body = Object.fromEntries(new URLSearchParams(text).entries());
            } else if (contentType.includes('text/')) {
                body = await request.text();
            } else if (contentType.includes('multipart/form-data')) {
                try {
                    const formData = await request.formData();
                    body = {};
                    for (const [key, value] of formData.entries()) {
                        body[key] = value;
                    }
                } catch (e) {
                    body = {};
                }
            } else {
                try {
                    body = await request.json();
                } catch (e) {
                    body = {};
                }
            }
        } catch (e) {
            body = {};
        }
    }

    let statusCode = 200;
    const responseHeaders = new Headers({
        'Access-Control-Allow-Origin': '*'
    });

    let responseSent = false;
    let resolveResponse;
    const responsePromise = new Promise((resolve) => {
        resolveResponse = resolve;
    });

    const res = {
        status(code) {
            statusCode = code;
            return res;
        },
        setHeader(name, value) {
            responseHeaders.set(name, value);
            return res;
        },
        getHeader(name) {
            return responseHeaders.get(name);
        },
        json(data) {
            if (responseSent) return res;
            responseSent = true;
            if (!responseHeaders.has('content-type')) {
                responseHeaders.set('content-type', 'application/json; charset=utf-8');
            }
            resolveResponse(new Response(JSON.stringify(data), {
                status: statusCode,
                headers: responseHeaders
            }));
            return res;
        },
        redirect(url, status = 302) {
            if (responseSent) return res;
            responseSent = true;
            responseHeaders.set('Location', url);
            resolveResponse(new Response(null, {
                status: status,
                headers: responseHeaders
            }));
            return res;
        },
        send(data) {
            if (responseSent) return res;
            responseSent = true;
            let bodyContent;
            const isBinary = data instanceof ArrayBuffer || 
                             (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data)) || 
                             (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) ||
                             (typeof ReadableStream !== 'undefined' && data instanceof ReadableStream);
            if (isBinary) {
                bodyContent = data;
            } else if (typeof data === 'object' && data !== null) {
                bodyContent = JSON.stringify(data);
                if (!responseHeaders.has('content-type')) {
                    responseHeaders.set('content-type', 'application/json; charset=utf-8');
                }
            } else {
                bodyContent = String(data);
            }
            resolveResponse(new Response(bodyContent, {
                status: statusCode,
                headers: responseHeaders
            }));
            return res;
        },
        end(data) {
            return this.send(data || '');
        }
    };

    const req = {
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        query,
        body,
        env,
        rawRequest: request
    };

    try {
        const fn = typeof handler === 'function' ? handler : (handler.default || handler);
        const handlerPromise = fn(req, res, env);
        await Promise.race([handlerPromise, responsePromise]);
        if (!responseSent) {
            responseSent = true;
            resolveResponse(new Response('', { status: statusCode, headers: responseHeaders }));
        }
    } catch (err) {
        if (!responseSent) {
            responseSent = true;
            resolveResponse(new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
            }));
        }
    }

    return responsePromise;
}

module.exports = { handleCloudflareRequest };
module.exports.default = handleCloudflareRequest;
