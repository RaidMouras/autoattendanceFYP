import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api';
import '../styles/Dashboard.css';
import '../styles/Analytics.css';
import logo from '../images/ul-logo-home.png';
import icon from '../images/icon.png'; // Added profile icon import

const Analytics = () => {
    // route now passes moduleCode (not sessionId)
    const { moduleCode } = useParams();
    const navigate = useNavigate();
    const popupRef = useRef(null);
    const iconRef = useRef(null);

    // --- TAB & DATA STATE ---
    const [activeTab, setActiveTab] = useState('class');
    const [moduleData, setModuleData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedStudent, setSelectedStudent] = useState(null);

    // --- PROFILE STATE ---
    const [userName, setUserName] = useState('User');
    const [userId, setUserId] = useState(null);
    const [profileOpen, setProfileOpen] = useState(false);
    const [editNameOpen, setEditNameOpen] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);

    // Profile Form Values
    const [editNameValue, setEditNameValue] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileError, setProfileError] = useState('');
    const [errorField, setErrorField] = useState('');

    // --- EFFECTS ---
    // Load User Data
    useEffect(() => {
        const userString = localStorage.getItem('user');
        if (userString) {
            const user = JSON.parse(userString);
            setUserName(user.name);
            setUserId(user.user_id);
        }
    }, []);

    // Fetch Analytics Data (Using Session.js Logic!)
    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                // 1. ALWAYS fetch the class list first, exactly like Session.js does!
                const classRes = await api.get(`/class-list/${moduleCode}`);
                const enrolledStudents = classRes.data;

                // 2. Set up a base data structure so students NEVER disappear
                let data = {
                    moduleCode: moduleCode,
                    totalSessions: 0,
                    students: enrolledStudents.map(s => ({
                        id: s.Student_ID,
                        name: `${s.First_Name} ${s.Last_Name}`,
                        status: 'No Data',
                        engagement: '0%',
                        totalLogs: 0,
                        expectedLogs: 0
                    }))
                };

                // 3. Now quietly try to fetch the analytics and merge them if they exist
                try {
                    const analyticsRes = await api.get(`/analytics/module/${moduleCode}`);
                    if (analyticsRes.data && analyticsRes.data.totalSessions > 0) {
                        data.totalSessions = analyticsRes.data.totalSessions;

                        // Merge the analytics stats into our existing enrolled students list
                        data.students = data.students.map(baseStudent => {
                            const stats = analyticsRes.data.students.find(s => s.id === baseStudent.id);
                            return stats ? { ...baseStudent, ...stats } : baseStudent;
                        });
                    }
                } catch (analyticsErr) {
                    // analytics endpoint doesn't exist yet or no sessions recorded for this module
                    console.warn("Analytics API returned 404 or no data. Continuing with class list only.", analyticsErr);
                }

                // 4. Save the combined data to state
                setModuleData(data);

            } catch (err) {
                console.error("Failed to fetch class list. Is the database connected?", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, [moduleCode]);

    // Handle clicking outside the profile popup to close it
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

    // --- RENDER HELPERS ---
    if (loading) {
        return (
            <main className="main-content" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <h2>Loading analytics...</h2>
            </main>
        );
    }

    const hasData = moduleData && moduleData.totalSessions > 0;
    const studentsList = moduleData?.students || [];

    let presentCount = 0, partialCount = 0, absentCount = 0, totalEngagement = 0, avgEngagement = 0;
    let pieData = [];

    if (hasData) {
        studentsList.forEach(student => {
            const engagementNum = parseInt(student.engagement.replace('%', ''));
            totalEngagement += engagementNum;

            if (engagementNum < 40) absentCount++;
            else if (engagementNum < 75) partialCount++;
            else presentCount++;
        });

        avgEngagement = Math.round(totalEngagement / studentsList.length);
        pieData = [
            { name: 'Good Standing (>75%)', value: presentCount, color: '#4CAF50' },
            { name: 'Warning (40-75%)', value: partialCount, color: '#FFC107' },
            { name: 'Failing (<40%)', value: absentCount, color: '#F44336' }
        ];
    }

    const renderClassView = () => {
        if (!hasData) {
            return (
                <div className="class-view">
                    <h3>Semester Overview: {moduleCode}</h3>
                    <div style={{ background: 'white', padding: '60px 20px', borderRadius: '8px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ color: '#666', margin: 0 }}>No recorded data for this module.</h3>
                        <p style={{ color: '#999', marginTop: '10px' }}>Start a session in the command center to begin tracking.</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="class-view">
                <h3>Semester Overview: {moduleCode}</h3>
                <div className="summary-cards">
                    <div className="summary-card" style={{ minHeight: 'auto' }}>
                        <h4>Total Students</h4>
                        <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{studentsList.length}</p>
                    </div>
                    <div className="summary-card" style={{ minHeight: 'auto' }}>
                        <h4>Sessions Tracked</h4>
                        <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{moduleData.totalSessions}</p>
                    </div>
                    <div className="summary-card" style={{ minHeight: 'auto' }}>
                        <h4>Avg Class Engagement</h4>
                        <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{avgEngagement}%</p>
                    </div>
                </div>

                <div className="chart-container" style={{ width: '100%', height: 350, background: 'white', borderRadius: '8px', padding: '20px' }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={5} dataKey="value">
                                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    };

    const renderStudentsView = () => (
        <div className="students-view">
            <h3>Student Breakdown</h3>
            <div className="student-list" style={{ background: 'white', borderRadius: '8px', padding: '10px' }}>
                {studentsList.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No students are enrolled in this module.</p>
                ) : (
                    studentsList.map(student => (
                        <div key={student.id} className="student-row">
                            <div className="student-info">
                                <strong>{student.name}</strong>
                                <span className="student-id">(ID: {student.id})</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                {hasData && (
                                    <span style={{ fontWeight: 'bold', color: parseInt(student.engagement) >= 75 ? '#4CAF50' : parseInt(student.engagement) < 40 ? '#F44336' : '#FFC107' }}>
                                        {student.engagement}
                                    </span>
                                )}
                                <button className="view-btn" onClick={() => setSelectedStudent(student)}>
                                    View Report
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const renderModal = () => {
        if (!selectedStudent) return null;

        let statusColor = '#4CAF50';
        if (selectedStudent.status.includes('Warning')) statusColor = '#FFC107';
        if (selectedStudent.status.includes('Failing')) statusColor = '#F44336';

        return (
            <div className="analytics-modal-overlay" onClick={() => setSelectedStudent(null)}>
                <div className="analytics-modal-content" onClick={e => e.stopPropagation()}>
                    <h2 style={{ marginTop: 0 }}>{selectedStudent.name}</h2>
                    <p style={{ color: '#666' }}>ID: {selectedStudent.id}</p>
                    <hr style={{ borderColor: '#eee' }} />

                    {!hasData ? (
                        <div style={{ padding: '30px 0', textAlign: 'center' }}>
                            <h4 style={{ color: '#666', margin: 0 }}>No recorded data for this module.</h4>
                        </div>
                    ) : (
                        <div className="modal-stats">
                            <p><strong>Status:</strong> <span style={{ color: statusColor, fontWeight: 'bold' }}>{selectedStudent.status}</span></p>
                            <p><strong>Total Logs Captured:</strong> {selectedStudent.totalLogs} / {selectedStudent.expectedLogs}</p>
                            <p style={{ fontSize: '20px' }}><strong>Overall Engagement:</strong> {selectedStudent.engagement}</p>
                        </div>
                    )}

                    <button className="analytics-close-btn" onClick={() => setSelectedStudent(null)}>Close Window</button>
                </div>
            </div>
        );
    };

    return (
        <>
            <header className="home-header">
                <Link to="/Dashboard">
                    <img src={logo} alt="Logo" className="header-logo" style={{ cursor: 'pointer' }} />
                </Link>

                <nav>
                    {/* New Home Link */}
                    <Link to="/Dashboard" className="nav-item" style={{ textDecoration: 'none' }}>
                        Home
                    </Link>

                    <div className="header-splitter">|</div>

                    <button
                        className="nav-item"
                        onClick={() => setActiveTab('class')}
                        style={{
                            background: activeTab === 'class' ? 'rgba(255,255,255,0.2)' : 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                        }}
                    >
                        Class
                    </button>

                    <div className="header-splitter">|</div>

                    <button
                        className="nav-item"
                        onClick={() => setActiveTab('students')}
                        style={{
                            background: activeTab === 'students' ? 'rgba(255,255,255,0.2)' : 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                        }}
                    >
                        Students
                    </button>
                </nav>

                {/* Profile Dropdown Menu */}
                <div className="profile-wrapper">
                    <button ref={iconRef} type="button" className="profile-icon-btn" onClick={() => setProfileOpen(!profileOpen)} aria-label="Profile menu">
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

                            {/* Edit Name Form */}
                            {editNameOpen && (
                                <form className="profile-form" onSubmit={handleEditName}>
                                    <input type="text" value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} placeholder="New name" className="profile-input" autoFocus />
                                    <div className="profile-form-actions">
                                        <button type="submit" className="profile-save-btn">Save</button>
                                        <button type="button" className="profile-cancel-btn" onClick={() => { setEditNameOpen(false); setEditNameValue(''); setProfileError(''); }}>Cancel</button>
                                    </div>
                                </form>
                            )}

                            {/* Change Password Form */}
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

            <main className="main-content">
                <div className="analytics-container">
                    <div className="tab-content">
                        {activeTab === 'class' ? renderClassView() : renderStudentsView()}
                    </div>
                    {renderModal()}
                </div>
            </main>
        </>
    );
};

export default Analytics;