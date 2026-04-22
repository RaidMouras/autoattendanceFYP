import cv2
import face_recognition
import mysql.connector
import pickle
import time
from datetime import datetime
from db_connection import create_db_connection

def mark_log(student_id, name, status_label):
    """
    Logs EITHER a known student OR an unknown visitor.
    """
    conn = create_db_connection()
    if conn is None:
        return

    try:
        cursor = conn.cursor()
        now = datetime.now()
        timestamp_str = now.strftime('%H:%M:%S')

        insert_sql = """
        INSERT INTO attendance_logs (session_id, student_id, Time_first_seen, status)
        VALUES (1, %s, %s, %s)
        """
        cursor.execute(insert_sql, (student_id, now, status_label))
        conn.commit()

        if student_id:
            print(f"✅ KNOWN: Marked {name} at {timestamp_str}")
        else:
            print(f"⚠️ UNKNOWN: Unknown user detected at {timestamp_str}")

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

def run_test_system():
    known_encodings, known_ids, known_names = load_known_faces()

    if not known_encodings:
        print("⚠️ No registered students found. System will only detect Unknowns.")

    video_capture = cv2.VideoCapture(0)
    print("🧪 TEST MODE ACTIVE: Logging Known AND Unknown users every 5 seconds.")
    print("📷 Press 'q' to Quit")

    last_known_time = 0
    last_unknown_time = 0
    cooldown_seconds = 5

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
            color = (0, 0, 255)

            current_time = time.time()

            if True in matches:
                first_match_index = matches.index(True)
                student_id = known_ids[first_match_index]
                first_name, last_name = known_names[first_match_index]
                name = f"{first_name} {last_name}"
                color = (0, 255, 0)

                if current_time - last_known_time > cooldown_seconds:
                    mark_log(student_id, name, 'Present')
                    last_known_time = current_time

            else:
                if current_time - last_unknown_time > cooldown_seconds:
                    mark_log(None, "Unknown", "Unknown Visitor")
                    last_unknown_time = current_time

            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
            cv2.putText(frame, name, (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2)

        cv2.imshow('TEST MODE - Security & Attendance', frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    video_capture.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_test_system()
