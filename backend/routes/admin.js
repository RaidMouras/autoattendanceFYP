const express = require('express');
const router = express.Router();
const db = require('../db');

// 1. GET ALL LECTURERS (For the list)
// GET /api/admin/lecturers
router.get('/lecturers', async (req, res) => {
  try {
    // Selects ID and Name for all users who are lecturers
    // Note: Using capitalized 'Role' based on your DB schema
    const [rows] = await db.query('SELECT User_ID, Username FROM users WHERE Role = ?', ['lecturer']);
    
    res.json(rows);
  } catch (err) {
    console.error("Error fetching lecturers:", err);
    res.status(500).json({ message: 'Database error fetching list' });
  }
});

// 2. ADD NEW LECTURER (For the popup form)
// POST /api/admin/add-lecturer
router.post('/add-lecturer', async (req, res) => {
  const { username, password } = req.body;

  // Validation
  if (!username || !password) {
    return res.status(400).json({ message: 'Please provide username and password' });
  }

  try {
    // Check if user already exists
    // Note: Using capitalized 'Username'
    const [existing] = await db.query('SELECT * FROM users WHERE Username = ?', [username]);
    
    if (existing.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Insert new Lecturer
    // Note: Using capitalized 'Username', 'Password_Hash', 'Role'
    const sql = 'INSERT INTO users (Username, Password_Hash, Role) VALUES (?, ?, ?)';
    
    // We hardcode the role as 'lecturer'
    await db.query(sql, [username, password, 'lecturer']);

    console.log(`Admin added new user: ${username}`);
    res.json({ success: true, message: `Lecturer ${username} added successfully.` });

  } catch (err) {
    console.error("Error adding lecturer:", err);
    res.status(500).json({ message: 'Database error adding user' });
  }
});

// 3. DELETE LECTURER
// DELETE /api/admin/delete-lecturer/:id
router.delete('/delete-lecturer/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    // Check if the user exists first
    const [user] = await db.query('SELECT * FROM users WHERE User_ID = ?', [userId]);
    if (user.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete the user
    await db.query('DELETE FROM users WHERE User_ID = ?', [userId]);

    console.log(`🗑️ Deleted User ID: ${userId}`);
    res.json({ success: true, message: 'User deleted successfully' });

  } catch (err) {
    console.error("❌ Error deleting user:", err);
    res.status(500).json({ message: 'Database error deleting user' });
  }
});

module.exports = router;