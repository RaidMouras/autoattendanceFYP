import os
import mysql.connector
from mysql.connector import Error

# Load .env from the backend folder (one level up)
try:
    from dotenv import load_dotenv
    dotenv_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
    load_dotenv(dotenv_path)
except ImportError:
    pass  # python-dotenv not installed; fall back to system environment variables

def create_db_connection():
    """
    Establishes a connection to the MySQL database.
    Returns the connection object if successful, None otherwise.
    """
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

# This block only runs if you run THIS file directly (for testing)
if __name__ == "__main__":
    conn = create_db_connection()
    if conn and conn.is_connected():
        print("✅ Success! Connection function is working.")
        conn.close()
