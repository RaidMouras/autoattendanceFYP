// backend/routes/studentList.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// 1. GET ALL STUDENTS IN A MODULE
router.get('/:moduleCode', async (req, res) => {
  const { moduleCode } = req.params;
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
    console.error("Error fetching class list:", err);
    res.status(500).json({ message: 'Server error fetching students' });
  }
});

// 2. REMOVE STUDENT FROM A MODULE
// Scoped to a single module: drops the enrollment and this module's attendance logs only.
// Face encodings and the student record stay (they may be enrolled in other modules).
router.delete('/:moduleCode/:studentId', async (req, res) => {
    const { moduleCode, studentId } = req.params;

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [enrollResult] = await connection.query(
            'DELETE FROM enrollment WHERE Student_ID = ? AND Module_Code = ?',
            [studentId, moduleCode]
        );

        await connection.query(
            `DELETE FROM attendance_logs
             WHERE Student_ID = ?
               AND Session_ID IN (SELECT Session_ID FROM sessions WHERE Module_Code = ?)`,
            [studentId, moduleCode]
        );

        await connection.commit();

        if (enrollResult.affectedRows === 0) {
            return res.json({ success: true, message: 'Student was not enrolled in this module' });
        }
        res.json({ success: true, message: 'Student removed from module' });

    } catch (err) {
        await connection.rollback();
        console.error("Error removing student from module:", err);
        res.status(500).json({ message: 'Server error removing student from module' });
    } finally {
        connection.release();
    }
});

module.exports = router;