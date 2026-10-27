const mysql = require('mysql2/promise')
const fs = require('fs')

const connection = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ...(process.env.DB_SSL === 'true' && {
    ssl: {
      ca: fs.readFileSync(process.env.DB_SSL_CA || '/etc/secrets/aiven-ca.pem'),
      rejectUnauthorized: true,
    },
  }),
})

module.exports = connection
