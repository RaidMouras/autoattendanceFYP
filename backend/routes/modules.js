const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/modules/lecturer/:id
// Fetches the list of modules a lecturer teaches (e.g. CS2323, CS4001)
router.get('/lecturer/:id', async (req, res) => {
  const lecturerId = req.params.id;

  try {
    const [rows] = await db.query(
      'SELECT Module_ID, Module_Code, Module_Name, Semester FROM modules WHERE User_ID = ?', 
      [lecturerId]
    );
    res.json(rows);
  } catch (err) {
    console.error("SQL ERROR (Lecturer Modules):", err);
    res.status(500).json({ message: 'Database error' });
  }
});

module.exports = router;