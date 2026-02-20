"""
web_attendance_taker.py (v5.0 - GPU + Threaded / Zero Lag)
----------------------------------------------------------
UPDATES:
1. GPU UNLOCKED: Uses `model="cnn"` to leverage your RTX 1000 Ada.
2. MULTITHREADING: Video loop runs separately from AI loop. Video never freezes.
3. TESTING: Interval set to 10 seconds for rapid DB testing.
"""

import sys
import time
import cv2
import face_recognition
import pickle
import threading
import queue
from datetime import datetime, timedelta
from db_connection import create_db_connection

# --- CONFIGURATION ---
CHECK_INTERVAL = 10   # Log attendance every 10 seconds (Testing mode)
TOLERANCE = 0.5       # Strictness (Lower = stricter)
SCALE_FACTOR = 0.5    # 0.5 = Half Size (Balances Range vs Speed)

# --- SHARED STATE (Between Threads) ---
# These variables let the Video Player and the AI Brain talk to each other without pausing
frame_queue = queue.Queue(maxsize=1)  # Holds the latest frame for the AI to process
result_queue = queue.Queue(maxsize=1) # Holds the latest AI results (boxes, names)
stop_event = threading.Event()        # Signal to stop all threads cleanly

def create_session_entry(module_code, duration_minutes):
    """Creates a new session in the DB."""
    conn = create_db_connection()
    if not conn:
        print("[ERROR] Could not connect to DB to create session.", flush=True)
        return None
    try:
        cursor = conn.cursor()
        start_time = datetime.now()
        session_date = start_time.date() 
        end_time = None
        
        if duration_minutes > 0:
            end_time = start_time + timedelta(minutes=duration_minutes)

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
    """Updates the session end time when stopped."""
    conn = create_db_connection()
    if not conn: return
    try:
        cursor = conn.cursor()
        now = datetime.now()
        sql = "UPDATE sessions SET End_Time = %s, is_active = 0 WHERE Session_ID = %s"
        cursor.execute(sql, (now, session_id))
        conn.commit()
        print(f"[SESSION] Session {session_id} closed at {now}", flush=True)
    except Exception as e:
        print(f"[DB ERROR] Failed to close session: {e}", flush=True)
    finally:
        cursor.close()
        conn.close()

def load_known_faces():
    """Load students from DB into memory."""
    print("[INFO] Loading student database...", flush=True)
    known_encodings = []
    known_ids = []
    conn = create_db_connection()
    if conn:
        cursor = conn.cursor()
        cursor.execute("SELECT student_id, face_encoding FROM Face_Encodings")
        rows = cursor.fetchall()
        for r in rows:
            s_id = r[0]
            blob = r[1]
            if blob:
                try:
                    encoding = pickle.loads(blob)
                    known_encodings.append(encoding)
                    known_ids.append(s_id)
                except:
                    pass
        cursor.close()
        conn.close()
    
    unique_students = len(set(known_ids))
    print(f"[INFO] Loaded {unique_students} unique students ({len(known_ids)} total face prints).", flush=True)
    return known_encodings, known_ids

def mark_attendance(session_id, student_id, status="Present"):
    """Insert log into DB."""
    conn = create_db_connection()
    if not conn: return
    try:
        cursor = conn.cursor()
        now = datetime.now()
        timestamp_str = now.strftime('%H:%M:%S')
        
        sql = "INSERT INTO attendance_logs (Session_ID, Student_ID, Time_Seen, Status) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (session_id, student_id, now, status))
        conn.commit()
        print(f"[{timestamp_str}] [SUCCESS] >>> Logged {student_id} to Database.", flush=True)
    except Exception as e:
        print(f"[DB INSERT ERROR] Could not save log: {e}", flush=True)
    finally:
        cursor.close()
        conn.close()

# --- WORKER THREAD: The AI Brain ---
def ai_processing_thread(session_id, known_encodings, known_ids):
    """
    Runs in background on the GPU.
    1. Grabs latest frame from queue.
    2. Processes it using the CNN model.
    3. Puts results (boxes, names) into result queue.
    """
    last_log_time = {}

    while not stop_event.is_set():
        try:
            # Get latest frame (Wait up to 0.1s so we don't block forever)
            frame = frame_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        # Resize for speed
        small_frame = cv2.resize(frame, (0, 0), fx=SCALE_FACTOR, fy=SCALE_FACTOR)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

        # --- GPU FIX: model="cnn" ---
        face_locations = face_recognition.face_locations(rgb_small_frame, model="cnn")
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        face_names = []
        for face_encoding in face_encodings:
            matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=TOLERANCE)
            name = "Unknown"

            if True in matches:
                first_match_index = matches.index(True)
                student_id = known_ids[first_match_index]
                name = student_id
                
                # Check DB Log Timer
                current_time = time.time()
                time_since_last = current_time - last_log_time.get(student_id, 0)
                
                if time_since_last > CHECK_INTERVAL:
                    time_str = datetime.now().strftime('%H:%M:%S')
                    print(f"[{time_str}] [DETECTED] {student_id} recognized! Attempting save...", flush=True)
                    mark_attendance(session_id, student_id)
                    last_log_time[student_id] = current_time

            face_names.append(name)
        
        # Send results back to main thread
        # Remove old result if exists (we only want the freshest)
        if not result_queue.empty():
            try: result_queue.get_nowait()
            except queue.Empty: pass
            
        result_queue.put((face_locations, face_names))


# --- MAIN THREAD: The Video Player ---
def run_attendance_system(module_code, duration_minutes):
    session_id = create_session_entry(module_code, duration_minutes)
    if not session_id:
        print("[CRITICAL] Cannot run without valid Session ID.", flush=True)
        return

    print(f"[START] Camera Launching for {module_code}...", flush=True)
    known_encodings, known_ids = load_known_faces()

    # Start AI Thread
    ai_thread = threading.Thread(target=ai_processing_thread, args=(session_id, known_encodings, known_ids))
    ai_thread.daemon = True # Kills thread if main program exits
    ai_thread.start()

    video_capture = cv2.VideoCapture(0)
    if not video_capture.isOpened():
        print("[ERROR] Could not open camera.", flush=True)
        return

    start_time = time.time()
    
    # Store the last known faces to draw while waiting for new updates
    current_locations = []
    current_names = []

    try:
        while True:
            # Check Duration
            if duration_minutes > 0:
                elapsed_minutes = (time.time() - start_time) / 60
                if elapsed_minutes >= duration_minutes:
                    print("[TIME UP] Session duration reached.", flush=True)
                    break

            ret, frame = video_capture.read()
            if not ret: break

            # 1. SEND FRAME TO AI (Non-Blocking)
            # If the queue is full (AI is busy processing), we just skip sending this frame.
            # This ensures the video never waits for the AI.
            if not frame_queue.full():
                frame_queue.put(frame)

            # 2. CHECK FOR NEW RESULTS
            try:
                # If AI finished a frame, update our boxes
                (new_locs, new_names) = result_queue.get_nowait()
                current_locations = new_locs
                current_names = new_names
            except queue.Empty:
                pass # No new data yet, keep drawing the old boxes

            # 3. DRAW (Using Scale Factor)
            multiplier = int(1 / SCALE_FACTOR)
            for (top, right, bottom, left), name in zip(current_locations, current_names):
                top *= multiplier; right *= multiplier; bottom *= multiplier; left *= multiplier
                
                color = (0, 255, 0) if name != "Unknown" else (0, 0, 255)
                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                cv2.putText(frame, name, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

            # UI Overlay
            cv2.rectangle(frame, (10, frame.shape[0] - 40), (250, frame.shape[0] - 10), (0, 0, 0), -1)
            cv2.putText(frame, "Press 'Q' to Stop Session", (20, frame.shape[0] - 20), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            cv2.imshow(f'Attendance - {module_code}', frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("[STOP] User pressed Q.", flush=True)
                break

    except Exception as e:
        print(f"[CRITICAL ERROR] {e}", flush=True)

    finally:
        print("[INFO] Closing Session...", flush=True)
        stop_event.set() # Tell AI thread to stop
        if session_id:
            close_session_in_db(session_id)
        video_capture.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python web_attendance_taker.py <ModuleCode> <DurationMinutes>", flush=True)
        sys.exit(1)
        
    mod_code = sys.argv[1]
    duration = int(sys.argv[2]) 
    
    run_attendance_system(mod_code, duration)