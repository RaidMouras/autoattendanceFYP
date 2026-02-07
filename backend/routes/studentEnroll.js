// backend/routes/studentEnroll.js
const express = require('express');
const path = require('path');
const router = express.Router();
const { spawn } = require('child_process');

// POST /api/enroll/student
router.post('/student', (req, res) => {
    const { id, firstName, lastName, moduleCode } = req.body;

    if (!id || !firstName || !moduleCode) {
        return res.status(400).json({ message: 'Missing details' });
    }

    console.log(`Starting Enrollment for ${firstName} in ${moduleCode}...`);

    const pythonPath = process.env.PYTHON_PATH || "C:\\Users\\Raid\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
    const scriptPath = path.join(__dirname, '..', '..', 'python_engine', 'enroller_web.py');
    const cwd = path.join(__dirname, '..', '..', 'python_engine');

    const pythonProcess = spawn(pythonPath, [scriptPath, id, firstName || '', lastName || '', moduleCode], {
        cwd,
    });
    // Debugging logs
    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
    });

    // Check result
    pythonProcess.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: 'Enrollment Successful!' });
        } else {
            res.status(500).json({ success: false, message: 'Enrollment Failed' });
        }
    });
});

module.exports = router;