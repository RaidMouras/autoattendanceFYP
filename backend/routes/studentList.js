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

// 2. DELETE STUDENT (FULL WIPE)
// Removes Student from: Enrollment, Attendance Logs, Face Encodings, and Students table.
router.delete('/:moduleCode/:studentId', async (req, res) => {
    const { moduleCode, studentId } = req.params;
    
    // We need a specific connection to run a Transaction (multiple steps as one unit)
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        console.log(`[DELETE] Starting full wipe for Student ${studentId}...`);

        // STEP A: Delete from Enrollment (The link to classes)
        await connection.query('DELETE FROM enrollment WHERE Student_ID = ?', [studentId]);

        // STEP B: Delete Attendance History (Clean up old logs)
        await connection.query('DELETE FROM attendance_logs WHERE Student_ID = ?', [studentId]);

        // STEP C: Delete Face Encodings (Biometric Data)
        await connection.query('DELETE FROM Face_Encodings WHERE student_id = ?', [studentId]);

        // STEP D: Delete the Main Student Record
        const [result] = await connection.query('DELETE FROM students WHERE Student_ID = ?', [studentId]);

        if (result.affectedRows === 0) {
            // If we didn't find the student in the main table, maybe they were already gone?
            // We still commit because we cleaned up the other tables.
            console.log(`[DELETE] Student ${studentId} was already removed from main table.`);
        }

        await connection.commit();
        console.log(`[SUCCESS] Student ${studentId} and all associated data deleted.`);
        
        res.json({ success: true, message: 'Student and face data permanently deleted' });

    } catch (err) {
        // If any step fails, undo everything (Rollback)
        await connection.rollback();
        console.error("Error removing student:", err);
        res.status(500).json({ message: 'Server error removing student' });
    } finally {
        connection.release(); // Always release the connection back to the pool
    }
});

module.exports = router;