import cv2
import face_recognition
import mysql.connector
import pickle
import sys
import time
from datetime import datetime, date
from db_connection import create_db_connection

# --- CONFIGURATION ---
UNKNOWN_COOLDOWN_SECONDS = 10  # Wait 10 seconds before logging the same unknown person again

def mark_attendance(student_id, first_name, last_name):
    """
    Marks a KNOWN student as present. 
    Only marks them once per day.
    """
    conn = create_db_connection()
    if conn is None:
        return

    try:
        cursor = conn.cursor()
        today = date.today()
        
        # 1. Check if already present TODAY
        check_sql = """
        SELECT * FROM attendance_logs 
        WHERE student_id = %s AND DATE(Time_first_seen) = %s
        """
        cursor.execute(check_sql, (student_id, today))
        result = cursor.fetchall()
        
        if result:
            # Already marked today - do nothing
            return False
        else:
            # 2. Mark as Present
            now = datetime.now()
            insert_sql = """
            INSERT INTO attendance_logs (session_id, student_id, Time_first_seen, status) 
            VALUES (1, %s, %s, 'Present')
            """
            cursor.execute(insert_sql, (student_id, now))
            conn.commit()
            print(f"✅ ATTENDANCE MARKED for {first_name} {last_name} (ID: {student_id}) at {now.strftime('%H:%M:%S')}")
            return True

    except mysql.connector.Error as err:
        print(f"❌ Database Error: {err}")
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

def log_unknown_visitor():
    """
    Logs an UNKNOWN visitor.
    Does not check for duplicates (handled by Python cooldown timer).
    """
    conn = create_db_connection()
    if conn is None:
        return

    try:
        cursor = conn.cursor()
        now = datetime.now()
        
        # Insert with NULL student_id and status 'Unknown'
        insert_sql = """
        INSERT INTO attendance_logs (session_id, student_id, Time_first_seen, status) 
        VALUES (1, NULL, %s, 'Unknown Visitor')
        """
        cursor.execute(insert_sql, (now,))
        conn.commit()
        print(f"⚠️ UNKNOWN VISITOR logged at {now.strftime('%H:%M:%S')}")

    except mysql.connector.Error as err:
        print(f"❌ Database Error: {err}")
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

def load_known_faces():
    print("🔄 Loading known faces from database...")
    known_encodings = []
    known_ids = []
    known_names = []

    conn = create_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            # JOIN query to get Name from Students and Encoding from Face_Encodings
            sql = """
            SELECT s.Student_ID, s.First_Name, s.Last_Name, f.face_encoding 
            FROM Students s
            JOIN Face_Encodings f ON s.Student_ID = f.student_id
            """
            cursor.execute(sql)
            rows = cursor.fetchall()
            
            for row in rows:
                student_id = row[0]
                first_name = row[1]
                last_name = row[2]
                encoding_blob = row[3]
                
                encoding = pickle.loads(encoding_blob)
                
                known_encodings.append(encoding)
                known_ids.append(student_id)
                known_names.append((first_name, last_name))
            
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"❌ Error loading faces: {e}")
            return [], [], []
    
    print(f"✅ Loaded {len(known_encodings)} face vector(s) for {len(set(known_ids))} unique student(s).")
    return known_encodings, known_ids, known_names

def run_attendance_system():
    # 1. Load Data
    known_encodings, known_ids, known_names = load_known_faces()
    
    # 2. Open Camera
    video_capture = cv2.VideoCapture(0)
    print("📷 Camera Active. Looking for faces... (Press 'q' to Quit)")

    # Timer for unknown visitors so we don't spam the DB
    last_unknown_log_time = 0

    while True:
        ret, frame = video_capture.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        face_locations = face_recognition.face_locations(rgb_frame, model="cnn")
        face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

        for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
            
            matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=0.5)
            name = "Unknown"
            color = (0, 0, 255) # Red for unknown

            if True in matches:
                # --- KNOWN STUDENT ---
                first_match_index = matches.index(True)
                student_id = known_ids[first_match_index]
                first_name, last_name = known_names[first_match_index]
                
                name = f"{first_name} {last_name}"
                color = (0, 255, 0) # Green

                # Mark Attendance (Function checks if already marked today)
                mark_attendance(student_id, first_name, last_name)

            else:
                # --- UNKNOWN VISITOR ---
                current_time = time.time()
                
                # Only log if cooldown has passed
                if current_time - last_unknown_log_time > UNKNOWN_COOLDOWN_SECONDS:
                    log_unknown_visitor()
                    last_unknown_log_time = current_time

            # Draw box and label
            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            cv2.putText(frame, name, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2)

        cv2.imshow('Auto Attendance System', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    video_capture.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_attendance_system()