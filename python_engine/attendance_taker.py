import time
import cv2
import face_recognition
import mysql.connector
import pickle
from datetime import datetime, timedelta
from db_connection import create_db_connection

CHECK_INTERVAL = 60
CAMERA_INDEX = 1
UPSAMPLE_TIMES = 1
TOLERANCE = 0.5

def load_known_faces():
    """
    Connects to the DB and loads the 128-d face vectors into memory.
    This runs once at startup to make real-time recognition fast.
    """
    print("📂 Loading student database...")
    known_encodings = []
    known_ids = []

    conn = create_db_connection()
    if conn:
        cursor = conn.cursor()

        cursor.execute("SELECT student_id, face_encoding FROM Face_Encodings")
        rows = cursor.fetchall()

        for r in rows:
            student_id = r[0]
            blob_data = r[1]

            encoding = pickle.loads(blob_data)

            known_encodings.append(encoding)
            known_ids.append(student_id)

        print(f"✅ Loaded {len(known_encodings)} face vectors for {len(set(known_ids))} unique students.")
        conn.close()

    return known_encodings, known_ids

def get_active_session():
    """
    Polls the 'sessions' table to see if a class should be recorded right now.
    """
    conn = create_db_connection()
    if conn:
        cursor = conn.cursor(dictionary=True)

        query = """
        SELECT * FROM sessions
        WHERE is_active = 1
        OR (NOW() BETWEEN Start_Time AND End_Time)
        LIMIT 1
        """
        cursor.execute(query)
        session = cursor.fetchone()
        conn.close()
        return session
    return None

def log_presence(session_id, student_ids):
    """
    Inserts a 'Ping' into the log table for every student seen.
    Does not calculate 'Present'/'Late' here; just dumps raw timestamps.
    """
    if not student_ids:
        return

    conn = create_db_connection()
    if conn:
        cursor = conn.cursor()
        now = datetime.now()

        sql = "INSERT INTO attendance_logs (Session_ID, Student_ID, Time_First_Seen, status) VALUES (%s, %s, %s, 'Present')"

        val = [(session_id, s_id, now) for s_id in student_ids]

        try:
            cursor.executemany(sql, val)
            conn.commit()
            print(f"   ✅ Logged {len(student_ids)} students at {now.strftime('%H:%M:%S')}")
        except mysql.connector.Error as err:
            print(f"   ⚠️ Database Error: {err}")

        conn.close()

def run_continuous_system():
    known_encodings, known_ids = load_known_faces()

    print("⏳ SYSTEM STANDBY: Waiting for class to start...")

    while True:
        session = get_active_session()

        if not session:
            time.sleep(10)
            continue

        print(f"🚀 CLASS STARTED: {session.get('module_code', 'Unknown')} (Session ID: {session['Session_ID']})")

        video_capture = cv2.VideoCapture(CAMERA_INDEX)
        video_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        video_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)

        if not video_capture.isOpened():
             print(f"⚠️ Error: Could not open camera {CAMERA_INDEX}. Trying index 0...")
             video_capture = cv2.VideoCapture(0)

        while True:
            current_session = get_active_session()
            curr_id = current_session['Session_ID'] if current_session else -1

            if not current_session or curr_id != session['Session_ID']:
                print("🛑 Class Ended. Returning to Standby.")
                break

            start_loop = time.time()

            ret, frame = video_capture.read()
            if ret:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                face_locations = face_recognition.face_locations(rgb_frame, number_of_times_to_upsample=UPSAMPLE_TIMES, model="cnn")
                face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

                found_students = []

                for face_encoding in face_encodings:
                    matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=TOLERANCE)

                    if True in matches:
                        first_match_index = matches.index(True)
                        student_id = known_ids[first_match_index]
                        found_students.append(student_id)

                log_presence(session['Session_ID'], list(set(found_students)))

            elapsed = time.time() - start_loop
            sleep_time = max(0, CHECK_INTERVAL - elapsed)

            if sleep_time > 0:
                time.sleep(sleep_time)

        video_capture.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    run_continuous_system()
