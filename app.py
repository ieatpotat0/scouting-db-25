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
    data = {}
    with open(filepath, "r", encoding="utf-8") as file:
        for line in file:
            if ":" in line:
                key, value = line.strip().split(":", 1)
                data[key.upper()] = value.strip()

    expected_keys = {
        "MATCHNUM", "TEAMNUM", "COLOR", "MOBILITY", "DEFENDING", "STARTINGPOS",
        "AUTONCORAL1", "AUTONCORAL2", "AUTONCORAL3", "AUTONCORAL4",
        "AUTONALGAEPRO", "AUTONALGAENET", "TELECORAL1", "TELECORAL2",
        "TELECORAL3", "TELECORAL4", "TELEALGAEPRO", "TELEALGAENET",
        "HUMANPLAYER", "ENDGAME", "GROUNDPICKUP", "FEEDER", "NOTES", "YOURNAME"
    }
    data = {k: v for k, v in data.items() if k in expected_keys}

    for key in ["MATCHNUM", "TEAMNUM", "AUTONCORAL1", "AUTONCORAL2", "AUTONCORAL3", "AUTONCORAL4",
                "AUTONALGAEPRO", "AUTONALGAENET", "TELECORAL1", "TELECORAL2", "TELECORAL3", 
                "TELECORAL4", "TELEALGAEPRO", "TELEALGAENET", "HUMANPLAYER"]:
        data[key] = int(data.get(key, 0))

    try:
        data["STARTINGPOS"] = int(data.get("STARTINGPOS", 1))
    except ValueError:
        data["STARTINGPOS"] = 1

    for key in ["MOBILITY", "DEFENDING", "GROUNDPICKUP", "FEEDER"]:
        data[key] = data.get(key, "false").lower() == "true"

    scoutername = data.get("YOURNAME", "Unknown")

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        
        cursor.execute("INSERT OR IGNORE INTO matches (number) VALUES (?)", (data["MATCHNUM"],))
        
        cursor.execute("SELECT COUNT(*) FROM scouting WHERE matchnum = ? AND teamnum = ?",
                      (data["MATCHNUM"], data["TEAMNUM"]))
        count = cursor.fetchone()[0]

        if count == 0:
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
    return render_template('index.html')

@app.route('/teams')
def list_teams():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT teamnum FROM scouting ORDER BY teamnum")
        teams = cursor.fetchall()
    return jsonify([team[0] for team in teams])

@app.route('/api/team_performance/<int:teamnum>')
def team_performance_data(teamnum):
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
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT matchnum, {category_mapping[category]} AS value, color, notes, scoutername FROM scouting WHERE teamnum = ? ORDER BY matchnum", (teamnum,))
            data = cursor.fetchall()
            results = [{"match": row[0], "value": row[1], "color": row[2].lower() if row[2] else "blue", "notes": row[3] or "No notes", "scouter": row[4] or "Unknown"} for row in data]
            return jsonify(results)

@app.route('/upload-scouting', methods=['POST'])
def upload_scouting():
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
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scouting ORDER BY matchnum, teamnum")
        data = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        return jsonify(results)

if __name__ == '__main__':
    init_db()
    reload_all_scouting_data()
    app.run(debug=True)