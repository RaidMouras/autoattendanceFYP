import cv2
import face_recognition
import mysql.connector
import pickle
import time
from db_connection import create_db_connection

def save_encoding_to_db(student_id, encoding):
    conn = create_db_connection()
    if conn is None:
        return

    try:
        cursor = conn.cursor()
        encoding_blob = pickle.dumps(encoding)
        
        # INSERT into the NEW child table
        sql = "INSERT INTO Face_Encodings (student_id, face_encoding) VALUES (%s, %s)"
        val = (student_id, encoding_blob)
        
        cursor.execute(sql, val)
        conn.commit()
        print(f"   --> Saved vector for {student_id}")
        
    except mysql.connector.Error as err:
        print(f"Database Error: {err}")
    finally:
        cursor.close()
        conn.close()

def register_student_multi_angle(student_id, first_name, last_name):
    # 1. First, ensure the student exists in the parent table
    conn = create_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            # Check if student exists
            cursor.execute("SELECT * FROM Students WHERE Student_ID = %s", (student_id,))
            result = cursor.fetchone()
            
            if not result:
                # Create the student record first (without encoding)
                print(f"🆕 Creating record for {first_name} {last_name}...")
                sql = "INSERT INTO Students (Student_ID, First_Name, Last_Name) VALUES (%s, %s, %s)"
                cursor.execute(sql, (student_id, first_name, last_name))
                conn.commit()
            else:
                print(f"ℹ️  Adding more angles to existing student: {first_name} {last_name}")
            
            cursor.close()
            conn.close()
        except mysql.connector.Error as err:
            print(f"❌ Database Error: {err}")
            return

    # 2. Start Capture Loop
    video_capture = cv2.VideoCapture(0)
    print("\n--- MULTI-ANGLE ENROLLMENT ---")
    print(" We need 5 photos: Front, Left, Right, Up, Down.")
    print(" Press 's' to SNAP a photo.")
    print(" Press 'q' to FINISH.")

    captured_count = 0

    while True:
        ret, frame = video_capture.read()
        if not ret:
            break

        cv2.imshow('Enrollment - Press S to Snap, Q to Quit', frame)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('s'):
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Using CNN (GPU) for highest accuracy during enrollment
            boxes = face_recognition.face_locations(rgb_frame, model="cnn")
            
            if len(boxes) == 0:
                print("⚠️ No face detected.")
            elif len(boxes) > 1:
                print("⚠️ Multiple faces! Ensure only one person is in frame.")
            else:
                encoding = face_recognition.face_encodings(rgb_frame, boxes)[0]
                save_encoding_to_db(student_id, encoding)
                captured_count += 1
                print(f"📸 Capture {captured_count} successful!")

        elif key == ord('q'):
            break

    video_capture.release()
    cv2.destroyAllWindows()
    print(f"✅ Finished. Total angles saved: {captured_count}")

if __name__ == "__main__":
    s_id = input("Enter Student ID: ")
    f_name = input("Enter First Name: ")
    l_name = input("Enter Last Name: ")
    
    register_student_multi_angle(s_id, f_name, l_name)