import sys
import time
import cv2
import face_recognition
import pickle
import numpy as np
from datetime import datetime
from db_connection import create_db_connection

# --- CONFIGURATION ---
CHECK_INTERVAL = 5   # How often to save to DB (seconds) - prevents spamming
TOLERANCE = 0.5      # Stricter than default (0.6)

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
        
        # INSERT log entry
        sql = "INSERT INTO attendance_logs (Session_ID, Student_ID, Time_Seen, Status) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (session_id, student_id, now, status))
        conn.commit()
        print(f"[LOG] Marked {student_id} as {status}", flush=True)
        
    except Exception as e:
        # Ignore errors (like duplicate entry if you set unique constraints later)
        pass 
    finally:
        cursor.close()
        conn.close()

def run_attendance_system(module_code, duration_minutes):
    # DUMMY SESSION ID: In a real app, you would create a new Session row here.
    # For now, we use ID 1.
    session_id = 1 

    print(f"[START] Starting Attendance for {module_code}", flush=True)
    if duration_minutes > 0:
        print(f"[INFO] Auto-stop set for {duration_minutes} minutes.", flush=True)
    else:
        print(f"[INFO] Running Indefinitely (Press Q to stop).", flush=True)

    known_encodings, known_ids = load_known_faces()

    video_capture = cv2.VideoCapture(0)
    
    start_time = time.time()
    
    # Used to limit database writes
    last_log_time = {} 

    while True:
        # 1. CHECK DURATION
        if duration_minutes > 0:
            elapsed_minutes = (time.time() - start_time) / 60
            if elapsed_minutes >= duration_minutes:
                print("[TIME UP] Session duration reached. Closing.", flush=True)
                break

        ret, frame = video_capture.read()
        if not ret: break

        # 2. OPTIMIZATION: Quarter-Size Trick
        # Resize frame to 1/4 size for faster processing
        small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
        
        # 3. DETECT FACES
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        for face_encoding, face_loc in zip(face_encodings, face_locations):
            matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=TOLERANCE)
            name = "Unknown"
            
            if True in matches:
                first_match_index = matches.index(True)
                student_id = known_ids[first_match_index]
                name = student_id
                
                # 4. LOGGING LOGIC (Prevent Spam)
                current_time = time.time()
                if student_id not in last_log_time or (current_time - last_log_time[student_id] > CHECK_INTERVAL):
                    mark_attendance(session_id, student_id)
                    last_log_time[student_id] = current_time

            # 5. DRAW BOX (Scale x4 because we resized by 0.25)
            top, right, bottom, left = face_loc
            top *= 4; right *= 4; bottom *= 4; left *= 4
            
            color = (0, 255, 0) if name != "Unknown" else (0, 0, 255)
            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            cv2.putText(frame, name, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        cv2.imshow(f'Attendance - {module_code}', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("[STOP] User pressed Q.", flush=True)
            break

    video_capture.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    # Usage: python web_attendance_taker.py <Module> <Duration>
    if len(sys.argv) < 3:
        print("Usage: python web_attendance_taker.py <ModuleCode> <DurationMinutes>", flush=True)
        sys.exit(1)
        
    mod_code = sys.argv[1]
    duration = int(sys.argv[2]) 
    
    run_attendance_system(mod_code, duration)