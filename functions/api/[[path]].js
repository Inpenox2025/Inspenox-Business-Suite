const { handleCloudflareRequest } = require('../../lib/cf-adapter');

const analyticsHandler = require('../../api/analytics');
const authHandler = require('../../api/auth');
const broadcastHandler = require('../../api/broadcast');
const configHandler = require('../../api/config');
const customersImportHandler = require('../../api/customers-import');
const customersHandler = require('../../api/customers');
const mediaHandler = require('../../api/media');
const messagesHandler = require('../../api/messages');
const sendMessageHandler = require('../../api/send-message');
const templatesHandler = require('../../api/templates');
const uploadMediaHandler = require('../../api/upload-media');
const webhookHandler = require('../../api/webhook');

const routes = {
    'analytics': analyticsHandler,
    'auth': authHandler,
    'broadcast': broadcastHandler,
    'config': configHandler,
    'customers-import': customersImportHandler,
    'customers': customersHandler,
    'media': mediaHandler,
    'messages': messagesHandler,
    'send-message': sendMessageHandler,
    'templates': templatesHandler,
    'upload-media': uploadMediaHandler,
    'webhook': webhookHandler
};

async function onRequest(context) {
    const pathArr = context.params.path || [];
    const routeName = pathArr[0];

    const handler = routes[routeName];
    if (!handler) {
        return new Response(JSON.stringify({ error: `API route /api/${routeName || ''} not found` }), {
            status: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    return handleCloudflareRequest(handler, context);
}

module.exports = { onRequest };
