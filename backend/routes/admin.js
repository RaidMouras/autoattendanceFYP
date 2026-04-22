const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');

router.get('/lecturers', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT User_ID, Name, Email FROM users WHERE Role = ?', ['lecturer']);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching lecturers:", err);
    res.status(500).json({ message: 'Database error fetching list' });
  }
});

router.post('/add-lecturer', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Please provide Name, Email, and Password' });
  }

  try {
    const [existing] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);

    if (existing.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (Name, Email, Password_Hash, Role) VALUES (?, ?, ?, ?)';
    await db.query(sql, [name, email, hashedPassword, 'lecturer']);

    console.log(`Admin added new user: ${name} (${email})`);
    res.json({ success: true, message: `Lecturer ${name} added successfully.` });

  } catch (err) {
    console.error("Error adding lecturer:", err);
    res.status(500).json({ message: 'Database error adding user' });
  }
});

router.delete('/delete-lecturer/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    await db.query('DELETE FROM users WHERE User_ID = ?', [userId]);
    console.log(`Deleted User ID: ${userId}`);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: 'Database error deleting user' });
  }
});

router.get('/modules/:userId', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM modules WHERE User_ID = ?', [req.params.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching modules' });
  }
});

router.post('/add-module', async (req, res) => {
  const { userId, code, name, semester } = req.body;

  if (!userId || !code || !name || !semester) {
    return res.status(400).json({ message: 'Missing module details' });
  }

  try {
    const sql = 'INSERT INTO modules (Module_Code, Module_Name, Semester, User_ID) VALUES (?, ?, ?, ?)';
    await db.query(sql, [code, name, semester, userId]);

    console.log(`✅ Added Module: ${code} (${semester})`);
    res.json({ success: true, message: 'Module added' });
  } catch (err) {
    console.error("❌ SQL ERROR:", err.message);
    if(err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ message: 'Module Code already exists!' });
    }
    res.status(500).json({ message: 'Error adding module' });
  }
});

router.delete('/delete-module/:moduleCode', async (req, res) => {
  try {
    await db.query('DELETE FROM modules WHERE Module_Code = ?', [req.params.moduleCode]);
    res.json({ success: true, message: 'Module removed' });
  } catch (err) {
    console.error("❌ SQL ERROR:", err);
    res.status(500).json({ message: 'Error deleting module' });
  }
});

module.exports = router;
