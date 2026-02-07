const express = require('express');
const router = express.Router();
const db = require('../db');

// --- LOGIN ROUTE ---
router.post('/login', async (req, res) => {
    console.log("Login Request Received!");

    const { email, password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'User not found' });
        }

        const user = rows[0];
        const dbPassword = user.Password_Hash;

        // Plain Text Comparison
        if (password === dbPassword) {
            console.log(`Login Success: ${user.Name}`);
            res.json({
                success: true,
                user_id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role.toLowerCase()
            });
        } else {
            console.log(`Password Mismatch for ${user.Email}`);
            res.status(401).json({ message: 'Invalid credentials' });
        }

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- UPDATE NAME ---
router.patch('/profile/name', async (req, res) => {
    const { userId, name } = req.body;

    if (!userId || !name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'Valid userId and name required' });
    }

    try {
        await db.query('UPDATE users SET Name = ? WHERE User_ID = ?', [name.trim(), userId]);
        res.json({ success: true, name: name.trim() });
    } catch (err) {
        console.error("Error updating name:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- CHANGE PASSWORD ---
router.patch('/profile/password', async (req, res) => {
    const { userId, currentPassword, newPassword, confirmPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'New passwords do not match' });
    }

    if (newPassword.length < 4) {
        return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }

    try {
        const [rows] = await db.query('SELECT Password_Hash FROM users WHERE User_ID = ?', [userId]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // MySQL can return columns as Password_Hash or password_hash depending on config
        const row = rows[0];
        const storedPassword = row.Password_Hash || row.password_hash;
        if (!storedPassword || storedPassword !== currentPassword) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        await db.query('UPDATE users SET Password_Hash = ? WHERE User_ID = ?', [newPassword, userId]);
        res.json({ success: true, message: 'Password updated successfully' });

    } catch (err) {
        console.error("Error changing password:", err);
        res.status(500).json({ message: err.message || 'Server error' });
    }
});

module.exports = router;