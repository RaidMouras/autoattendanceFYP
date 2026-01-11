import time
import cv2
import face_recognition
import mysql.connector
import pickle
from datetime import datetime, timedelta
from db_connection import create_db_connection

# --- CONFIGURATION SETTINGS ---
CHECK_INTERVAL = 60  # How often (in seconds) the system logs a 'present' entry.
CAMERA_INDEX = 1     # 0 = Laptop Webcam, 1 = External USB Camera.
UPSAMPLE_TIMES = 1   # 1 = Standard detection. Increase to 2 for better long-range detection (slower).
TOLERANCE = 0.5      # Strictness of face matching (0.6 is default, 0.5 is stricter).

# --- FUNCTION 1: LOAD FACES FROM DATABASE ---
def load_known_faces():
    """
    Connects to the DB and loads the 128-d face vectors into memory.
    This runs once at startup to make real-time recognition fast.
    """
    print("📂 Loading student database...")
    known_encodings = []
    known_ids = []
    
    conn = create_db_connection() # Open DB connection
    if conn:
        cursor = conn.cursor()
        
        # Select the ID and the binary face data (BLOB) from the specialized table
        cursor.execute("SELECT student_id, face_encoding FROM Face_Encodings")
        rows = cursor.fetchall()
        
        for r in rows:
            student_id = r[0]
            blob_data = r[1]
            
            # Convert the raw binary BLOB back into a Python/Numpy array
            encoding = pickle.loads(blob_data)
            
            # Store them in lists for the face_recognition library to use
            known_encodings.append(encoding)
            known_ids.append(student_id)
            
        print(f"✅ Loaded {len(known_encodings)} face vectors for {len(set(known_ids))} unique students.")
        conn.close() # Always close the connection
        
    return known_encodings, known_ids

# --- FUNCTION 2: CHECK FOR ACTIVE CLASS ---
def get_active_session():
    """
    Polls the 'sessions' table to see if a class should be recorded right now.
    """
    conn = create_db_connection()
    if conn:
        cursor = conn.cursor(dictionary=True) # Dictionary cursor lets us access cols by name (e.g. row['id'])
        
        # LOGIC: Check if 'is_active' switch is ON (Manual Start) 
        # OR if current time is inside the scheduled Start/End window.
        query = """
        SELECT * FROM sessions 
        WHERE is_active = 1 
        OR (NOW() BETWEEN Start_Time AND End_Time)
        LIMIT 1
        """
        cursor.execute(query)
        session = cursor.fetchone()
        conn.close()
        return session # Returns the session data (or None if no class is running)
    return None

# --- FUNCTION 3: LOG DATA TO SQL ---
def log_presence(session_id, student_ids):
    """
    Inserts a 'Ping' into the log table for every student seen.
    Does not calculate 'Present'/'Late' here; just dumps raw timestamps.
    """
    if not student_ids:
        return # Do nothing if no one was found

    conn = create_db_connection()
    if conn:
        cursor = conn.cursor()
        now = datetime.now()
        
        # PREPARE SQL: Using 'Time_First_Seen' as per your specific DB schema.
        # We assume they are 'Present' for this specific minute.
        sql = "INSERT INTO attendance_logs (Session_ID, Student_ID, Time_First_Seen, status) VALUES (%s, %s, %s, 'Present')"
        
        # Create a list of tuples so we can insert everyone in one efficient batch command
        val = [(session_id, s_id, now) for s_id in student_ids]
        
        try:
            cursor.executemany(sql, val) # Bulk insert
            conn.commit() # Save changes
            print(f"   ✅ Logged {len(student_ids)} students at {now.strftime('%H:%M:%S')}")
        except mysql.connector.Error as err:
            print(f"   ⚠️ Database Error: {err}")
            
        conn.close()

# --- MAIN ENGINE LOOP ---
def run_continuous_system():
    # STEP 1: Load biometric data into RAM before starting the loop
    known_encodings, known_ids = load_known_faces()
    
    print("⏳ SYSTEM STANDBY: Waiting for class to start...")

    while True:
        # --- STATE 1: STANDBY (Low Power Mode) ---
        session = get_active_session()
        
        if not session:
            # If no class is running, sleep for 10s to save CPU/GPU resources
            time.sleep(10)
            continue

        # --- STATE 2: ACTIVE (High Performance Mode) ---
        # Note: Using .get() prevents crashes if 'module_code' is missing from query result
        print(f"🚀 CLASS STARTED: {session.get('module_code', 'Unknown')} (Session ID: {session['Session_ID']})")
        
        # Initialize Camera (Index 1 for External)
        video_capture = cv2.VideoCapture(CAMERA_INDEX)
        # Force High Definition (1080p)
        video_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        video_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
        
        # Fail-safe: Fallback to laptop webcam (Index 0) if external fails
        if not video_capture.isOpened():
             print(f"⚠️ Error: Could not open camera {CAMERA_INDEX}. Trying index 0...")
             video_capture = cv2.VideoCapture(0)

        # INNER LOOP: Runs only while the specific class is active
        while True:
            # 1. Double-check if the class is STILL running
            current_session = get_active_session()
            curr_id = current_session['Session_ID'] if current_session else -1
            
            # If session ended or changed, break inner loop to go back to Standby
            if not current_session or curr_id != session['Session_ID']:
                print("🛑 Class Ended. Returning to Standby.")
                break

            start_loop = time.time() # Mark start time to calculate sleep later
            
            # 2. Capture a single frame from the video feed
            ret, frame = video_capture.read()
            if ret:
                # Convert color format (OpenCV uses BGR, Face_Recognition uses RGB)
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                # 3. Detect Faces using GPU (CNN Model)
                # upsample=1 helps find smaller faces at the back of the room
                face_locations = face_recognition.face_locations(rgb_frame, number_of_times_to_upsample=UPSAMPLE_TIMES, model="cnn")
                face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

                found_students = []

                # 4. Compare detected faces against known student DB
                for face_encoding in face_encodings:
                    # 'matches' is a list of True/False for every student in DB
                    matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=TOLERANCE)
                    
                    if True in matches:
                        # If match found, grab the index of the first match
                        first_match_index = matches.index(True)
                        student_id = known_ids[first_match_index]
                        found_students.append(student_id)

                # 5. Log unique students (set() removes duplicates if seen twice in one frame)
                log_presence(session['Session_ID'], list(set(found_students)))

            # 6. HEARTBEAT: Sleep for the rest of the minute
            # We subtract the processing time so the interval remains accurate
            elapsed = time.time() - start_loop
            sleep_time = max(0, CHECK_INTERVAL - elapsed)
            
            if sleep_time > 0:
                time.sleep(sleep_time)

        # Cleanup: Release camera so other apps can use it
        video_capture.release()
        cv2.destroyAllWindows()

# Entry point: Runs the system when script is executed
if __name__ == "__main__":
    run_continuous_system()