"""
web_attendance_taker.py (v13.0)
--------------------------------
- AI detection runs in a separate PROCESS (bypasses GIL entirely)
- Camera thread reads frames continuously
- Display loop runs at full camera FPS
- Per-student cooldown logging
- Live countdown / elapsed timer overlay
- Graceful shutdown on duration expiry or 'Q' key press
"""

import sys
import time
import cv2
import face_recognition
import pickle
import threading
import multiprocessing as mp
from datetime import datetime, timedelta
from db_connection import create_db_connection

# --- CONFIGURATION ---
LOG_INTERVAL  = 10    # Seconds between re-logging the same student
TOLERANCE     = 0.5   # Face match strictness (lower = stricter)
SCALE_FACTOR  = 0.5   # Resize for CNN detection


# ---------------------------------------------------------------------------
# DATABASE HELPERS
# ---------------------------------------------------------------------------

def create_session_entry(module_code, duration_minutes):
    conn = create_db_connection()
    if not conn: return None
    try:
        cursor = conn.cursor()
        start_time   = datetime.now()
        session_date = start_time.date()
        end_time     = start_time + timedelta(minutes=duration_minutes) if duration_minutes > 0 else None
        sql = "INSERT INTO sessions (Module_Code, Session_Date, Start_Time, End_Time, is_active) VALUES (%s, %s, %s, %s, 1)"
        cursor.execute(sql, (module_code, session_date, start_time, end_time))
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
        now = datetime.now()
        cursor.execute(
            "UPDATE sessions SET End_Time = %s, is_active = 0 WHERE Session_ID = %s",
            (now, session_id)
        )
        conn.commit()
        print(f"[SESSION] Session {session_id} closed at {now}", flush=True)
    except:
        pass
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


def mark_attendance(session_id, student_id):
    conn = create_db_connection()
    if not conn: return
    try:
        cursor = conn.cursor()
        now = datetime.now()
        cursor.execute(
            "INSERT INTO attendance_logs (Session_ID, Student_ID, Time_Seen, Status) VALUES (%s, %s, %s, %s)",
            (session_id, student_id, now, "Present")
        )
        conn.commit()
        print(f"[{now.strftime('%H:%M:%S')}] [LOGGED] Student {student_id} attendance recorded.", flush=True)
    except Exception as e:
        print(f"[DB INSERT ERROR] {e}", flush=True)
    finally:
        cursor.close()
        conn.close()


# ---------------------------------------------------------------------------
# AI PROCESS: runs in a separate process — completely separate GIL
# ---------------------------------------------------------------------------

def ai_process_fn(session_id, known_encodings, known_ids, frame_queue, result_queue, stop_event):
    cooldown   = {}
    multiplier = 1.0 / SCALE_FACTOR

    while not stop_event.is_set():
        try:
            frame = frame_queue.get(timeout=0.1)
        except Exception:
            continue

        small = cv2.resize(frame, (0, 0), fx=SCALE_FACTOR, fy=SCALE_FACTOR)
        rgb   = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

        locs = face_recognition.face_locations(rgb, number_of_times_to_upsample=0, model="cnn")
        encs = face_recognition.face_encodings(rgb, locs)

        boxes = []
        for (top, right, bottom, left), enc in zip(locs, encs):
            top    = int(top    * multiplier)
            right  = int(right  * multiplier)
            bottom = int(bottom * multiplier)
            left   = int(left   * multiplier)

            matches = face_recognition.compare_faces(known_encodings, enc, tolerance=TOLERANCE)
            name  = "Unknown"
            color = (0, 0, 255)

            if True in matches:
                student_id = known_ids[matches.index(True)]
                name  = str(student_id)
                color = (0, 255, 0)
                now = time.time()
                if now - cooldown.get(student_id, 0) >= LOG_INTERVAL:
                    mark_attendance(session_id, student_id)
                    cooldown[student_id] = now

            boxes.append((left, top, right, bottom, name, color))

        # Replace stale result
        if not result_queue.empty():
            try: result_queue.get_nowait()
            except Exception: pass
        result_queue.put(boxes)


# ---------------------------------------------------------------------------
# CAMERA THREAD: reads frames continuously so display loop never blocks
# ---------------------------------------------------------------------------

class CameraStream:
    def __init__(self, src):
        self.cap = cv2.VideoCapture(src)
        self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
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
                self.ret   = ret
                self.frame = frame

    def read(self):
        with self.lock:
            return self.ret, self.frame.copy() if self.frame is not None else (False, None)

    def stop(self):
        self.running = False
        self.thread.join()
        self.cap.release()


# ---------------------------------------------------------------------------
# MAIN LOOP
# ---------------------------------------------------------------------------

def run_attendance_system(module_code, duration_minutes):
    session_id = create_session_entry(module_code, duration_minutes)
    if not session_id: return

    print(f"[START] Camera launching for {module_code}...", flush=True)
    known_encodings, known_ids = load_known_faces()

    frame_queue  = mp.Queue(maxsize=1)
    result_queue = mp.Queue(maxsize=1)
    stop_event   = mp.Event()

    ai_proc = mp.Process(
        target=ai_process_fn,
        args=(session_id, known_encodings, known_ids, frame_queue, result_queue, stop_event),
        daemon=True
    )
    ai_proc.start()

    camera     = CameraStream(0)
    start_time = time.time()
    last_boxes = []
    fps_counter = 0
    fps_time    = time.time()
    fps_display = 0

    try:
        while True:
            elapsed = time.time() - start_time

            if duration_minutes > 0 and elapsed / 60 >= duration_minutes:
                print("[TIME UP] Session duration reached.", flush=True)
                break

            ret, frame = camera.read()
            if not ret or frame is None:
                continue

            # Feed latest frame to AI process (drop stale)
            if not frame_queue.empty():
                try: frame_queue.get_nowait()
                except Exception: pass
            try:
                frame_queue.put_nowait(frame.copy())
            except Exception:
                pass

            # Pick up latest CNN result if available
            try:
                last_boxes = result_queue.get_nowait()
            except Exception:
                pass

            # FPS counter
            fps_counter += 1
            if time.time() - fps_time >= 1.0:
                fps_display = fps_counter
                fps_counter = 0
                fps_time    = time.time()

            # Draw last known boxes on every frame
            for (left, top, right, bottom, name, color) in last_boxes:
                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                cv2.putText(frame, name, (left, top - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

            # Timer overlay
            fh = frame.shape[0]
            if duration_minutes > 0:
                remaining  = max(0, duration_minutes * 60 - elapsed)
                mins, secs = int(remaining // 60), int(remaining % 60)
                timer_text = f"Time Left: {mins:02d}:{secs:02d}"
            else:
                mins, secs = int(elapsed // 60), int(elapsed % 60)
                timer_text = f"Elapsed: {mins:02d}:{secs:02d}"

            cv2.rectangle(frame, (10, fh - 90), (280, fh - 10), (0, 0, 0), -1)
            cv2.putText(frame, f"FPS: {fps_display}", (20, fh - 66),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
            cv2.putText(frame, timer_text, (20, fh - 42),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
            cv2.putText(frame, "Press 'Q' to stop session", (20, fh - 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

            cv2.imshow(f'Attendance - {module_code}', frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("[STOP] User pressed Q.", flush=True)
                break

    except Exception as e:
        print(f"[CRITICAL ERROR] {e}", flush=True)
    finally:
        print("[INFO] Closing session...", flush=True)
        stop_event.set()
        ai_proc.join(timeout=3)
        camera.stop()
        if session_id:
            close_session_in_db(session_id)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    mp.freeze_support()
    if len(sys.argv) < 3:
        sys.exit(1)
    run_attendance_system(sys.argv[1], int(sys.argv[2]))
