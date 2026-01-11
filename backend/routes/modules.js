// this file handles module-related requests

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/modules/lecturer/:id
router.get('/lecturer/:id', async (req, res) => {
  const lecturerId = req.params.id;

  try {
    const [rows] = await db.query(
      'SELECT module_code, module_name, semester FROM modules WHERE lecturer_id = ?', 
      [lecturerId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Database error' });
  }
});

module.exports = router;