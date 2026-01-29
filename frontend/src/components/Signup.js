import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/Signup.css';
import logo from '../images/ul-logo.png';
import campus from '../images/campus_signup.jpg';

function Signup() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    verifyPassword: '',
  });
  const [errors, setErrors] = useState({
    email: '',
    password: '',
  });
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const emailFormat = /^[^@]+@[^@]+\.[^@]+$/;
  const teacherEmailFormat = /^[^@]+@teacher\.com$/;

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleEmailBlur = () => {
    if (!emailFormat.test(formData.email) || !teacherEmailFormat.test(formData.email)) {
      setErrors({
        ...errors,
        email: 'Enter a valid email',
      });
    } else {
      setErrors({
        ...errors,
        email: '',
      });
    }
  };

  const handleVerifyPasswordBlur = () => {
    if (formData.verifyPassword !== formData.password) {
      setErrors({
        ...errors,
        password: 'Passwords do not match.',
      });
    } else {
      setErrors({
        ...errors,
        password: '',
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation before submit
    if (!emailFormat.test(formData.email)) {
      setErrors({ ...errors, email: 'Please enter a valid email' });
      return;
    }

    if (formData.password !== formData.verifyPassword) {
      setErrors({ ...errors, password: 'Passwords do not match' });
      return;
    }

    try {
      const response = await axios.post('http://localhost:5000/api/signup', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      setMessage('Registration successful! Redirecting to home page...');

      setTimeout(() => {
        navigate('/Dashboard');
      }, 1500);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className="split-page">
      <div className="left-panel">
        <img src={logo} alt="UL Logo" className="logo" />
        <img src={campus} alt="Campus" className="campus-img" />
      </div>
      <div className="right-panel">
        <h1 className="main-title">Sign Up</h1>
        <form onSubmit={handleSubmit}>
          <label>Username</label>
          <input
            type="text"
            name="name"
            placeholder="enter username here"
            value={formData.name}
            onChange={handleInputChange}
            required
          />

          <label>Email</label>
          <input
            type="email"
            name="email"
            placeholder="enter email here"
            value={formData.email}
            onChange={handleInputChange}
            onBlur={handleEmailBlur}
            required
          />
          {errors.email && <span style={{ color: 'red' }}>{errors.email}</span>}

          <label>Password</label>
          <input
            type="password"
            name="password"
            placeholder="enter password here"
            value={formData.password}
            onChange={handleInputChange}
            required
          />

          <label>Password Verification</label>
          <input
            type="password"
            name="verifyPassword"
            placeholder="re-enter password here"
            value={formData.verifyPassword}
            onChange={handleInputChange}
            onBlur={handleVerifyPasswordBlur}
            required
          />
          {errors.password && (
            <span style={{ color: 'red' }}>{errors.password}</span>
          )}

          <button type="submit" className="main-btn">
            Sign Up
          </button>
        </form>

        {message && (
          <p style={{ color: message.includes('successful') ? 'white' : 'red' }}>
            {message}
          </p>
        )}

        <Link to="/" className="switch-link">
          Log in here
        </Link>
      </div>
    </div>
  );
}

export default Signup;
