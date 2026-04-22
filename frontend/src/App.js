import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import Session from './components/Session';
import Analytics from './components/Analytics';

function App() {
  return (
    <Router>
      <Routes>

        <Route path="/" element={<Navigate to="/login" />} />

        <Route path="/login" element={<Login />} />

        <Route path="/Dashboard" element={<Dashboard />} />

        <Route path="/admin" element={<AdminDashboard />} />

        <Route path="/session/:moduleCode" element={<Session />} />

        <Route path="/analytics/:moduleCode" element={<Analytics />} />

      </Routes>
    </Router>
  );
}

export default App;
