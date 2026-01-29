import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Removed 'Link' since we deleted signup
import api from '../api'; // Ensure you have this file in src/api.js
import '../styles/Login.css';
import logo from '../images/ul-logo.png';
import campus from '../images/campus_login.jpg';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const navigate = useNavigate();

  // Basic Email Validation Regex
  const emailRegex = /^[^@]+@[^@]+\.[^@]+$/;

  const handleEmailBlur = () => {
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address.');
    } else {
      setEmailError('');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/auth/login', { email, password });
      
      console.log("Login Response:", response.data);

      if (response.data.success) {
        const userData = {
          user_id: response.data.user_id, 
          name: response.data.name,
          email: response.data.email,
          role: response.data.role
        };

        localStorage.setItem('user', JSON.stringify(userData));
        
        if (response.data.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/dashboard'); 
        }
      }
    } catch (err) {
      // ✅ FIX: Changed 'setError' to 'setLoginError'
      setLoginError('Invalid email or password');
    }
  };

  return (
    <div className="split-page">
      <div className="left-panel">
        <img src={logo} alt="UL Logo" className="logo" />
        <img src={campus} alt="Campus" className="campus-img" />
      </div>
      
      <div className="right-panel">
        <h1 className="main-title">LOGIN</h1>
        
        <form onSubmit={handleLogin}>
          
          {/* Global Error Message */}
          {loginError && (
            <div style={{ color: '#ff6b6b', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '5px', textAlign: 'center' }}>
              {loginError}
            </div>
          )}

          <label>Email</label>
          <input
            type="email"
            placeholder="enter email here"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={handleEmailBlur}
            required
          />
          {emailError && <span style={{ color: '#ff8888', fontSize: '0.9em' }}>{emailError}</span>}

          <label>Password</label>
          <input 
            type="password" 
            placeholder="enter password here" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <button type="submit" className="main-btn">Log In</button>
        </form>
        
        {/* Removed the Signup Link here */}
      </div>
    </div>
  );
}

export default Login;