import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import '../styles/Dashboard.css';
import '../styles/Session.css';
import logo from '../images/ul-logo-home.png';
import icon from '../images/icon.png';

function Session() {
    const { moduleCode } = useParams();
    const navigate = useNavigate();
    const popupRef = useRef(null);
    const iconRef = useRef(null);

    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('User');
    const [userId, setUserId] = useState(null);

    const [profileOpen, setProfileOpen] = useState(false);
    const [editNameOpen, setEditNameOpen] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileError, setProfileError] = useState('');
    const [errorField, setErrorField] = useState('');

    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollMode, setEnrollMode] = useState('scratch');
    const [newStudent, setNewStudent] = useState({ id: '', first: '', last: '' });
    const [isScanning, setIsScanning] = useState(false);
    const [enrollCamera, setEnrollCamera] = useState(0);
    const [availableStudents, setAvailableStudents] = useState([]);
    const [availableLoading, setAvailableLoading] = useState(false);
    const [existingSearch, setExistingSearch] = useState('');
    const [addingExistingId, setAddingExistingId] = useState(null);

    const [showCameraModal, setShowCameraModal] = useState(false);
    const [availableCameras, setAvailableCameras] = useState([]);
    const [cameraMode, setCameraMode] = useState('all');
    const [selectedCamera, setSelectedCamera] = useState(null);
    const [showSessionModal, setShowSessionModal] = useState(false);
    const [sessionDuration, setSessionDuration] = useState(0);
    const [sessionCameras, setSessionCameras] = useState(null);
    const [countdown, setCountdown] = useState(null);
    const [sessionRunning, setSessionRunning] = useState(false);

    useEffect(() => {
        const userString = localStorage.getItem('user');
        if (userString) {
            const user = JSON.parse(userString);
            setUserName(user.name);
            setUserId(user.user_id);
        }
    }, []);

    const fetchStudents = async () => {
        try {
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

    useEffect(() => {
        api.get(`/session/status/${moduleCode}`)
            .then(res => setSessionRunning(res.data.running))
            .catch(() => {});
    }, [moduleCode]);

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

    useEffect(() => {
        if (countdown === null) return;

        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countdown === 0) {
            triggerPythonSession();
            setCountdown(null);
        }
    }, [countdown]);


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
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/');
    };

    const handleRemoveStudent = async (studentId) => {
        if (!window.confirm(`Are you sure you want to remove Student ${studentId}? This deletes ALL their data (Enrollment, Attendance, Face Scans).`)) {
            return;
        }
        try {
            await api.delete(`/class-list/${moduleCode}/${studentId}`);
            setStudents(students.filter(s => s.Student_ID !== studentId));
        } catch (err) {
            alert("Failed to remove student. See console.");
            console.error(err);
        }
    };

    const fetchAvailableStudents = async () => {
        setAvailableLoading(true);
        try {
            const res = await api.get(`/class-list/${moduleCode}/available`);
            setAvailableStudents(res.data);
        } catch (err) {
            console.error("Failed to load available students", err);
            setAvailableStudents([]);
        } finally {
            setAvailableLoading(false);
        }
    };

    const handleEnroll = async () => {
        let cameras = availableCameras;
        if (cameras.length === 0) {
            try {
                const res = await api.get('/session/cameras');
                cameras = res.data.cameras || [];
                setAvailableCameras(cameras);
            } catch {
                cameras = [];
            }
        }
        setEnrollCamera(cameras.length > 0 ? cameras[0] : 0);
        setEnrollMode('scratch');
        setExistingSearch('');
        setShowEnrollModal(true);
        fetchAvailableStudents();
    };

    const handleAddExistingStudent = async (studentId) => {
        setAddingExistingId(studentId);
        try {
            await api.post(`/class-list/${moduleCode}/add-existing`, { studentId });
            setAvailableStudents(prev => prev.filter(s => s.Student_ID !== studentId));
            fetchStudents();
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to add student.';
            alert(msg);
        } finally {
            setAddingExistingId(null);
        }
    };

    const submitEnrollment = async (e) => {
        e.preventDefault();
        setIsScanning(true);

        try {
            await api.post('/enroll/student', {
                id: newStudent.id,
                firstName: newStudent.first,
                lastName: newStudent.last,
                moduleCode: moduleCode,
                cameraIndex: enrollCamera
            });

            setIsScanning(false);
            setShowEnrollModal(false);
            setNewStudent({ id: '', first: '', last: '' });
            fetchStudents();

        } catch (err) {
            console.error(err);
            setIsScanning(false);
            const msg = err.response?.data?.message || 'Camera process failed or was closed early.';
            alert(`Enrollment failed: ${msg}`);
        }
    };

    const openSessionModal = async () => {
        try {
            const res = await api.get('/session/cameras');
            setAvailableCameras(res.data.cameras || []);
        } catch {
            setAvailableCameras([]);
        }
        setCameraMode('all');
        setSelectedCamera(null);
        setShowCameraModal(true);
    };

    const confirmCameraChoice = () => {
        const cameras = cameraMode === 'all' ? null : [selectedCamera ?? availableCameras[0]];
        setSessionCameras(cameras);
        setShowCameraModal(false);
        setShowSessionModal(true);
    };

    const startSessionSequence = (duration) => {
        setSessionDuration(duration);
        setShowSessionModal(false);
        setCountdown(3);
    };

    const triggerPythonSession = async () => {
        try {
            await api.post('/session/start', {
                moduleCode: moduleCode,
                duration: sessionDuration,
                cameras: sessionCameras
            });
            setSessionRunning(true);
        } catch (err) {
            if (err.response?.status === 409) {
                alert("A session is already running for this module.");
            } else {
                alert("Failed to launch attendance system. Is the backend running?");
            }
            console.error(err);
        }
    };

    const handleStopSession = async () => {
        if (!window.confirm("Stop the running session?")) return;
        try {
            await api.post(`/session/stop/${moduleCode}`);
            setSessionRunning(false);
        } catch (err) {
            alert("Failed to stop session. It may have already ended.");
            setSessionRunning(false);
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

                <div className="session-header">
                    <h1 className="module-title">{moduleCode}</h1>
                    <p className="module-subtitle">Classroom Command Center</p>
                </div>

                <div className="control-panel">
                    <button className="cmd-btn blue" onClick={handleEnroll} disabled={sessionRunning}>
                        <span>👤</span> Enroll Student
                    </button>
                    {sessionRunning ? (
                        <button className="cmd-btn red" onClick={handleStopSession}>
                            <span>⏹</span> Stop Session
                        </button>
                    ) : (
                        <button className="cmd-btn green" onClick={openSessionModal}>
                            <span>▶</span> Start Session Now
                        </button>
                    )}
                </div>

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
                                    <th>Action</th>
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

                {showEnrollModal && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2 className="modal-title">Enroll Student</h2>
                            <p className="modal-module">Module: <strong>{moduleCode}</strong></p>

                            {!isScanning && (
                                <div className="enroll-mode-tabs">
                                    <button
                                        type="button"
                                        className={`enroll-mode-tab ${enrollMode === 'scratch' ? 'active' : ''}`}
                                        onClick={() => setEnrollMode('scratch')}
                                    >
                                        Enroll from Scratch
                                    </button>
                                    <button
                                        type="button"
                                        className={`enroll-mode-tab ${enrollMode === 'existing' ? 'active' : ''}`}
                                        onClick={() => setEnrollMode('existing')}
                                    >
                                        Add Existing Student
                                    </button>
                                </div>
                            )}

                            {enrollMode === 'existing' && !isScanning ? (
                                <div>
                                    <div className="modal-field">
                                        <input
                                            type="text"
                                            className="modal-input"
                                            placeholder="Search by name or ID..."
                                            value={existingSearch}
                                            onChange={e => setExistingSearch(e.target.value)}
                                            autoFocus
                                        />
                                    </div>

                                    <div className="existing-student-list">
                                        {availableLoading ? (
                                            <p className="session-loading">Loading students...</p>
                                        ) : availableStudents.length === 0 ? (
                                            <p className="existing-empty">
                                                No previously enrolled students available.
                                            </p>
                                        ) : (() => {
                                            const q = existingSearch.trim().toLowerCase();
                                            const filtered = q === ''
                                                ? availableStudents
                                                : availableStudents.filter(s => {
                                                    const full = `${s.First_Name || ''} ${s.Last_Name || ''}`.toLowerCase();
                                                    return (
                                                        String(s.Student_ID).toLowerCase().includes(q) ||
                                                        full.includes(q)
                                                    );
                                                });
                                            if (filtered.length === 0) {
                                                return <p className="existing-empty">No matching students.</p>;
                                            }
                                            return filtered.map(s => (
                                                <div key={s.Student_ID} className="existing-student-row">
                                                    <div className="existing-student-info">
                                                        <span className="existing-student-name">
                                                            {s.First_Name} {s.Last_Name}
                                                        </span>
                                                        <span className="existing-student-id">
                                                            ID: {s.Student_ID}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="existing-add-btn"
                                                        disabled={addingExistingId === s.Student_ID}
                                                        onClick={() => handleAddExistingStudent(s.Student_ID)}
                                                    >
                                                        {addingExistingId === s.Student_ID ? 'Adding...' : 'Add'}
                                                    </button>
                                                </div>
                                            ));
                                        })()}
                                    </div>

                                    <div className="modal-actions">
                                        <button type="button" onClick={() => setShowEnrollModal(false)} className="modal-cancel-btn">
                                            Close
                                        </button>
                                    </div>
                                </div>
                            ) : (
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

                                {availableCameras.length > 1 && !isScanning && (
                                    <div className="modal-field">
                                        <label>Camera</label>
                                        <select
                                            className="modal-input"
                                            value={enrollCamera}
                                            onChange={e => setEnrollCamera(Number(e.target.value))}
                                        >
                                            {availableCameras.map(idx => (
                                                <option key={idx} value={idx}>
                                                    Camera {idx}{idx === 0 ? ' (laptop)' : ' (external)'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

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
                            )}
                        </div>
                    </div>
                )}

                {showCameraModal && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{textAlign: 'center'}}>
                            <h2 className="modal-title">Camera Setup</h2>
                            <p>
                                {availableCameras.length === 0
                                    ? 'No cameras detected.'
                                    : `${availableCameras.length} camera(s) detected: [${availableCameras.map(i => i === 0 ? `${i} (laptop)` : `${i} (external)`).join(', ')}]`}
                            </p>

                            <div className="duration-options" style={{marginTop: '16px'}}>
                                <button
                                    className={`duration-btn ${cameraMode === 'all' ? 'active' : ''}`}
                                    onClick={() => setCameraMode('all')}
                                >
                                    All Cameras
                                </button>
                                <button
                                    className={`duration-btn ${cameraMode === 'single' ? 'active' : ''}`}
                                    onClick={() => setCameraMode('single')}
                                    disabled={availableCameras.length === 0}
                                >
                                    Single Camera
                                </button>
                            </div>

                            {cameraMode === 'single' && availableCameras.length > 0 && (
                                <div style={{marginTop: '16px'}}>
                                    <label style={{marginRight: '10px'}}>Choose camera:</label>
                                    <select
                                        value={selectedCamera ?? availableCameras[0]}
                                        onChange={e => setSelectedCamera(Number(e.target.value))}
                                        className="modal-input"
                                        style={{width: 'auto', display: 'inline-block'}}
                                    >
                                        {availableCameras.map(idx => (
                                            <option key={idx} value={idx}>
                                                Camera {idx} {idx === 0 ? '(laptop)' : '(external)'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="modal-actions" style={{marginTop: '24px'}}>
                                <button onClick={() => setShowCameraModal(false)} className="modal-cancel-btn">
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmCameraChoice}
                                    className="modal-submit-btn"
                                    disabled={availableCameras.length === 0}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showSessionModal && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{textAlign: 'center'}}>
                            <h2 className="modal-title">Start Class Session</h2>
                            <p>Select how long the camera should run:</p>

                            <div className="duration-options">
                                <button className="duration-btn" onClick={() => startSessionSequence(60)}>
                                    1 Hour
                                </button>
                                <button className="duration-btn" onClick={() => startSessionSequence(120)}>
                                    2 Hours
                                </button>
                                <button className="duration-btn" onClick={() => startSessionSequence(180)}>
                                    3 Hours
                                </button>
                                <button className="duration-btn manual" onClick={() => startSessionSequence(0)}>
                                    ♾️ Manual Stop
                                </button>
                            </div>

                            <button onClick={() => setShowSessionModal(false)} className="modal-cancel-btn" style={{marginTop: '20px'}}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {countdown !== null && (
                    <div className="countdown-overlay">
                        <div className="countdown-number">
                            {countdown > 0 ? countdown : "GO!"}
                        </div>
                    </div>
                )}

            </main>
        </>
    );
}

export default Session;
