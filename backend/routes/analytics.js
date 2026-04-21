// This file handles analytics-related requests

const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/analytics/session/:sessionId
// Returns the list of students with their Calculated Status (Present, Late, Absent, Left Early)
router.get('/session/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;

  // Set this to 2 minutes (or 10/60 if you are still using the 10-second test interval)
  const LOG_INTERVAL_MINUTES = 0.5; // 30 seconds

  try {
    // 1. Get Session Details (Start Time, End Time, Duration)
    // Use SQL to build the full start datetime (Session_Date is DATE, Start_Time is TIME)
    const [sessionData] = await db.query(
        `SELECT *,
          CONCAT(DATE_FORMAT(Session_Date, '%Y-%m-%d'), ' ', Start_Time) as full_start_datetime,
          TIMESTAMPDIFF(SECOND, CONCAT(Session_Date, ' ', Start_Time), COALESCE(End_Time, NOW())) as duration_seconds
         FROM sessions WHERE Session_ID = ?`,
        [sessionId]
    );

    if (sessionData.length === 0) return res.status(404).json({message: "Session not found"});
    const session = sessionData[0];

    const sessionStartTime = new Date(session.full_start_datetime);
    const sessionEndTime = session.End_Time ? new Date(session.End_Time) : new Date();
    const sessionDuration = Math.max(1, session.duration_seconds / 60);

    // 2. Complex Query: Get Attendance Stats per Student
    const query = `
      SELECT
        s.Student_ID,
        s.First_Name,
        s.Last_Name,
        MIN(l.Time_Seen) as arrival_time,
        MAX(l.Time_Seen) as last_seen_time,
        COUNT(l.Log_ID) as total_logs
      FROM students s
      JOIN attendance_logs l ON s.Student_ID = l.Student_ID
      WHERE l.Session_ID = ?
      GROUP BY s.Student_ID
    `;

    const [logs] = await db.query(query, [sessionId]);

    // 3. Calculate how many logs a student SHOULD have for 100% attendance
    const maxExpectedLogs = Math.max(1, Math.floor(sessionDuration / LOG_INTERVAL_MINUTES));
    
    const results = logs.map(student => {
      const arrival = new Date(student.arrival_time);
      const lastSeen = new Date(student.last_seen_time);

      const minutesLate = (arrival - sessionStartTime) / 60000;
      const minutesBeforeEnd = (sessionEndTime - lastSeen) / 60000;
      const isLate = minutesLate > 10;
      const isLeftEarly = minutesBeforeEnd > 10;

      // All applicable flags — used in the student row
      const statuses = [];
      if (isLate) statuses.push("Late");
      if (isLeftEarly) statuses.push("Left Early");
      if (statuses.length === 0) statuses.push("Present");

      // Single status for pie-chart bucketing — Left Early overrides Late
      let status = "Present";
      if (isLate) status = "Late";
      if (isLeftEarly) status = "Left Early";

      const rawEngagement = Math.round((student.total_logs / maxExpectedLogs) * 100);
      const engagement = Math.min(100, rawEngagement);

      // If engagement is too low to be meaningful, treat as absent regardless of timing
      if (engagement < 20) {
        status = "Absent";
        statuses.length = 0;
        statuses.push("Absent");
      }

      return {
        id: student.Student_ID,
        name: `${student.First_Name} ${student.Last_Name}`,
        arrival: arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status,
        statuses,
        engagement: engagement + "%"
      };
    });

    res.json(results);

  } catch (err) {
    console.error("[ANALYTICS ERROR]", err);
    res.status(500).json({ message: 'Analytics error', details: err.message });
  }
});

// GET /api/analytics/sessions-by-date/:moduleCode/:date
// Returns all session IDs for a module on a specific date
router.get('/sessions-by-date/:moduleCode/:date', async (req, res) => {
  const { moduleCode, date } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT Session_ID FROM sessions WHERE Module_Code = ? AND DATE(Session_Date) = ?',
      [moduleCode, date]
    );
    res.json(rows.map(r => r.Session_ID));
  } catch (err) {
    console.error("[SESSIONS BY DATE ERROR]", err);
    res.status(500).json({ message: 'Error fetching sessions for date' });
  }
});

// GET /api/analytics/session-dates/:moduleCode
// Returns all dates that have at least one session for the given module
router.get('/session-dates/:moduleCode', async (req, res) => {
  const { moduleCode } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT DATE_FORMAT(Session_Date, '%Y-%m-%d') as date
       FROM sessions WHERE Module_Code = ? ORDER BY date`,
      [moduleCode]
    );
    res.json(rows.map(r => r.date));
  } catch (err) {
    console.error("[SESSION DATES ERROR]", err);
    res.status(500).json({ message: 'Error fetching session dates' });
  }
});

// GET /api/analytics/module/:moduleCode
// Returns semester-wide engagement stats for all enrolled students in a module
router.get('/module/:moduleCode', async (req, res) => {
  const { moduleCode } = req.params;
  const { startDate, endDate } = req.query;
  const LOG_INTERVAL_SECONDS = 30; // 30-second logging interval, matches session analytics

  try {
    // 1. Get all sessions for this module with duration calculated in SQL
    const sessionsQuery = (startDate && endDate)
      ? `SELECT Session_ID,
          TIMESTAMPDIFF(SECOND, CONCAT(Session_Date, ' ', Start_Time), COALESCE(End_Time, NOW())) as duration_seconds
         FROM sessions WHERE Module_Code = ? AND Session_Date BETWEEN ? AND ?`
      : `SELECT Session_ID,
          TIMESTAMPDIFF(SECOND, CONCAT(Session_Date, ' ', Start_Time), COALESCE(End_Time, NOW())) as duration_seconds
         FROM sessions WHERE Module_Code = ?`;

    const [sessions] = await db.query(sessionsQuery, (startDate && endDate) ? [moduleCode, startDate, endDate] : [moduleCode]);

    if (sessions.length === 0) {
      return res.json({ totalSessions: 0, students: [] });
    }

    // 2. Calculate total expected logs across all sessions
    let totalExpectedLogs = 0;
    sessions.forEach(session => {
      const durationSeconds = Math.max(1, session.duration_seconds || 1);
      totalExpectedLogs += Math.max(1, Math.floor(durationSeconds / LOG_INTERVAL_SECONDS));
    });

    // 3. Get per-student log counts across all sessions of this module
    const sessionIds = sessions.map(s => s.Session_ID);
    const placeholders = sessionIds.map(() => '?').join(',');

    const [logStats] = await db.query(
      `SELECT
        s.Student_ID,
        s.First_Name,
        s.Last_Name,
        COUNT(l.Log_ID) as total_logs
       FROM students s
       JOIN enrollment e ON s.Student_ID = e.Student_ID
       LEFT JOIN attendance_logs l ON s.Student_ID = l.Student_ID AND l.Session_ID IN (${placeholders})
       WHERE e.Module_Code = ?
       GROUP BY s.Student_ID, s.First_Name, s.Last_Name`,
      [...sessionIds, moduleCode]
    );

    // 4. Build the response
    const students = logStats.map(student => {
      const totalLogs = student.total_logs || 0;
      const rawEngagement = Math.round((totalLogs / totalExpectedLogs) * 100);
      const engagement = Math.min(100, rawEngagement);

      let status;
      if (engagement >= 75) status = 'Good Standing (>75%)';
      else if (engagement >= 40) status = 'Warning (40-75%)';
      else status = 'Failing (<40%)';

      return {
        id: student.Student_ID,
        name: `${student.First_Name} ${student.Last_Name}`,
        status,
        engagement: engagement + '%',
        totalLogs,
        expectedLogs: totalExpectedLogs
      };
    });

    res.json({ totalSessions: sessions.length, students });

  } catch (err) {
    console.error("[ANALYTICS MODULE ERROR]", err);
    res.status(500).json({ message: 'Analytics error', details: err.message });
  }
});

module.exports = router;