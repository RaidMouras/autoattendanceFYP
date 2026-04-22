const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/login', async (req, res) => {
    console.log("Login Request Received!");

    const { email, password } = req.body;

    try {
        const [rows] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.Password_Hash);

        if (!match) {
            console.log(`Password mismatch for ${user.Email}`);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { user_id: user.User_ID, role: user.Role.toLowerCase() },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        console.log(`Login Success: ${user.Name}`);
        res.json({
            success: true,
            token,
            user_id: user.User_ID,
            name: user.Name,
            email: user.Email,
            role: user.Role.toLowerCase()
        });

    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.patch('/profile/name', verifyToken, async (req, res) => {
    const userId = req.user.user_id;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'Valid name required' });
    }

    try {
        await db.query('UPDATE users SET Name = ? WHERE User_ID = ?', [name.trim(), userId]);
        res.json({ success: true, name: name.trim() });
    } catch (err) {
        console.error("Error updating name:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.patch('/profile/password', verifyToken, async (req, res) => {
    const userId = req.user.user_id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
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

        const storedHash = rows[0].Password_Hash || rows[0].password_hash;
        const match = await bcrypt.compare(currentPassword, storedHash);

        if (!match) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET Password_Hash = ? WHERE User_ID = ?', [newHash, userId]);
        res.json({ success: true, message: 'Password updated successfully' });

    } catch (err) {
        console.error("Error changing password:", err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
