const express = require('express');
const router = express.Router();
const db = require('../db');

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

router.get('/:moduleCode/available', async (req, res) => {
  const { moduleCode } = req.params;
  try {
    const sql = `
      SELECT DISTINCT s.Student_ID, s.First_Name, s.Last_Name
      FROM students s
      JOIN Face_Encodings f ON s.Student_ID = f.student_id
      WHERE s.Student_ID NOT IN (
        SELECT Student_ID FROM enrollment WHERE Module_Code = ?
      )
      ORDER BY s.Student_ID
    `;
    const [rows] = await db.query(sql, [moduleCode]);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching available students:", err);
    res.status(500).json({ message: 'Server error fetching available students' });
  }
});

router.post('/:moduleCode/add-existing', async (req, res) => {
  const { moduleCode } = req.params;
  const { studentId } = req.body;

  if (!studentId) {
    return res.status(400).json({ message: 'Missing studentId' });
  }

  try {
    const [studentRows] = await db.query(
      'SELECT Student_ID FROM students WHERE Student_ID = ?',
      [studentId]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const [existing] = await db.query(
      'SELECT 1 FROM enrollment WHERE Student_ID = ? AND Module_Code = ?',
      [studentId, moduleCode]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Student already enrolled in this module' });
    }

    await db.query(
      'INSERT INTO enrollment (Student_ID, Module_Code) VALUES (?, ?)',
      [studentId, moduleCode]
    );
    res.json({ success: true, message: 'Student added to module' });
  } catch (err) {
    console.error("Error adding existing student to module:", err);
    res.status(500).json({ message: 'Server error adding student to module' });
  }
});

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
