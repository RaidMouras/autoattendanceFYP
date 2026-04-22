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
    conn = create_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM Students WHERE Student_ID = %s", (student_id,))
            result = cursor.fetchone()

            if not result:
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

def enroll_student_in_module(student_id, module_code):
    conn = create_db_connection()
    if conn:
        try:
            cursor = conn.cursor()
            sql = "INSERT INTO enrollment (Student_ID, Module_Code) VALUES (%s, %s)"
            cursor.execute(sql, (student_id, module_code))
            conn.commit()
            print(f"✅ Successfully enrolled {student_id} in {module_code}")
        except mysql.connector.Error as err:
            print(f"⚠️ Enrollment Error: {err}")
        finally:
            cursor.close()
            conn.close()

if __name__ == "__main__":
    s_id = input("Enter Student ID: ")
    f_name = input("Enter First Name: ")
    l_name = input("Enter Last Name: ")

    register_student_multi_angle(s_id, f_name, l_name)

    link_mod = input("\nDo you want to enroll them in a module now? (y/n): ")
    if link_mod.lower() == 'y':
        mod_code = input("Enter Module Code (e.g. CS2323): ")
        enroll_student_in_module(s_id, mod_code)
