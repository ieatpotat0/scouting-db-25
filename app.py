from flask import Flask, render_template, request, jsonify
import sqlite3
import os

app = Flask(__name__)
app.secret_key = '1351'

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

DATABASE = "matches.db"

def init_db():
    """
    Initializes the SQLite database by creating the matches and scouting tables.
    Drops existing tables if they exist and recreates them with the proper schema.
    Enables foreign key constraints for referential integrity.
    
    Parameters:
        None
    
    Returns:
        None
    """
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        cursor.execute("DROP TABLE IF EXISTS scouting;")
        cursor.execute("DROP TABLE IF EXISTS matches;")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number INTEGER UNIQUE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scouting (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                matchnum INTEGER,
                teamnum INTEGER,
                color TEXT,
                mobility BOOLEAN,
                defending BOOLEAN,
                startingpos INTEGER,
                autoncoral1 INTEGER,
                autoncoral2 INTEGER,
                autoncoral3 INTEGER,
                autoncoral4 INTEGER,
                autonalgaepro INTEGER,
                autonalgaenet INTEGER,
                telecoral1 INTEGER,
                telecoral2 INTEGER,
                telecoral3 INTEGER,
                telecoral4 INTEGER,
                telealgaepro INTEGER,
                telealgaenet INTEGER,
                humanplayer INTEGER,
                endgame TEXT,
                groundpickup BOOLEAN,
                feeder BOOLEAN,
                notes TEXT,
                scoutername TEXT,
                FOREIGN KEY (matchnum) REFERENCES matches (number) ON DELETE CASCADE,
                UNIQUE(matchnum, teamnum)
            )
        """)
        conn.commit()

def import_scouting_data(filepath):
    """
    Imports scouting data from a text file into the database.
    Parses key-value pairs from the file, validates and converts data types,
    then inserts or updates the scouting record in the database.
    
    Parameters:
        filepath (str): Path to the text file containing scouting data in "KEY:VALUE" format
    
    Returns:
        None
    
    Raises:
        Exception: If file cannot be read or data cannot be inserted into database
    """
    # Parse the file into a dictionary
    data = {}
    with open(filepath, "r", encoding="utf-8") as file:
        for line in file:
            if ":" in line:
                key, value = line.strip().split(":", 1)
                data[key.upper()] = value.strip()

    # Filter to only expected keys
    expected_keys = {
        "MATCHNUM", "TEAMNUM", "COLOR", "MOBILITY", "DEFENDING", "STARTINGPOS",
        "AUTONCORAL1", "AUTONCORAL2", "AUTONCORAL3", "AUTONCORAL4",
        "AUTONALGAEPRO", "AUTONALGAENET", "TELECORAL1", "TELECORAL2",
        "TELECORAL3", "TELECORAL4", "TELEALGAEPRO", "TELEALGAENET",
        "HUMANPLAYER", "ENDGAME", "GROUNDPICKUP", "FEEDER", "NOTES", "YOURNAME"
    }
    data = {k: v for k, v in data.items() if k in expected_keys}

    # Convert numeric fields to integers
    for key in ["MATCHNUM", "TEAMNUM", "AUTONCORAL1", "AUTONCORAL2", "AUTONCORAL3", "AUTONCORAL4",
                "AUTONALGAEPRO", "AUTONALGAENET", "TELECORAL1", "TELECORAL2", "TELECORAL3", 
                "TELECORAL4", "TELEALGAEPRO", "TELEALGAENET", "HUMANPLAYER"]:
        data[key] = int(data.get(key, 0))

    # Convert starting position to integer with error handling
    try:
        data["STARTINGPOS"] = int(data.get("STARTINGPOS", 1))
    except ValueError:
        data["STARTINGPOS"] = 1

    # Convert boolean fields
    for key in ["MOBILITY", "DEFENDING", "GROUNDPICKUP", "FEEDER"]:
        data[key] = data.get(key, "false").lower() == "true"

    # Extract scout name
    scoutername = data.get("YOURNAME", "Unknown")

    # Insert or update database record
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        
        # Ensure match exists
        cursor.execute("INSERT OR IGNORE INTO matches (number) VALUES (?)", (data["MATCHNUM"],))
        
        # Check if record already exists
        cursor.execute("SELECT COUNT(*) FROM scouting WHERE matchnum = ? AND teamnum = ?",
                      (data["MATCHNUM"], data["TEAMNUM"]))
        count = cursor.fetchone()[0]

        if count == 0:
            # Insert new record
            cursor.execute("""
                INSERT INTO scouting (matchnum, teamnum, color, mobility, defending, startingpos,
                    autoncoral1, autoncoral2, autoncoral3, autoncoral4, autonalgaepro, autonalgaenet,
                    telecoral1, telecoral2, telecoral3, telecoral4, telealgaepro, telealgaenet,
                    humanplayer, endgame, groundpickup, feeder, notes, scoutername)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (data["MATCHNUM"], data["TEAMNUM"], data.get("COLOR"), data.get("MOBILITY"), 
                  data.get("DEFENDING"), data.get("STARTINGPOS"), data.get("AUTONCORAL1"), data.get("AUTONCORAL2"),
                  data.get("AUTONCORAL3"), data.get("AUTONCORAL4"), data.get("AUTONALGAEPRO"), data.get("AUTONALGAENET"),
                  data.get("TELECORAL1"), data.get("TELECORAL2"), data.get("TELECORAL3"), data.get("TELECORAL4"),
                  data.get("TELEALGAEPRO"), data.get("TELEALGAENET"), data.get("HUMANPLAYER"), data.get("ENDGAME"),
                  data.get("GROUNDPICKUP"), data.get("FEEDER"), data.get("NOTES"), scoutername))
        else:
            # Update existing record
            cursor.execute("""
                UPDATE scouting SET color=?, mobility=?, defending=?, startingpos=?,
                    autoncoral1=?, autoncoral2=?, autoncoral3=?, autoncoral4=?,
                    autonalgaepro=?, autonalgaenet=?, telecoral1=?, telecoral2=?,
                    telecoral3=?, telecoral4=?, telealgaepro=?, telealgaenet=?,
                    humanplayer=?, endgame=?, groundpickup=?, feeder=?, notes=?, scoutername=?
                WHERE matchnum=? AND teamnum=?
            """, (data.get("COLOR"), data.get("MOBILITY"), data.get("DEFENDING"), data.get("STARTINGPOS"),
                  data.get("AUTONCORAL1"), data.get("AUTONCORAL2"), data.get("AUTONCORAL3"), data.get("AUTONCORAL4"),
                  data.get("AUTONALGAEPRO"), data.get("AUTONALGAENET"), data.get("TELECORAL1"), data.get("TELECORAL2"),
                  data.get("TELECORAL3"), data.get("TELECORAL4"), data.get("TELEALGAEPRO"), data.get("TELEALGAENET"),
                  data.get("HUMANPLAYER"), data.get("ENDGAME"), data.get("GROUNDPICKUP"), data.get("FEEDER"),
                  data.get("NOTES"), scoutername, data["MATCHNUM"], data["TEAMNUM"]))
        conn.commit()

def reload_all_scouting_data():
    """
    Reloads all scouting data from .txt files in the uploads folder.
    Iterates through all .txt files in the upload folder and imports each one.
    Errors during import are printed but do not stop the process.
    
    Parameters:
        None
    
    Returns:
        None
    """
    folder = app.config["UPLOAD_FOLDER"]
    if not os.path.exists(folder): return
    files = [f for f in os.listdir(folder) if f.endswith(".txt")]
    for filename in files:
        try:
            import_scouting_data(os.path.join(folder, filename))
        except Exception as e:
            print(f"Error importing {filename}: {e}")

@app.route('/')
def index():
    """
    Route handler for the home page.
    
    Parameters:
        None (Flask route)
    
    Returns:
        Rendered HTML template for index.html
    """
    return render_template('index.html')

@app.route('/teams')
def list_teams():
    """
    Route handler that retrieves and returns a list of all unique team numbers
    that have scouting data in the database.
    
    Parameters:
        None (Flask route)
    
    Returns:
        JSON array of team numbers (integers), sorted in ascending order
    """
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT teamnum FROM scouting ORDER BY teamnum")
        teams = cursor.fetchall()
    return jsonify([team[0] for team in teams])

@app.route('/api/team_performance/<int:teamnum>')
def team_performance_data(teamnum):
    """
    API endpoint that calculates and returns performance data for a specific team
    across all their matches. Calculates total points scored based on game scoring rules.
    
    Parameters:
        teamnum (int): The team number to retrieve performance data for
    
    Returns:
        JSON array of objects, each containing:
            - match (int): Match number
            - score (int): Total points scored in that match
            - color (str): Alliance color ('red' or 'blue')
            - notes (str): Scouting notes for that match
            - scouter (str): Name of the person who scouted this match
    """
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT matchnum,
                (autoncoral1 * 3 + autoncoral2 * 4 + autoncoral3 * 6 + autoncoral4 * 7 +
                 autonalgaepro * 6 + autonalgaenet * 3 +
                 telecoral1 * 2 + telecoral2 * 3 + telecoral3 * 4 + telecoral4 * 5 +
                 telealgaepro * 6 + telealgaenet * 4 +
                 CASE WHEN mobility = 1 THEN 3 ELSE 0 END +
                 CASE WHEN endgame = 'Parked' THEN 2 
                      WHEN endgame = 'Shallow' THEN 6 
                      WHEN endgame = 'Deep' THEN 12 
                      ELSE 0 END) AS total_points,
                color, notes, scoutername
            FROM scouting WHERE teamnum = ? ORDER BY matchnum
        """, (teamnum,))
        data = cursor.fetchall()
        results = [{"match": row[0], "score": row[1], 
                   "color": row[2].lower() if row[2] else "blue", 
                   "notes": row[3] or "No notes available",
                   "scouter": row[4] or "Unknown"} for row in data]
        return jsonify(results)

@app.route('/api/category_performance/<int:teamnum>/<category>')
def category_performance_data(teamnum, category):
    """
    API endpoint that retrieves performance data for a specific team in a specific category.
    Supports various scoring categories including coral placement, algae processing, and climbing.
    
    Parameters:
        teamnum (int): The team number to retrieve data for
        category (str): The performance category to analyze. Valid options:
            - "auto_coral", "tele_coral", "total_coral": Coral totals
            - "autoncoral1" through "autoncoral4": Autonomous coral by level
            - "telecoral1" through "telecoral4": Teleop coral by level
            - "net", "processor": Algae processing stats
            - "climb": Endgame climbing statistics
    
    Returns:
        For "climb" category:
            JSON object with counts: {"Parked": int, "Shallow": int, "Deep": int, "None": int}
        
        For all other categories:
            JSON array of objects, each containing:
                - match (int): Match number
                - value (int): The value for this category in this match
                - color (str): Alliance color
                - notes (str): Scouting notes
                - scouter (str): Scout name
        
        Error response (400) if invalid category is provided
    """
    # Map category names to SQL expressions
    category_mapping = {
        "auto_coral": "autoncoral1 + autoncoral2 + autoncoral3 + autoncoral4",
        "autoncoral1": "autoncoral1", "autoncoral2": "autoncoral2", "autoncoral3": "autoncoral3", "autoncoral4": "autoncoral4",
        "telecoral1": "telecoral1", "telecoral2": "telecoral2", "telecoral3": "telecoral3", "telecoral4": "telecoral4",
        "tele_coral": "telecoral1 + telecoral2 + telecoral3 + telecoral4",
        "total_coral": "(autoncoral1 + autoncoral2 + autoncoral3 + autoncoral4) + (telecoral1 + telecoral2 + telecoral3 + telecoral4)",
        "net": "autonalgaenet + telealgaenet", "processor": "autonalgaepro + telealgaepro", "climb": "endgame"
    }
    
    if category not in category_mapping: return jsonify({"error": "Invalid category"}), 400

    if category == "climb":
        # Special handling for climb category - return counts of each climb type
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT endgame FROM scouting WHERE teamnum = ?", (teamnum,))
            data = cursor.fetchall()
            climb_counts = {"Parked": 0, "Shallow": 0, "Deep": 0, "None": 0}
            for row in data:
                endgame = row[0] if row[0] else "None"
                if endgame in climb_counts: climb_counts[endgame] += 1
            return jsonify(climb_counts)
    else:
        # For all other categories, return match-by-match data
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT matchnum, {category_mapping[category]} AS value, color, notes, scoutername FROM scouting WHERE teamnum = ? ORDER BY matchnum", (teamnum,))
            data = cursor.fetchall()
            results = [{"match": row[0], "value": row[1], "color": row[2].lower() if row[2] else "blue", "notes": row[3] or "No notes", "scouter": row[4] or "Unknown"} for row in data]
            return jsonify(results)

@app.route('/upload-scouting', methods=['POST'])
def upload_scouting():
    """
    Route handler for uploading scouting data files.
    Accepts multiple .txt files via POST request and imports them into the database.
    
    Parameters:
        None (receives files via Flask request.files)
    
    Returns:
        Success response (200):
            JSON object: {"message": "Uploaded X file(s)!"}
        
        Error responses (400):
            - If no files in request: {"error": "No file part"}
            - If no files selected: {"error": "No files selected"}
            - If import fails: {"error": "Error on [filename]: [error message]"}
    """
    if 'files' not in request.files: return jsonify({"error": "No file part"}), 400
    files = request.files.getlist('files')
    if not files: return jsonify({"error": "No files selected"}), 400
    
    success_count = 0
    for file in files:
        if file.filename and file.filename.endswith(".txt"):
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
            file.save(filepath)
            try:
                import_scouting_data(filepath)
                success_count += 1
            except Exception as e:
                return jsonify({"error": f"Error on {file.filename}: {e}"}), 400
    return jsonify({"message": f"Uploaded {success_count} file(s)!"})

@app.route('/api/raw_data')
def get_raw_data():
    """
    API endpoint that retrieves all raw scouting data from the database.
    Returns all records from the scouting table with all columns.
    
    Parameters:
        None (Flask route)
    
    Returns:
        JSON array of objects, where each object represents a scouting record
        with all database fields (id, matchnum, teamnum, color, mobility, defending,
        startingpos, all coral/algae fields, endgame, notes, scoutername, etc.)
        
        Results are ordered by match number, then team number
    """
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scouting ORDER BY matchnum, teamnum")
        data = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        return jsonify(results)

if __name__ == '__main__':
    # Initialize the database schema
    init_db()
    # Load any existing scouting data files
    reload_all_scouting_data()
    # Start the Flask development server
    app.run(debug=True)