//This file starts the app and tells the app where to send requests

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const moduleRoutes = require('./routes/modules');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');
const enrollRoutes = require('./routes/studentEnroll');
const studentListRoutes = require('./routes/studentList');
const sessionControlRoutes = require('./routes/sessionControl');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors()); // Allow React to talk to this express server. because they are on different ports communication is naturally blocked
app.use(express.json()); // Parse JSON bodies (translate json into javascript objects)

// Route Handlers
app.use('/api/auth', authRoutes);       // Login endpoints
app.use('/api/modules', moduleRoutes);  // Dashboard endpoints
app.use('/api/analytics', analyticsRoutes); // Stats endpoints
app.use('/api/admin', adminRoutes);     // Admin endpoints
app.use('/api/enroll', enrollRoutes); // Student Enrollment endpoints
app.use('/api/class-list', studentListRoutes); // Student List endpoints
app.use('/api/session', sessionControlRoutes); // Session Control endpoints (start/stop sessions)

// Test Route
app.get('/', (req, res) => {
  res.send('Attendance API is Running...');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});