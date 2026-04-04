const mysql = require('mysql2');

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',      
  password: process.env.DB_PASSWORD || '',     
  database: process.env.DB_NAME || 'cafe-1'
});

db.connect((err) => {
  if (err) {
    console.error('Koneksi MySQL GAGAL:', err);
  } else {
    console.log('MySQL Connected...');
  }
});

module.exports = db;