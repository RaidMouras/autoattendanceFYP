import mysql.connector
from mysql.connector import Error

def create_db_connection():
    """
    Establishes a connection to the MySQL database.
    Returns the connection object if successful, None otherwise.
    """
    try:
        connection = mysql.connector.connect(
            host='localhost',        # Since MySQL is running on your machine
            user='root',             # Your MySQL username (usually 'root')
            password='Slow_bo@t2004',# <--- REPLACE THIS with your Workbench password
            database='attendance_system' # The DB name we created in SQL
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