import os
import mysql.connector
from mysql.connector import Error

try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
    load_dotenv(dotenv_path)
except ImportError:
    pass

def create_db_connection():
    try:
        connection = mysql.connector.connect(
            host=os.environ.get('DB_HOST', 'localhost'),
            user=os.environ.get('DB_USER', 'root'),
            password=os.environ.get('DB_PASS', ''),
            database=os.environ.get('DB_NAME', 'attendance_system')
        )
        return connection
    except Error as err:
        print(f"Error: '{err}'")
        return None

if __name__ == "__main__":
    conn = create_db_connection()
    if conn and conn.is_connected():
        print("✅ Success! Connection function is working.")
        conn.close()
