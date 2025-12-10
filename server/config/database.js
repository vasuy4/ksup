const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'ksup_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    port: parseInt(process.env.DB_PORT) || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

async function getPool() {
    return pool;
}

async function closePool() {
    await pool.end();
}

// Test connection
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = {
    pool,
    getPool,
    closePool
};
