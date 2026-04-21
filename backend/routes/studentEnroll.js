// backend/routes/studentEnroll.js
const express = require('express');
const path = require('path');
const router = express.Router();
const { spawn } = require('child_process');

// POST /api/enroll/student
router.post('/student', (req, res) => {
    const { id, firstName, lastName, moduleCode, cameraIndex } = req.body;

    if (!id || !firstName || !moduleCode) {
        return res.status(400).json({ message: 'Missing details' });
    }

    const camIdx = (cameraIndex !== undefined && cameraIndex !== null) ? String(cameraIndex) : '0';
    console.log(`Starting Enrollment for ${firstName} in ${moduleCode} (camera ${camIdx})...`);

    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, '..', '..', 'python_engine', 'enroller_web.py');
    const cwd = path.join(__dirname, '..', '..', 'python_engine');

    const pythonProcess = spawn(pythonPath, [scriptPath, id, firstName || '', lastName || '', moduleCode, camIdx], {
        cwd,
    });

    let stderrOutput = '';
    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
        stderrOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: 'Enrollment Successful!' });
        } else {
            const detail = stderrOutput.trim().split('\n').pop() || 'Enrollment failed — check server logs.';
            res.status(500).json({ success: false, message: detail });
        }
    });
});

module.exports = router;