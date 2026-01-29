import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import '../styles/Dashboard.css'; // Keep this for the header/nav styles
import '../styles/Session.css';   // NEW: Import the specific session styles
import logo from '../images/ul-logo-home.png';

function Session() {
  const { moduleCode } = useParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- FETCH STUDENTS ON LOAD ---
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await api.get(`/modules/${moduleCode}/students`);
        setStudents(response.data);
      } catch (err) {
        console.error("Failed to load students", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [moduleCode]);

  // --- BUTTON HANDLERS ---
  const handleEnroll = () => {
    alert("This will open the Enrollment Modal");
  };

  const handleSchedule = () => {
    alert("This will open the Scheduler");
  };

  const handleStartSession = async () => {
    alert(`Signal sent! 'attendance_taker.py' will wake up for ${moduleCode} shortly.`);
  };

  return (
    <>
      <header className="home-header">
        <img src={logo} alt="Logo" className="header-logo" />
        <nav>
            <Link to="/dashboard" className="nav-item">← Back to Dashboard</Link>
        </nav>
      </header>

      {/* Main Content using the new CSS classes */}
      <main className="main-content session-main">
        
        {/* HEADER */}
        <div className="session-header">
            <h1 className="module-title">{moduleCode}</h1>
            <p className="module-subtitle">Classroom Command Center</p>
        </div>

        {/* CONTROLS */}
        <div className="control-panel">
            <button className="cmd-btn blue" onClick={handleEnroll}>
                <span>👤</span> Enroll Student
            </button>
            <button className="cmd-btn orange" onClick={handleSchedule}>
                <span>📅</span> Schedule Session
            </button>
            <button className="cmd-btn green" onClick={handleStartSession}>
                <span>▶</span> Start Session Now
            </button>
        </div>

        {/* STUDENT LIST */}
        <div className="student-list-container">
            <h2 className="list-header">
                Enrolled Students ({students.length})
            </h2>

            {loading ? (
                <p style={{textAlign: 'center'}}>Loading class list...</p>
            ) : students.length === 0 ? (
                <div className="empty-state">
                    <p>No students enrolled yet.</p>
                    <button onClick={handleEnroll} className="add-student-link">
                        Add your first student?
                    </button>
                </div>
            ) : (
                <table className="student-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>First Name</th>
                            <th>Last Name</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((student) => (
                            <tr key={student.Student_ID}>
                                <td>{student.Student_ID}</td>
                                <td>{student.First_Name}</td>
                                <td>{student.Last_Name}</td>
                                <td><span className="status-badge">Registered</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>

      </main>
    </>
  );
}

export default Session;