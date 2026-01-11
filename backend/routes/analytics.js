// This file handles analytics-related requests

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/analytics/session/:sessionId
// Returns the list of students with their Calculated Status (Present, Late, Absent)
router.get('/session/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;

  try {
    // 1. Get Session Details (Start Time, End Time)
    const [sessionData] = await db.query(
        'SELECT * FROM sessions WHERE Session_ID = ?', 
        [sessionId]
    );
    
    if (sessionData.length === 0) return res.status(404).json({message: "Session not found"});
    const session = sessionData[0];

    // 2. Complex Query: Get Attendance Stats per Student
    // We join Students with Logs to get the summary
    const query = `
      SELECT 
        s.Student_ID,
        s.First_Name,
        s.Last_Name,
        MIN(l.Time_First_Seen) as arrival_time,
        MAX(l.Time_First_Seen) as last_seen_time,
        COUNT(l.Time_First_Seen) as minutes_present
      FROM students s
      JOIN attendance_logs l ON s.Student_ID = l.Student_ID
      WHERE l.Session_ID = ?
      GROUP BY s.Student_ID
    `;

    const [logs] = await db.query(query, [sessionId]);

    // 3. Process the Logic in JavaScript (Easier than huge SQL)
    const sessionDuration = (new Date(session.End_Time) - new Date(session.Start_Time)) / 60000; // in minutes
    
    const results = logs.map(student => {
      const arrival = new Date(student.arrival_time);
      const start = new Date(session.Start_Time);
      const end = new Date(session.End_Time);
      
      // LOGIC 1: LATE (Arrived > 10 mins after start)
      const minutesLate = (arrival - start) / 60000;
      let status = "Present";
      
      if (minutesLate > 10) {
        status = "Late";
      }

      // LOGIC 2: LEFT EARLY (Last seen > 10 mins before end)
      const minutesBeforeEnd = (end - new Date(student.last_seen_time)) / 60000;
      if (minutesBeforeEnd > 10) {
        status = "Left Early";
      }

      // LOGIC 3: ENGAGEMENT %
      const engagement = Math.round((student.minutes_present / sessionDuration) * 100);

      return {
        id: student.Student_ID,
        name: `${student.First_Name} ${student.Last_Name}`,
        arrival: student.arrival_time,
        status: status,
        engagement: engagement + "%"
      };
    });

    res.json(results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Analytics error' });
  }
});

module.exports = router;