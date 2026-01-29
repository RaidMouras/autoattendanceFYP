import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// IMPORTS: Adjust these paths if your files are in different folders
import Login from './components/Login'; 
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import Session from './components/Session';

function App() {
  return (
    <Router>
      <Routes>

        <Route path="/" element={<Navigate to="/login" />} />

        <Route path="/Login" element={<Login />} />

        <Route path="/Signup" element={<Signup />} />

        <Route path="/Dashboard" element={<Dashboard />} />

        <Route path="/admin" element={<AdminDashboard />} />

        <Route path="/session/:moduleCode" element={<Session />} />
        
      </Routes>
    </Router>
  );
}

export default App;