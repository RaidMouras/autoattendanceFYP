"""
web_attendance_taker.py (v15.2)
--------------------------------
- AI runs in a separate mp.Process (own GIL — display loop never starved)
- Pre-scale frame BEFORE putting in queue: ~1.5 MB payload vs ~25 MB full-res
- AI process receives already-scaled frame, scales coords back up for drawing
- Attendance DB writes in a background thread (never block display loop)
- Multi-camera: auto-detects from CAMERA_START index
- Display downscaled to DISPLAY_WIDTH
"""

import sys
import time
import cv2
import face_recognition
import numpy as np
import pickle
import threading
import queue
import multiprocessing as mp
from datetime import datetime, timedelta
from db_connection import create_db_connection

LOG_INTERVAL  = 30
TOLERANCE     = 0.55
SCALE_FACTOR  = 0.5
CAMERA_START  = 0
MAX_CAMERAS   = 6
DISPLAY_WIDTH = 1280


def create_session_entry(module_code, duration_minutes):
    conn = create_db_connection()
    if not conn: return None
    try:
        cursor = conn.cursor()
        start_time   = datetime.now()
        session_date = start_time.date()
        end_time     = start_time + timedelta(minutes=duration_minutes) if duration_minutes > 0 else None
        cursor.execute(
            "INSERT INTO sessions (Module_Code, Session_Date, Start_Time, End_Time, is_active) VALUES (%s, %s, %s, %s, 1)",
            (module_code, session_date, start_time, end_time)
        )
        conn.commit()
        session_id = cursor.lastrowid
        print(f"[SESSION] Created Session ID: {session_id}", flush=True)
        return session_id
    except Exception as e:
        print(f"[DB ERROR] Failed to create session: {e}", flush=True)
        return None
    finally:
        cursor.close()
        conn.close()


def close_session_in_db(session_id):
    conn = create_db_connection()
    if not conn: return
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE sessions SET End_Time = %s, is_active = 0 WHERE Session_ID = %s",
            (datetime.now(), session_id)
        )
        conn.commit()
        print(f"[SESSION] Session {session_id} closed.", flush=True)
    except Exception as e:
        print(f"[SESSION] Failed to close session {session_id} in DB: {e}", flush=True)
    finally:
        cursor.close()
        conn.close()


def load_known_faces():
    print("[INFO] Loading student database...", flush=True)
    known_encodings, known_ids = [], []
    conn = create_db_connection()
    if conn:
        cursor = conn.cursor()
        cursor.execute("SELECT student_id, face_encoding FROM Face_Encodings")
        for r in cursor.fetchall():
            if r[1]:
                try:
                    known_encodings.append(pickle.loads(r[1]))
                    known_ids.append(r[0])
                except:
                    pass
        cursor.close()
        conn.close()
    print(f"[INFO] Loaded {len(set(known_ids))} unique students.", flush=True)
    return known_encodings, known_ids


class AttendanceLogger:
    def __init__(self):
        self._q      = queue.Queue()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def log(self, session_id, student_id):
        self._q.put((session_id, student_id))

    def _run(self):
        while True:
            session_id, student_id = self._q.get()
            conn = create_db_connection()
            if not conn:
                continue
            try:
                cursor = conn.cursor()
                now = datetime.now()
                cursor.execute(
                    "INSERT INTO attendance_logs (Session_ID, Student_ID, Time_Seen, Status) VALUES (%s, %s, %s, %s)",
                    (session_id, student_id, now, "Present")
                )
                conn.commit()
                print(f"[{now.strftime('%H:%M:%S')}] [LOGGED] Student {student_id}", flush=True)
            except Exception as e:
                print(f"[DB INSERT ERROR] {e}", flush=True)
            finally:
                cursor.close()
                conn.close()
            self._q.task_done()


class CameraStream:
    def __init__(self, src):
        self.cap = cv2.VideoCapture(src)
        self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        self.ret, self.frame = self.cap.read()
        self.lock    = threading.Lock()
        self.running = True
        self.thread  = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def _update(self):
        while self.running:
            ret, frame = self.cap.read()
            with self.lock:
                self.ret, self.frame = ret, frame

    def read(self):
        with self.lock:
            return self.ret, self.frame.copy() if self.frame is not None else (False, None)

    def stop(self):
        self.running = False
        self.thread.join(timeout=2)
        self.cap.release()


def ai_process_fn(known_encodings, known_ids, frame_queue, result_queue, stop_event):
    """Runs in a separate process. Frames arrive already scaled."""
    multiplier = 1.0 / SCALE_FACTOR

    while not stop_event.is_set():
        try:
            small_rgb = frame_queue.get(timeout=0.1)
        except Exception:
            continue

        locs = face_recognition.face_locations(small_rgb, number_of_times_to_upsample=1, model="cnn")
        encs = face_recognition.face_encodings(small_rgb, locs)

        boxes, recognized_ids = [], []
        for (top, right, bottom, left), enc in zip(locs, encs):
            top    = int(top    * multiplier)
            right  = int(right  * multiplier)
            bottom = int(bottom * multiplier)
            left   = int(left   * multiplier)

            name, color = "Unknown", (0, 0, 255)
            if known_encodings:
                distances  = face_recognition.face_distance(known_encodings, enc)
                best_idx   = int(np.argmin(distances))
                if distances[best_idx] <= TOLERANCE:
                    student_id = known_ids[best_idx]
                    name, color = str(student_id), (0, 255, 0)
                    recognized_ids.append(student_id)

            boxes.append((left, top, right, bottom, name, color))

        if not result_queue.empty():
            try: result_queue.get_nowait()
            except: pass
        result_queue.put((boxes, recognized_ids))


def detect_cameras():
    available = []
    for i in range(CAMERA_START, CAMERA_START + MAX_CAMERAS):
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
        if cap.isOpened():
            available.append(i)
            cap.release()
        else:
            cap.release()
            break
    if not available:
        print("[ERROR] No cameras found.", flush=True)
    else:
        print(f"[INFO] Detected {len(available)} camera(s): indices {available}", flush=True)
    return available


def run_attendance_system(module_code, duration_minutes, selected_cameras=None):
    session_id = create_session_entry(module_code, duration_minutes)
    if not session_id: return

    if selected_cameras is not None:
        camera_indices = selected_cameras
    else:
        camera_indices = detect_cameras()

    if not camera_indices:
        print("[ERROR] No cameras available. Exiting.", flush=True)
        return

    print(f"[START] Session {session_id} | Module {module_code} | {len(camera_indices)} camera(s)", flush=True)

    known_encodings, known_ids = load_known_faces()

    logger     = AttendanceLogger()
    cameras    = [CameraStream(idx) for idx in camera_indices]

    frame_queues  = [mp.Queue(maxsize=1) for _ in camera_indices]
    result_queues = [mp.Queue(maxsize=1) for _ in camera_indices]
    stop_event    = mp.Event()

    ai_procs = [
        mp.Process(
            target=ai_process_fn,
            args=(known_encodings, known_ids, fq, rq, stop_event),
            daemon=True
        )
        for fq, rq in zip(frame_queues, result_queues)
    ]
    for p in ai_procs:
        p.start()

    last_boxes   = [[] for _ in cameras]
    fps_counters = [0]  * len(cameras)
    fps_times    = [time.time()] * len(cameras)
    fps_displays = [0]  * len(cameras)

    cooldown   = {}
    start_time = time.time()

    try:
        while True:
            elapsed = time.time() - start_time

            if duration_minutes > 0 and elapsed / 60 >= duration_minutes:
                print("[TIME UP] Session duration reached.", flush=True)
                break

            for i, (camera, fq, rq) in enumerate(zip(cameras, frame_queues, result_queues)):
                ret, frame = camera.read()
                if not ret or frame is None:
                    continue

                small     = cv2.resize(frame, (0, 0), fx=SCALE_FACTOR, fy=SCALE_FACTOR)
                small_rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

                if not fq.empty():
                    try: fq.get_nowait()
                    except: pass
                try:
                    fq.put_nowait(small_rgb)
                except:
                    pass

                try:
                    boxes, recognized_ids = rq.get_nowait()
                    last_boxes[i] = boxes

                    now = time.time()
                    for student_id in recognized_ids:
                        if now - cooldown.get(student_id, 0) >= LOG_INTERVAL:
                            logger.log(session_id, student_id)
                            cooldown[student_id] = now
                except:
                    pass

                fps_counters[i] += 1
                if time.time() - fps_times[i] >= 1.0:
                    fps_displays[i] = fps_counters[i]
                    fps_counters[i] = 0
                    fps_times[i]    = time.time()

                for (left, top, right, bottom, name, color) in last_boxes[i]:
                    cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                    cv2.putText(frame, name, (left, top - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

                fh = frame.shape[0]
                if duration_minutes > 0:
                    remaining  = max(0, duration_minutes * 60 - elapsed)
                    mins, secs = int(remaining // 60), int(remaining % 60)
                    timer_text = f"Time Left: {mins:02d}:{secs:02d}"
                else:
                    mins, secs = int(elapsed // 60), int(elapsed % 60)
                    timer_text = f"Elapsed: {mins:02d}:{secs:02d}"

                cv2.rectangle(frame, (10, fh - 90), (300, fh - 10), (0, 0, 0), -1)
                cv2.putText(frame, f"Cam {camera_indices[i]} | FPS: {fps_displays[i]}", (20, fh - 66),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
                cv2.putText(frame, timer_text, (20, fh - 42),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
                cv2.putText(frame, "Press 'Q' to stop session", (20, fh - 18),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

                disp_h     = int(frame.shape[0] * DISPLAY_WIDTH / frame.shape[1])
                disp_frame = cv2.resize(frame, (DISPLAY_WIDTH, disp_h))
                cv2.imshow(f'Attendance - {module_code} - Cam {camera_indices[i]}', disp_frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("[STOP] User pressed Q.", flush=True)
                break

    except Exception as e:
        print(f"[CRITICAL ERROR] {e}", flush=True)
    finally:
        print("[INFO] Closing session...", flush=True)
        stop_event.set()
        for p in ai_procs:
            p.join(timeout=3)
        for camera in cameras:
            camera.stop()
        if session_id:
            close_session_in_db(session_id)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    mp.freeze_support()
    if len(sys.argv) < 3:
        sys.exit(1)
    selected = None
    if len(sys.argv) >= 4 and sys.argv[3] != 'all':
        selected = [int(x) for x in sys.argv[3].split(',')]
    run_attendance_system(sys.argv[1], int(sys.argv[2]), selected)
