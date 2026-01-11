// backend/db.js
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Slow_bo@t2004', 
  database: 'attendance_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Using .promise() allows us to use async/await in our routes
module.exports = pool.promise();