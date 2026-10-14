const { handleCloudflareRequest } = require('../lib/cf-adapter');
const webhookHandler = require('../api/webhook');

async function handleWebhook(request, env) {
    return handleCloudflareRequest(webhookHandler, { request, env });
}

// For Cloudflare Pages Functions
async function onRequest(context) {
    return handleWebhook(context.request, context.env);
}

// For Cloudflare Workers
const workerExport = {
    async fetch(request, env, ctx) {
        return handleWebhook(request, env);
    }
};

export default workerExport;
export { onRequest };
