"""
enroller_web.py - Optimized for Speed & Accuracy.
- Uses "The Quarter-Size Trick" to speed up CNN detection by ~10x.
- Checks for GPU support at startup.
"""
import sys
import ctypes
import cv2
import face_recognition
import pickle
import numpy as np
import dlib # Imported to check for GPU
from db_connection import create_db_connection

WINDOW_TITLE = 'Enrollment - Press S to Snap, Q to Quit'

# --- 1. GPU CHECK ---
# This will print immediately so you know if you are using the graphics card.
try:
    using_cuda = dlib.DLIB_USE_CUDA
    print(f"[SYSTEM] Dlib using CUDA (GPU)? {using_cuda}", flush=True)
    if not using_cuda:
        print("[PERFORMANCE WARNING] Running on CPU. This will be slower, but the Resize Trick will help.", flush=True)
except:
    print("[SYSTEM] Could not verify CUDA status.", flush=True)

# Parse args from Node.js
if len(sys.argv) < 5:
    print("[ERROR] Missing arguments. Usage: python enroller_web.py <ID> <First> <Last> <Module> [cameraIndex]", flush=True)
    sys.exit(1)

student_id = sys.argv[1]
first_name = sys.argv[2]
last_name = sys.argv[3]
module_code = sys.argv[4]
camera_index = int(sys.argv[5]) if len(sys.argv) > 5 else 0

def bring_window_to_front():
    """On Windows, bring the OpenCV window to foreground so keypresses work."""
    if sys.platform == 'win32':
        try:
            user32 = ctypes.windll.user32
            hwnd = user32.FindWindowW(None, WINDOW_TITLE)
            if hwnd:
                user32.ShowWindow(hwnd, 9)
                user32.SetForegroundWindow(hwnd)
        except Exception:
            pass

def save_encoding_to_db(s_id, encoding):
    """Save a single face encoding to Face_Encodings table."""
    conn = create_db_connection()
    if conn is None:
        return
    try:
        cursor = conn.cursor()
        blob = pickle.dumps(encoding)
        cursor.execute("INSERT INTO Face_Encodings (student_id, face_encoding) VALUES (%s, %s)", (s_id, blob))
        conn.commit()
        print(f"   --> Saved vector for {s_id}", flush=True)
    except Exception as err:
        print(f"Database Error: {err}", flush=True)
    finally:
        cursor.close()
        conn.close()

def ensure_student_exists(s_id, f_name, l_name):
    """Create student record if it doesn't exist."""
    conn = create_db_connection()
    if not conn:
        return False
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM students WHERE Student_ID = %s", (s_id,))
        if not cursor.fetchone():
            print(f"Creating record for {f_name} {l_name}...", flush=True)
            cursor.execute("INSERT INTO students (Student_ID, First_Name, Last_Name) VALUES (%s, %s, %s)",
                           (s_id, f_name, l_name))
            conn.commit()
        else:
            print(f"Adding more angles to existing student: {f_name} {l_name}", flush=True)
        cursor.close()
        conn.close()
        return True
    except Exception as err:
        print(f"Database Error: {err}", flush=True)
        return False

def enroll_in_module(s_id, mod_code):
    """Link student to module in enrollment table."""
    conn = create_db_connection()
    if not conn:
        return
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM enrollment WHERE Student_ID = %s AND Module_Code = %s", (s_id, mod_code))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO enrollment (Student_ID, Module_Code) VALUES (%s, %s)", (s_id, mod_code))
            conn.commit()
            print(f"Enrolled {s_id} in {mod_code}", flush=True)
        cursor.close()
        conn.close()
    except Exception as err:
        print(f"Enrollment Error: {err}", flush=True)

def main():
    if not ensure_student_exists(student_id, first_name, last_name):
        sys.exit(1)

    video_capture = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
    
    if not video_capture.isOpened():
        print("[ERROR] Could not open webcam.", flush=True)
        sys.exit(1)

    print("\n--- MULTI-ANGLE ENROLLMENT ---", flush=True)
    print(" Press 's' to SNAP a photo.", flush=True)
    print(" Press 'q' to FINISH when done.", flush=True)
    print(" IMPORTANT: Click the camera window first so it has focus!\n", flush=True)

    captured_count = 0
    frame_shown = False

    while True:
        ret, frame = video_capture.read()
        if not ret:
            print("[ERROR] Failed to read frame from camera.", flush=True)
            break

        cv2.putText(frame, "S = SNAP | Q = QUIT", (20, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"Captured: {captured_count}/5", (20, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imshow(WINDOW_TITLE, frame)

        if not frame_shown:
            frame_shown = True
            bring_window_to_front()

        key = cv2.waitKey(1) & 0xFF

        if key == ord('s'):
            print("[INFO] Processing image... (Resizing for Speed)", flush=True)
            
            # 1. SCALE DOWN (0.5x size) — matches attendance system scale
            # 0.25x was too aggressive; angled faces became too small to detect
            small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)

            # 2. CONVERT & CLEAN
            # We process the SMALL frame, which is fast
            rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
            rgb_small_frame = np.ascontiguousarray(rgb_small_frame)

            try:
                # 3. DETECT FACES (on Small Frame)
                # This should now take 2-3 seconds on CPU instead of 25s
                small_boxes = face_recognition.face_locations(rgb_small_frame, model="cnn")
                
                if len(small_boxes) == 0:
                    print("[WARNING] No face detected. Please look at the camera.", flush=True)
                elif len(small_boxes) > 1:
                    print("[WARNING] Multiple faces! Ensure only the student is in frame.", flush=True)
                else:
                    # 4. SCALE UP COORDINATES
                    # Since we shrunk by 0.25, we multiply coordinates by 4 to get back to HD
                    top, right, bottom, left = small_boxes[0]
                    top *= 2
                    right *= 2
                    bottom *= 2
                    left *= 2
                    
                    # Store as a list of boxes (just one face)
                    hd_boxes = [(top, right, bottom, left)]

                    # 5. ENCODE (On FULL HD Frame)
                    # We use the original high-quality 'frame' for the actual biometric encoding
                    # This ensures we don't lose accuracy features!
                    rgb_hd_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    encoding = face_recognition.face_encodings(rgb_hd_frame, hd_boxes)[0]
                    
                    save_encoding_to_db(student_id, encoding)
                    captured_count += 1
                    print(f"[SUCCESS] Capture {captured_count} saved!", flush=True)
            
            except Exception as e:
                print(f"[ERROR] AI Error: {e}", flush=True)
                # Fallback logic removed for clarity, but resizing usually fixes the crash too.

        elif key == ord('q'):
            print("Closing camera...", flush=True)
            break

    video_capture.release()
    cv2.destroyAllWindows()

    if captured_count >= 1:
        enroll_in_module(student_id, module_code)
        print(f"Finished. Total angles saved: {captured_count}", flush=True)
        sys.exit(0)
    else:
        print("No photos captured. Enrollment cancelled.", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()