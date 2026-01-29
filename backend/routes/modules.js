const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/modules/lecturer/:id
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

// GET /api/modules/:code/students
// Fetches all students enrolled in a specific class (e.g. CS4012)
router.get('/:code/students', async (req, res) => {
  const moduleCode = req.params.code;
  try {
    const sql = `
      SELECT s.Student_ID, s.First_Name, s.Last_Name 
      FROM students s
      JOIN enrollment e ON s.Student_ID = e.Student_ID
      WHERE e.Module_Code = ?
    `;
    const [rows] = await db.query(sql, [moduleCode]);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;