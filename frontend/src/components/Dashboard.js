import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import '../styles/Dashboard.css';
import logo from '../images/ul-logo-home.png';
import moduleImg from '../images/module.jpeg';
import icon from '../images/icon.png';

function Dashboard() {
  const navigate = useNavigate();
  const popupRef = useRef(null);
  const iconRef = useRef(null);

  const [modules, setModules] = useState([]);
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

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const userString = localStorage.getItem('user');
        if (!userString) {
          navigate('/');
          return;
        }

        const user = JSON.parse(userString);
        setUserName(user.name);
        setUserId(user.user_id);

        console.log(`Fetching modules for User ID: ${user.user_id}`);
        const response = await api.get(`/modules/lecturer/${user.user_id}`);
        setModules(response.data);
      } catch (err) {
        console.error("Error fetching modules:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [navigate]);

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

    if (newPassword !== confirmPassword) {
      setProfileError('New passwords do not match');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setProfileError('Password must be at least 4 characters');
      return;
    }

    try {
      await api.patch('/auth/profile/password', {
        userId,
        currentPassword,
        newPassword,
        confirmPassword
      });

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

      if (status === 401 || (msg && msg.toLowerCase().includes('current password'))) {
        setErrorField('current');
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <>
      <header className="home-header">
        <img src={logo} alt="Logo" className="header-logo" />
        <nav>
          <Link to="/Dashboard" className="nav-item">Home</Link>
          <div className="header-splitter">|</div>
          <a href="#middle-of-home" className="nav-item">Select Module</a>
          <div className="header-splitter">|</div>
          <a href="#bottom-of-home" className="nav-item">Analytics</a>
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
                  <input
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    placeholder="New name"
                    className="profile-input"
                    autoFocus
                  />
                  <div className="profile-form-actions">
                    <button type="submit" className="profile-save-btn">Save</button>
                    <button type="button" className="profile-cancel-btn" onClick={() => { setEditNameOpen(false); setEditNameValue(''); setProfileError(''); }}>Cancel</button>
                  </div>
                </form>
              )}

              {changePasswordOpen && (
                <form className="profile-form" onSubmit={handleChangePassword}>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (errorField === 'current') setErrorField('');
                    }}
                    placeholder="Current password"
                    className={`profile-input ${errorField === 'current' ? 'input-error' : ''}`}
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="profile-input"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="profile-input"
                  />
                  <div className="profile-form-actions">
                    <button type="submit" className="profile-save-btn">Update</button>
                    <button type="button" className="profile-cancel-btn" onClick={() => {
                      setChangePasswordOpen(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setProfileError('');
                      setErrorField('');
                    }}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        <div id="top-of-home" className="welcome-text">Welcome, {userName}</div>

        <section className="modules-section">
          <div id="middle-of-home" className="section-title">My Modules</div>

          {loading ? (
            <p>Loading modules...</p>
          ) : modules.length === 0 ? (
            <p>No modules assigned yet. Ask an Admin.</p>
          ) : (
            <div className="modules-list">
              {modules.map((mod) => (
                <div key={mod.Module_ID} className="card">
                  <img src={moduleImg} alt="Module" className="module-img" />
                  <div className="card-text-container">
                    <span className="module-name">{mod.Module_Name}</span>
                    <span className="module-code">{mod.Module_Code}</span>
                    <span className="semester">{mod.Semester}</span>
                  </div>
                  <Link to={`/session/${mod.Module_Code}`} className="enter-class">
                    Start Class →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="modules-section">
          <div id="bottom-of-home" className="section-title">View Analytics</div>

          {modules.length > 0 && (
            <div className="analytics-list">
              {modules.map((mod) => (
                <div key={`analytics-${mod.Module_ID}`} className="card">
                  <img src={moduleImg} alt="Module" className="module-img" />
                  <div className="card-text-container">
                    <span className="module-name">{mod.Module_Name}</span>
                    <span className="module-code">{mod.Module_Code}</span>
                    <span className="semester">{mod.Semester}</span>
                  </div>
                  <Link to={`/analytics/${mod.Module_Code}`} className="enter-class">
                    View Report 📊
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </>
  );
}

export default Dashboard;
