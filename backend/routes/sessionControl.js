const express = require('express');
const path = require('path');
const { spawn, execFile } = require('child_process');
const router = express.Router();
const db = require('../db');

const activeSessions = new Map();
const stoppingSessions = new Set();

router.get('/cameras', (req, res) => {
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const script = `
import cv2, json, sys
available = []
for i in range(6):
    cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
    if cap.isOpened():
        available.append(i)
        cap.release()
    else:
        cap.release()
        break
print(json.dumps(available))
`;
    const proc = spawn(pythonPath, ['-c', script]);
    let output = '';
    proc.stdout.on('data', d => { output += d.toString(); });
    proc.on('close', () => {
        try {
            const indices = JSON.parse(output.trim());
            res.json({ cameras: indices });
        } catch {
            res.json({ cameras: [] });
        }
    });
    proc.on('error', () => res.json({ cameras: [] }));
});

router.get('/status/:moduleCode', (req, res) => {
    res.json({ running: activeSessions.has(req.params.moduleCode) });
});

router.post('/start', (req, res) => {
    const { moduleCode, duration, cameras } = req.body;

    if (!moduleCode) {
        return res.status(400).json({ message: 'Module code is required' });
    }

    if (activeSessions.has(moduleCode) || stoppingSessions.has(moduleCode)) {
        return res.status(409).json({ message: 'A session is already running for this module' });
    }

    const pythonPath = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.join(__dirname, '..', '..', 'python_engine', 'web_attendance_taker.py');
    const cwd = path.join(__dirname, '..', '..', 'python_engine');

    const cameraArg = (cameras && cameras.length > 0) ? cameras.join(',') : 'all';
    const pythonProcess = spawn(pythonPath, [scriptPath, moduleCode, duration, cameraArg], { cwd });

    activeSessions.set(moduleCode, pythonProcess);
    console.log(`[SESSION] Started ${moduleCode} (PID: ${pythonProcess.pid})`);

    pythonProcess.stdout.on('data', (data) => {
        console.log(`[PYTHON]: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`[PYTHON ERR]: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        activeSessions.delete(moduleCode);
        console.log(`[SESSION] ${moduleCode} process exited with code ${code}`);
    });

    res.json({ success: true, message: 'Session started successfully' });
});

router.post('/stop/:moduleCode', async (req, res) => {
    const { moduleCode } = req.params;
    const proc = activeSessions.get(moduleCode);

    if (!proc) {
        return res.status(404).json({ message: 'No active session found for this module' });
    }

    stoppingSessions.add(moduleCode);

    try {
        await db.query(
            'UPDATE sessions SET End_Time = NOW(), is_active = 0 WHERE Module_Code = ? AND is_active = 1',
            [moduleCode]
        );
    } catch (e) {
        console.error('[SESSION] Failed to update End_Time on stop:', e);
    }

    if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], (err) => {
            if (err) console.error('[SESSION] taskkill failed:', err);
        });
    } else {
        proc.kill('SIGTERM');
    }

    if (activeSessions.get(moduleCode) === proc) {
        activeSessions.delete(moduleCode);
    }
    stoppingSessions.delete(moduleCode);

    console.log(`[SESSION] Stopped ${moduleCode} via web`);
    res.json({ success: true, message: 'Session stopped' });
});

module.exports = router;
