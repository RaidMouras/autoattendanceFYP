require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { verifyToken, requireAdmin } = require('./middleware/authMiddleware');

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
app.use(cors());
app.use(express.json());

// Public routes (no token required)
app.use('/api/auth', authRoutes);

// Protected routes (valid JWT required)
app.use('/api/modules', verifyToken, moduleRoutes);
app.use('/api/analytics', verifyToken, analyticsRoutes);
app.use('/api/enroll', verifyToken, enrollRoutes);
app.use('/api/class-list', verifyToken, studentListRoutes);
app.use('/api/session', verifyToken, sessionControlRoutes);

// Admin-only routes (valid JWT + admin role required)
app.use('/api/admin', verifyToken, requireAdmin, adminRoutes);

// Test Route
app.get('/', (_req, res) => {
  res.send('Attendance API is Running...');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});