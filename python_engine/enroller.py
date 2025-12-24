import cv2
import face_recognition
import mysql.connector
import pickle
import sys
from db_connection import create_db_connection

def register_student(student_id, first_name, last_name):
    # 1. Open the Webcam
    print(f"📷 Opening Webcam for {first_name} {last_name} ({student_id})...")
    video_capture = cv2.VideoCapture(0)
    
    if not video_capture.isOpened():
        print("❌ Error: Could not open webcam.")
        return

    print("🟢 Look at the camera. Press 's' to SNAP and SAVE. Press 'q' to QUIT.")

    while True:
        ret, frame = video_capture.read()
        if not ret:
            break

        # Show the video
        cv2.imshow('Register Student - Press S to Save', frame)

        key = cv2.waitKey(1) & 0xFF

        # If user presses 's' (Snap)
        if key == ord('s'):
            print("📸 Capturing image...")
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Detect faces
            boxes = face_recognition.face_locations(rgb_frame)
            
            if len(boxes) == 0:
                print("⚠️ No face detected! Try again.")
                continue
            elif len(boxes) > 1:
                print("⚠️ Multiple faces detected! Only one person allowed.")
                continue
            
            # Encode face
            face_encoding = face_recognition.face_encodings(rgb_frame, boxes)[0]
            
            # Save to DB
            save_to_db(student_id, first_name, last_name, face_encoding)
            break

        elif key == ord('q'):
            print("🚫 Cancelled.")
            break

    video_capture.release()
    cv2.destroyAllWindows()

def save_to_db(student_id, first_name, last_name, encoding):
    conn = create_db_connection()
    if conn is None:
        return

    try:
        cursor = conn.cursor()
        # Convert array to binary for storage
        encoding_blob = pickle.dumps(encoding)
        
        sql = "INSERT INTO Students (Student_ID, First_Name, Last_Name, Face_Encoding) VALUES (%s, %s, %s, %s)"
        val = (student_id, first_name, last_name, encoding_blob)
        
        cursor.execute(sql, val)
        conn.commit()
        print(f"🎉 SUCCESS! {first_name} {last_name} has been registered in the database.")
        
    except mysql.connector.Error as err:
        print(f"❌ Database Error: {err}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    print("--- NEW STUDENT REGISTRATION ---")
    s_id = input("Enter Student ID (e.g., S01): ")
    f_name = input("Enter First Name: ")
    l_name = input("Enter Last Name: ")
    
    register_student(s_id, f_name, l_name)