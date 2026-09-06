const { neon } = require('@neondatabase/serverless');

function getDb(env) {
    const dbUrl = (env && env.DATABASE_URL) || (typeof process !== 'undefined' && process.env && process.env.DATABASE_URL);
    if (!dbUrl) {
        throw new Error('DATABASE_URL is not configured. Please add DATABASE_URL to Cloudflare secrets or wrangler.toml [vars].');
    }
    return neon(dbUrl);
}

module.exports = { getDb };


