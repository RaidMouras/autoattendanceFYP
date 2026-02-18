"""
web_attendance_taker.py
-----------------------
Launched by the Website to run the attendance session.

FEATURES:
1. Creates a Session in MySQL (Populates Session_Date, Start_Time, etc.)
2. Updates the Session's End_Time when closed.
3. Optimized with 'Frame Skipping' and 'Quarter Sizing'.
4. Logs attendance every 2 minutes.
"""

import sys
import time
import cv2
import face_recognition
import pickle
import numpy as np
from datetime import datetime, timedelta
from db_connection import create_db_connection

# --- CONFIGURATION ---
CHECK_INTERVAL = 120 # Log attendance every 2 minutes (120 seconds)
TOLERANCE = 0.5      # Strictness (Lower is stricter)
FRAME_SKIP = 5       # Run AI only every 5 frames to fix lag

def create_session_entry(module_code, duration_minutes):
    """
    Creates a new session in the DB.
    - Sets Session_Date (Required by DB).
    - Sets Start_Time and End_Time.
    Returns the Session_ID.
    """
    conn = create_db_connection()
    if not conn:
        print("[ERROR] Could not connect to DB to create session.", flush=True)
        return None

    try:
        cursor = conn.cursor()
        start_time = datetime.now()
        session_date = start_time.date() 
        end_time = None
        
        # Calculate Expected End Time
        if duration_minutes > 0:
            end_time = start_time + timedelta(minutes=duration_minutes)

        # FIXED SQL: Includes Session_Date and 4 placeholders (%s)
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
    """
    Updates the session when it stops.
    """
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
    return known_encodings, known_ids

def mark_attendance(session_id, student_id, status="Present"):
    """Insert log into DB."""
    conn = create_db_connection()
    if not conn: return

    try:
        cursor = conn.cursor()
        now = datetime.now()
        
        sql = "INSERT INTO attendance_logs (Session_ID, Student_ID, Time_Seen, Status) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (session_id, student_id, now, status))
        conn.commit()
        print(f"[LOG] Marked {student_id} as {status}", flush=True)
        
    except Exception as e:
        # Ignore duplicates
        pass 
    finally:
        cursor.close()
        conn.close()

def run_attendance_system(module_code, duration_minutes):
    # 1. CREATE SESSION IN DB
    session_id = create_session_entry(module_code, duration_minutes)
    if not session_id:
        print("[CRITICAL] Cannot run without valid Session ID.", flush=True)
        return

    print(f"[START] Starting Attendance for {module_code}", flush=True)
    
    known_encodings, known_ids = load_known_faces()

    # Open Camera
    video_capture = cv2.VideoCapture(0)
    
    start_time = time.time()
    last_log_time = {} 
    
    frame_count = 0
    face_locations = []
    face_names = []

    try:
        while True:
            # 1. CHECK DURATION
            if duration_minutes > 0:
                elapsed_minutes = (time.time() - start_time) / 60
                if elapsed_minutes >= duration_minutes:
                    print("[TIME UP] Session duration reached. Closing.", flush=True)
                    break

            ret, frame = video_capture.read()
            if not ret: break

            # 2. FRAME SKIPPING (Run AI only every 5th frame)
            if frame_count % FRAME_SKIP == 0:
                
                # Resize for speed
                small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
                rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                
                face_locations = face_recognition.face_locations(rgb_small_frame)
                face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

                face_names = []
                for face_encoding in face_encodings:
                    matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=TOLERANCE)
                    name = "Unknown"
                    
                    if True in matches:
                        first_match_index = matches.index(True)
                        student_id = known_ids[first_match_index]
                        name = student_id
                        
                        current_time = time.time()
                        if student_id not in last_log_time or (current_time - last_log_time[student_id] > CHECK_INTERVAL):
                            mark_attendance(session_id, student_id)
                            last_log_time[student_id] = current_time
                    
                    face_names.append(name)

            frame_count += 1

            # 3. DRAW RESULTS
            for (top, right, bottom, left), name in zip(face_locations, face_names):
                # Scale back up by 4
                top *= 4; right *= 4; bottom *= 4; left *= 4
                
                color = (0, 255, 0) if name != "Unknown" else (0, 0, 255)
                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                cv2.putText(frame, name, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

            cv2.imshow(f'Attendance - {module_code}', frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("[STOP] User pressed Q.", flush=True)
                break

    except Exception as e:
        print(f"[CRITICAL ERROR] {e}", flush=True)

    finally:
        print("[INFO] Closing Session and updating End Time...", flush=True)
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