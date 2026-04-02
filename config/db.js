const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',      
  password: '',     
  database: 'cafe-1'
});

db.connect((err) => {
  if (err) {
    console.error('Koneksi MySQL GAGAL:', err);
  } else {
    console.log('MySQL Connected...');
  }
});

module.exports = db;