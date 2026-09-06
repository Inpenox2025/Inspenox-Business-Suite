const { neon } = require('@neondatabase/serverless');

function getDb() {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is not configured');
    }
    return neon(process.env.DATABASE_URL);
}

module.exports = { getDb };

