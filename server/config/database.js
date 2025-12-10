const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'KSUP_DB',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'YOUR_PASSWORD',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    port: parseInt(process.env.DB_PORT) || 1433,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool = null;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
    }
    return pool;
}

async function closePool() {
    if (pool) {
        await pool.close();
        pool = null;
    }
}

module.exports = {
    sql,
    config,
    getPool,
    closePool
};
