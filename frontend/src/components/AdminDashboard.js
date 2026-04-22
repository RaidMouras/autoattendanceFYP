import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import '../styles/AdminDashboard.css';

const AdminDashboard = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };
  const [lecturers, setLecturers] = useState([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [showModuleModal, setShowModuleModal] = useState(false);
  const [selectedLecturer, setSelectedLecturer] = useState(null);
  const [lecturerModules, setLecturerModules] = useState([]);

  const [modCode, setModCode] = useState('');
  const [modName, setModName] = useState('');

  const [semNumber, setSemNumber] = useState('Semester 1');
  const [acadYear, setAcadYear] = useState('2025/26');

  const fetchLecturers = async () => {
    try {
      const response = await api.get('/admin/lecturers');
      setLecturers(response.data);
    } catch (err) {
      console.error("Failed to fetch lecturers");
    }
  };

  useEffect(() => {
    fetchLecturers();
  }, []);

  const handleDeleteLecturer = async (userId) => {
    if (!window.confirm("Are you sure? This will delete the user AND their modules.")) return;
    try {
      await api.delete(`/admin/delete-lecturer/${userId}`);
      fetchLecturers();
    } catch (err) {
      alert("Failed to delete user.");
    }
  };

  const handleAddLecturer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/add-lecturer', { name: newName, email: newEmail, password: newPassword });
      alert("Lecturer Added!");
      setShowAddModal(false);
      setNewName(''); setNewEmail(''); setNewPassword('');
      fetchLecturers();
    } catch (err) {
      alert(err.response?.data?.message || 'Error');
    }
  };

  const openModuleModal = async (lecturer) => {
    setSelectedLecturer(lecturer);
    setShowModuleModal(true);

    try {
      const response = await api.get(`/admin/modules/${lecturer.User_ID}`);
      setLecturerModules(response.data);
    } catch (err) {
      console.error("Error fetching modules");
    }
  };

  const handleAddModule = async (e) => {
    e.preventDefault();
    if (!selectedLecturer) return;

    const fullSemester = `${semNumber} ${acadYear}`;

    try {
      await api.post('/admin/add-module', {
        userId: selectedLecturer.User_ID,
        code: modCode,
        name: modName,
        semester: fullSemester
      });

      setModCode('');
      setModName('');

      const response = await api.get(`/admin/modules/${selectedLecturer.User_ID}`);
      setLecturerModules(response.data);

    } catch (err) {
      alert("Failed to add module. Code might be a duplicate.");
    }
  };

  const handleDeleteModule = async (moduleCode) => {
    if(!window.confirm(`Are you sure you want to remove ${moduleCode}?`)) return;

    try {
      await api.delete(`/admin/delete-module/${moduleCode}`);
      const response = await api.get(`/admin/modules/${selectedLecturer.User_ID}`);
      setLecturerModules(response.data);
    } catch (err) {
      alert("Failed to delete module");
    }
  };

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>Admin Dashboard</h1>
        <button className="admin-logout-btn" onClick={handleLogout}>Logout</button>
      </header>

      <div className="list-section">
        <div className="list-header"><h2>Lecturer List</h2></div>

        <div className="lecturers-grid">
          {lecturers.map((lecturer) => (
             <div key={lecturer.User_ID} className="lecturer-item">
               <div style={{display: 'flex', flexDirection: 'column'}}>
                 <span style={{ fontWeight: 'bold' }}>{lecturer.Name}</span>
                 <span style={{ color: '#666', fontSize: '0.9em' }}>{lecturer.Email}</span>
               </div>

               <div>
                   <button className="modules-btn" onClick={() => openModuleModal(lecturer)}>
                      Modules 📚
                   </button>
                   <button className="delete-btn" onClick={() => handleDeleteLecturer(lecturer.User_ID)}>
                      Delete 🗑️
                   </button>
               </div>
             </div>
          ))}
        </div>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button className="add-user-btn" onClick={() => setShowAddModal(true)}>+ Add User</button>
        </div>
      </div>

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="close-btn" onClick={() => setShowAddModal(false)}>&times;</button>
            <h2 style={{ textAlign: 'center', marginTop: 0 }}>Add New Lecturer</h2>
            <form onSubmit={handleAddLecturer}>
              <div className="form-group"><label>Full Name</label><input type="text" value={newName} onChange={e=>setNewName(e.target.value)} required /></div>
              <div className="form-group"><label>Email</label><input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} required /></div>
              <div className="form-group"><label>Password</label><input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required /></div>
              <button type="submit" className="submit-btn">Create Account</button>
            </form>
          </div>
        </div>
      )}

      {showModuleModal && selectedLecturer && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '500px'}}>
            <button className="close-btn" onClick={() => setShowModuleModal(false)}>&times;</button>

            <h2 style={{ textAlign: 'center', marginTop: 0 }}>
                Modules for {selectedLecturer.Name}
            </h2>

            <form onSubmit={handleAddModule} style={{background: '#f4f4f4', padding: '15px', borderRadius: '5px'}}>

                <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
                    <input
                        type="text" placeholder="Code (e.g. CS4001)"
                        value={modCode} onChange={e=>setModCode(e.target.value)}
                        required style={{flex: 1, minWidth: 0, padding: '8px', boxSizing: 'border-box'}}
                    />
                    <input
                        type="text" placeholder="Module Name"
                        value={modName} onChange={e=>setModName(e.target.value)}
                        required style={{flex: 1, minWidth: 0, padding: '8px', boxSizing: 'border-box'}}
                    />
                </div>

                <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
                    <select value={semNumber} onChange={e => setSemNumber(e.target.value)} style={{flex: 1, minWidth: 0, padding: '8px', boxSizing: 'border-box'}}>
                        <option value="Semester 1">Semester 1</option>
                        <option value="Semester 2">Semester 2</option>
                    </select>

                    <select value={acadYear} onChange={e => setAcadYear(e.target.value)} style={{flex: 1, minWidth: 0, padding: '8px', boxSizing: 'border-box'}}>
                        <option value="2025/26">2025/26</option>
                        <option value="2026/27">2026/27</option>
                        <option value="2027/28">2027/28</option>
                    </select>
                </div>

                <button type="submit" className="submit-btn" style={{marginTop: '0', padding: '8px'}}>+ Assign Module</button>
            </form>

            <div className="module-list">
                {lecturerModules.length === 0 ? (
                    <p style={{textAlign: 'center', color: '#999'}}>No modules assigned yet.</p>
                ) : (
                    lecturerModules.map(mod => (
                        <div key={mod.Module_ID} className="module-item">

                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                <span><strong>{mod.Module_Code}</strong>: {mod.Module_Name}</span>
                                <span style={{fontSize: '0.8em', color: '#666'}}>{mod.Semester}</span>
                            </div>

                            <button
                                className="module-delete-btn"
                                onClick={() => handleDeleteModule(mod.Module_Code)}
                            >
                                Remove
                            </button>
                        </div>
                    ))
                )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
