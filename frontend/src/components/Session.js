import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import '../styles/Dashboard.css'; // Shared header styles
import '../styles/Session.css';   // Specific session styles
import logo from '../images/ul-logo-home.png';
import icon from '../images/icon.png';

function Session() {
    const { moduleCode } = useParams();
    const navigate = useNavigate();
    const popupRef = useRef(null);
    const iconRef = useRef(null);

    // --- STATE MANAGEMENT ---
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('User');
    const [userId, setUserId] = useState(null);

    // Profile popup state
    const [profileOpen, setProfileOpen] = useState(false);
    const [editNameOpen, setEditNameOpen] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileError, setProfileError] = useState('');
    const [errorField, setErrorField] = useState('');

    // Enrollment Modal State
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [newStudent, setNewStudent] = useState({ id: '', first: '', last: '' });
    const [isScanning, setIsScanning] = useState(false); // Tracks if Python camera is active

    // --- 1. FETCH USER ON LOAD ---
    useEffect(() => {
        const userString = localStorage.getItem('user');
        if (userString) {
            const user = JSON.parse(userString);
            setUserName(user.name);
            setUserId(user.user_id);
        }
    }, []);

    // --- 2. FETCH STUDENTS (Refactored to new Route) ---
    const fetchStudents = async () => {
        try {
            // UPDATED: Now points to the dedicated 'studentList.js' route
            const response = await api.get(`/class-list/${moduleCode}`);
            setStudents(response.data);
        } catch (err) {
            console.error("Failed to load students", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, [moduleCode]);

    // Click outside to close profile popup
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (profileOpen && popupRef.current && !popupRef.current.contains(e.target) && iconRef.current && !iconRef.current.contains(e.target)) {
                setProfileOpen(false);
                setEditNameOpen(false);
                setChangePasswordOpen(false);
                setProfileError('');
                setErrorField('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [profileOpen]);

    // --- PROFILE HANDLERS ---
    const handleEditName = async (e) => {
        e.preventDefault();
        setProfileError('');
        if (!editNameValue.trim()) return setProfileError('Name cannot be empty');
        try {
            const res = await api.patch('/auth/profile/name', { userId, name: editNameValue.trim() });
            setUserName(res.data.name);
            const currentUser = JSON.parse(localStorage.getItem('user'));
            localStorage.setItem('user', JSON.stringify({ ...currentUser, name: res.data.name }));
            setEditNameOpen(false);
            setEditNameValue('');
        } catch (err) {
            setProfileError(err.response?.data?.message || 'Failed to update name');
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setProfileError('');
        setErrorField('');
        if (newPassword !== confirmPassword) return setProfileError('New passwords do not match');
        if (!newPassword || newPassword.length < 4) return setProfileError('Password must be at least 4 characters');
        try {
            await api.patch('/auth/profile/password', { userId, currentPassword, newPassword, confirmPassword });
            setChangePasswordOpen(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            alert("Password updated successfully!");
        } catch (err) {
            const status = err.response?.status;
            const data = err.response?.data;
            const msg = (data?.message || data?.error || (typeof data === 'string' ? data : null)) || 'Failed to change password';
            setProfileError(msg);
            if (status === 401 || (msg && msg.toLowerCase().includes('current password'))) setErrorField('current');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/');
    };

    // --- BUTTON HANDLERS ---

    const handleEnroll = () => {
        setShowEnrollModal(true);
    };

    const handleSchedule = () => {
        alert("This will open the Scheduler (Coming Soon)");
    };

    const handleStartSession = async () => {
        alert(`Signal sent! 'attendance_taker.py' will wake up for ${moduleCode} shortly.`);
    };

    // --- 3. DELETE STUDENT HANDLER (Refactored) ---
    const handleRemoveStudent = async (studentId) => {
        if (!window.confirm(`Are you sure you want to remove Student ${studentId} from this class?`)) {
            return;
        }

        try {
            // UPDATED: Now points to the dedicated 'studentList.js' route
            await api.delete(`/class-list/${moduleCode}/${studentId}`);
            
            // Remove from local state immediately for fast UI response
            setStudents(students.filter(s => s.Student_ID !== studentId));
        } catch (err) {
            alert("Failed to remove student. See console.");
            console.error(err);
        }
    };

    // --- 4. SUBMIT ENROLLMENT (Triggers Python) ---
    const submitEnrollment = async (e) => {
        e.preventDefault();
        setIsScanning(true);

        try {
            // Note: Enrollment triggers the Python engine, so it stays in 'enroll' route
            await api.post('/enroll/student', {
                id: newStudent.id,
                firstName: newStudent.first,
                lastName: newStudent.last,
                moduleCode: moduleCode
            });

            setIsScanning(false);
            setShowEnrollModal(false);
            setNewStudent({ id: '', first: '', last: '' });
            fetchStudents(); // Refresh the list

        } catch (err) {
            console.error(err);
            setIsScanning(false);
            alert("Error: Camera process failed or was closed early.");
        }
    };

    return (
        <>
            <header className="home-header">
                <img src={logo} alt="Logo" className="header-logo" />
                <nav>
                    <Link to="/Dashboard" className="nav-item">Home</Link>
                    <div className="header-splitter">|</div>
                    <Link to="/Dashboard#middle-of-home" className="nav-item">Select Module</Link>
                    <div className="header-splitter">|</div>
                    <Link to="/Dashboard#bottom-of-home" className="nav-item">Analytics</Link>
                </nav>
                <div className="profile-wrapper">
                    <button
                        ref={iconRef}
                        type="button"
                        className="profile-icon-btn"
                        onClick={() => setProfileOpen(!profileOpen)}
                        aria-label="Profile menu"
                    >
                        <img src={icon} alt="Profile" className="icon-logo" />
                    </button>
                    {profileOpen && (
                        <div ref={popupRef} className="profile-popup">
                            {profileError && <div className="profile-error">{profileError}</div>}
                            {!editNameOpen && !changePasswordOpen && (
                                <>
                                    <button type="button" className="profile-popup-item" onClick={() => { setEditNameOpen(true); setEditNameValue(userName); setProfileError(''); }}>
                                        Edit name
                                    </button>
                                    <button type="button" className="profile-popup-item" onClick={() => { setChangePasswordOpen(true); setProfileError(''); setErrorField(''); }}>
                                        Change password
                                    </button>
                                    <button type="button" className="profile-popup-item profile-logout" onClick={handleLogout}>
                                        Log out
                                    </button>
                                </>
                            )}
                            {editNameOpen && (
                                <form className="profile-form" onSubmit={handleEditName}>
                                    <input type="text" value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} placeholder="New name" className="profile-input" autoFocus />
                                    <div className="profile-form-actions">
                                        <button type="submit" className="profile-save-btn">Save</button>
                                        <button type="button" className="profile-cancel-btn" onClick={() => { setEditNameOpen(false); setEditNameValue(''); setProfileError(''); }}>Cancel</button>
                                    </div>
                                </form>
                            )}
                            {changePasswordOpen && (
                                <form className="profile-form" onSubmit={handleChangePassword}>
                                    <input type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); if (errorField === 'current') setErrorField(''); }} placeholder="Current password" className={`profile-input ${errorField === 'current' ? 'input-error' : ''}`} />
                                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="profile-input" />
                                    <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" className="profile-input" />
                                    <div className="profile-form-actions">
                                        <button type="submit" className="profile-save-btn">Update</button>
                                        <button type="button" className="profile-cancel-btn" onClick={() => { setChangePasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setProfileError(''); setErrorField(''); }}>Cancel</button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </header>

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
                        <p className="session-loading">Loading class list...</p>
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
                                    <th>MANAGE</th> 
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student) => (
                                    <tr key={student.Student_ID}>
                                        <td>{student.Student_ID}</td>
                                        <td>{student.First_Name}</td>
                                        <td>{student.Last_Name}</td>
                                        <td><span className="status-badge">Registered</span></td>
                                        <td>
                                            <button 
                                                onClick={() => handleRemoveStudent(student.Student_ID)}
                                                className="delete-student-btn"
                                                title="Remove from class"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* --- ENROLLMENT MODAL --- */}
                {showEnrollModal && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2 className="modal-title">Enroll New Student</h2>
                            <p className="modal-module">Module: <strong>{moduleCode}</strong></p>

                            <form onSubmit={submitEnrollment}>
                                <div className="modal-field">
                                    <label>Student ID</label>
                                    <input type="text" required
                                        className="modal-input"
                                        value={newStudent.id}
                                        onChange={e => setNewStudent({ ...newStudent, id: e.target.value })}
                                        disabled={isScanning}
                                    />
                                </div>
                                <div className="modal-field">
                                    <label>First Name</label>
                                    <input type="text" required
                                        className="modal-input"
                                        value={newStudent.first}
                                        onChange={e => setNewStudent({ ...newStudent, first: e.target.value })}
                                        disabled={isScanning}
                                    />
                                </div>
                                <div className="modal-field">
                                    <label>Last Name</label>
                                    <input type="text" required
                                        className="modal-input"
                                        value={newStudent.last}
                                        onChange={e => setNewStudent({ ...newStudent, last: e.target.value })}
                                        disabled={isScanning}
                                    />
                                </div>

                                {isScanning && (
                                    <div className="modal-scanning">
                                        <strong>Camera window opened!</strong>
                                        <br />
                                        <strong>Important:</strong> Click the camera window to give it focus, then:
                                        <br />• Press <kbd>S</kbd> to capture each photo (5 recommended: front, left, right, up, down)
                                        <br />• Press <kbd>Q</kbd> when done (need at least 1 photo)
                                    </div>
                                )}

                                <div className="modal-actions">
                                    {!isScanning && (
                                        <button type="button" onClick={() => setShowEnrollModal(false)} className="modal-cancel-btn">
                                            Cancel
                                        </button>
                                    )}

                                    <button type="submit" disabled={isScanning}
                                        className={`modal-submit-btn ${isScanning ? 'modal-submit-scanning' : ''}`}>
                                        {isScanning ? "Scanning..." : "Launch Camera 📷"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}

export default Session;