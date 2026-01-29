const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/login', async (req, res) => {    //receiving the request from http://......./login
  console.log("Login Request Received!");
  
  const { email, password } = req.body;        //unpacking the request. request body contains email and password

  try {
    // 1. Search DB
    const [rows] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);  //asking db if we have a user with that email
    
    if (rows.length === 0) {
      console.log("User not found.");
      return res.status(401).json({ message: 'User not found' });
    }

    const user = rows[0];

    // 2. USE CAPITALIZED KEYS (Matches your DB output)
    const dbPassword = user.Password_Hash; // Capital P, Capital H
    const dbRole = user.Role;             // Capital R
    const dbUser = user.Username;         // Capital U
    const dbId = user.User_ID;            // Capital U, Capital I, Capital D

    // 3. Compare Passwords (Plain Text)
    if (password === dbPassword) {
      console.log(`Login Success: ${dbUser}`);
      
      // We send the data back in the format the Frontend expects (lowercase)
      res.json({
        success: true,
        user_id: user.User_ID,
        name: user.Name,      // Send Name for display ("Welcome John")
        email: user.Email,    // Send Email for reference
        role: user.Role.toLowerCase()// Convert 'Admin' -> 'admin' for frontend logic
      });
    } else {
      console.log(`Password Mismatch for ${dbUser}`);
      res.status(401).json({ message: 'Invalid credentials' });
    }

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;