const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const router = express.Router();

// POST /api/session/start
router.post('/start', (req, res) => {
    const { moduleCode, duration } = req.body; // duration is in minutes (0 = manual)

    if (!moduleCode) {
        return res.status(400).json({ message: 'Module code is required' });
    }

    console.log(`[SESSION] Starting ${moduleCode} for ${duration} minutes...`);

    // 1. Determine Python Path (Adjust if your environment is different)
    const pythonPath = process.env.PYTHON_PATH || "C:\\Users\\Raid\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
    
    // 2. Point to the NEW dedicated web script
    const scriptPath = path.join(__dirname, '..', '..', 'python_engine', 'web_attendance_taker.py');
    const cwd = path.join(__dirname, '..', '..', 'python_engine');

    // 3. Spawn the Python process
    // We do NOT wait for it to finish because it might run for hours.
    // We just start it ("fire and forget") and tell the frontend "OK".
    const pythonProcess = spawn(pythonPath, [scriptPath, moduleCode, duration], { cwd });

    pythonProcess.stdout.on('data', (data) => {
        console.log(`[PYTHON]: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`[PYTHON ERR]: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`[SESSION] Process exited with code ${code}`);
    });

    res.json({ success: true, message: 'Session started successfully' });
});

module.exports = router;