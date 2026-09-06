const { neon } = require('@neondatabase/serverless');

function getDb(env) {
    const dbUrl = (env && env.DATABASE_URL) || (typeof process !== 'undefined' && process.env && process.env.DATABASE_URL);
    if (!dbUrl) {
        throw new Error('DATABASE_URL is not configured');
    }
    return neon(dbUrl);
}

module.exports = { getDb };


