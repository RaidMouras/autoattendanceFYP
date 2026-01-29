import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import '../styles/Dashboard.css';
import logo from '../images/ul-logo-home.png';
import moduleImg from '../images/module.jpeg'; 
import icon from '../images/icon.png';

function Dashboard() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('User');

  // --- FETCH MODULES ON LOAD ---
  useEffect(() => {
    const fetchModules = async () => {
      try {
        // 1. Get User Data (Fixed for the ghost user issue)
        const userString = localStorage.getItem('user');
        
        if (!userString) {
          navigate('/'); // Redirect to login if empty
          return;
        }

        const user = JSON.parse(userString);
        setUserName(user.name);

        // 2. Fetch Modules using user_id
        console.log(`Fetching modules for User ID: ${user.user_id}`);
        const response = await api.get(`/modules/lecturer/${user.user_id}`);
            
        //console.log("🔍 DEBUG MODULE DATA:", response.data);

        setModules(response.data);
      } catch (err) {
        console.error("Error fetching modules:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [navigate]);

  return (
    <>
      <header className="home-header">
        <img src={logo} alt="Logo" className="header-logo" />
        <nav>
          <Link to="/home" className="nav-item">Home</Link>
          <div className="header-splitter">|</div>
          <a href="#middle-of-home" className="nav-item">Select Module</a>
          <div className="header-splitter">|</div>
          <a href="#bottom-of-home" className="nav-item">Analytics</a>
        </nav>
        <img src={icon} alt="Icon" className="icon-logo" />
      </header>

      <main className="main-content">
        <div id="top-of-home" className="welcome-text">Welcome, {userName}</div>
        
        {/* --- SECTION 1: START A CLASS --- */}
        <section className="modules-section">
          <div id="middle-of-home" className="section-title">My Modules</div>
          
          {loading ? (
            <p style={{textAlign: 'center'}}>Loading modules...</p>
          ) : modules.length === 0 ? (
            <p style={{textAlign: 'center'}}>No modules assigned yet. Ask an Admin.</p>
          ) : (
            <div className="modules-list" style={{display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center'}}>
              
              {/* DYNAMIC LIST: Maps through your DB data */}
              {modules.map((mod) => (
                <div key={mod.Module_ID} className="card">
                  <img src={moduleImg} alt="Module" className="module-img" />
                  
                  {/* Container for text */}
                  <div className="card-text-container">
                    
                    {/* ✅ FIX: Name first, then Code. Bold & Outlined. */}
                    <span className="module-name">{mod.Module_Name}</span>
                    <span className="module-code">{mod.Module_Code}</span>
                    
                    {/* ✅ FIX: Dynamic Semester from DB */}
                    <span className="semester">{mod.Semester}</span>
                  </div>
                  
                  {/* Link to the Session Page */}
                  <Link to={`/session/${mod.Module_Code}`} className="enter-class">
                      Start Class →
                  </Link>
                </div>
              ))}

            </div>
          )}
        </section>

        {/* --- SECTION 2: ANALYTICS --- */}
        <section className="modules-section">
          <div id="bottom-of-home" className="section-title">View Analytics</div>
          
          {modules.length > 0 && (
            <div className="analytics-list" style={{display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center'}}>
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