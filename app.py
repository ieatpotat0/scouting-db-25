
from flask import Flask, render_template, request, redirect, url_for, jsonify
import sqlite3
import csv
import pandas as pd
import os
import matplotlib.pyplot as plt
import io
import base64
import collections

app = Flask(__name__)

#file upload settings :3
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

#db setup
DATABASE = "matches.db"

def init_db():
    """Initialize the database with both match schedule and scouting data tables."""
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # Match schedule table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number INTEGER,
                blue1 INTEGER,
                blue2 INTEGER,
                blue3 INTEGER,
                red1 INTEGER,
                red2 INTEGER,
                red3 INTEGER
            )
        """)

        # scouting data table
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
                FOREIGN KEY (matchnum) REFERENCES matches (number),
                UNIQUE(matchnum, teamnum)
            )
        """)

        conn.commit()  #make sure the changes persist c:


def import_scouting_data(filepath):
    """Parses a Reefscape scouting .txt file and saves it to the database, preventing duplicates and overwriting existing entries."""
    data = {}

    with open(filepath, "r", encoding="utf-8") as file:
        for line in file:
            if ":" in line:
                key, value = line.strip().split(":", 1)
                data[key] = value.strip() #somehow this only works for notes? starting pos expects integer

    # ignore fields that aren't in the database
    expected_keys = {
        "MATCHNUM", "TEAMNUM", "COLOR", "MOBILITY", "DEFENDING", "STARTINGPOS",
        "AUTONCORAL1", "AUTONCORAL2", "AUTONCORAL3", "AUTONCORAL4",
        "AUTONALGAEPRO", "AUTONALGAENET", "TELECORAL1", "TELECORAL2",
        "TELECORAL3", "TELECORAL4", "TELEALGAEPRO", "TELEALGAENET",
        "HUMANPLAYER", "ENDGAME", "GROUNDPICKUP", "FEEDER", "NOTES"
    }
    data = {k: v for k, v in data.items() if k in expected_keys}

    # convert values to proper types
    # for key in ["MATCHNUM", "TEAMNUM", "STARTINGPOS",
    #             "AUTONCORAL1", "AUTONCORAL2", "AUTONCORAL3", "AUTONCORAL4",
    #             "AUTONALGAEPRO", "AUTONALGAENET",
    #             "TELECORAL1", "TELECORAL2", "TELECORAL3", "TELECORAL4",
    #             "TELEALGAEPRO", "TELEALGAENET", "HUMANPLAYER"]:
    #     data[key] = int(data.get(key, 0))
    for key in ["MATCHNUM", "TEAMNUM",
            "AUTONCORAL1", "AUTONCORAL2", "AUTONCORAL3", "AUTONCORAL4",
            "AUTONALGAEPRO", "AUTONALGAENET",
            "TELECORAL1", "TELECORAL2", "TELECORAL3", "TELECORAL4",
            "TELEALGAEPRO", "TELEALGAENET", "HUMANPLAYER"]:
        data[key] = int(data.get(key, 0))

# Special handling for STARTINGPOS
    try:
        data["STARTINGPOS"] = int(data.get("STARTINGPOS", 1))  # Default to 1
    except ValueError:
        data["STARTINGPOS"] = 1  # If invalid (e.g., text), set to 1


    for key in ["MOBILITY", "DEFENDING", "GROUNDPICKUP", "FEEDER"]:
        data[key] = data.get(key, "false").lower() == "true"

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()

        # check if the entry already exists
        cursor.execute("""
            SELECT COUNT(*) FROM scouting WHERE matchnum = ? AND teamnum = ?
        """, (data["MATCHNUM"], data["TEAMNUM"]))
        count = cursor.fetchone()[0]

        if count == 0:
            # if the entry does not exist, insert it
            cursor.execute("""
                INSERT INTO scouting (
                    matchnum, teamnum, color, mobility, defending, startingpos,
                    autoncoral1, autoncoral2, autoncoral3, autoncoral4,
                    autonalgaepro, autonalgaenet, telecoral1, telecoral2,
                    telecoral3, telecoral4, telealgaepro, telealgaenet,
                    humanplayer, endgame, groundpickup, feeder, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data["MATCHNUM"], data["TEAMNUM"], data["COLOR"], 
                data["MOBILITY"], data["DEFENDING"], data["STARTINGPOS"],
                data["AUTONCORAL1"], data["AUTONCORAL2"], data["AUTONCORAL3"], data["AUTONCORAL4"],
                data["AUTONALGAEPRO"], data["AUTONALGAENET"],
                data["TELECORAL1"], data["TELECORAL2"], data["TELECORAL3"], data["TELECORAL4"],
                data["TELEALGAEPRO"], data["TELEALGAENET"],
                data["HUMANPLAYER"], data["ENDGAME"], data["GROUNDPICKUP"], data["FEEDER"], data["NOTES"]
            ))
        else:
            # if the entry exists, overwrite all fields
            cursor.execute("""
                UPDATE scouting 
                SET color=?, mobility=?, defending=?, startingpos=?,
                    autoncoral1=?, autoncoral2=?, autoncoral3=?, autoncoral4=?,
                    autonalgaepro=?, autonalgaenet=?, telecoral1=?, telecoral2=?,
                    telecoral3=?, telecoral4=?, telealgaepro=?, telealgaenet=?,
                    humanplayer=?, endgame=?, groundpickup=?, feeder=?, notes=?
                WHERE matchnum=? AND teamnum=?
            """, (
                data["COLOR"], data["MOBILITY"], data["DEFENDING"], data["STARTINGPOS"],
                data["AUTONCORAL1"], data["AUTONCORAL2"], data["AUTONCORAL3"], data["AUTONCORAL4"],
                data["AUTONALGAEPRO"], data["AUTONALGAENET"],
                data["TELECORAL1"], data["TELECORAL2"], data["TELECORAL3"], data["TELECORAL4"],
                data["TELEALGAEPRO"], data["TELEALGAENET"],
                data["HUMANPLAYER"], data["ENDGAME"], data["GROUNDPICKUP"], data["FEEDER"], data["NOTES"],
                data["MATCHNUM"], data["TEAMNUM"]
            ))

        conn.commit()




@app.route('/')
def home():
    return render_template('index.html')

@app.route('/match-schedule')
def match_schedule():
    """Display match schedule from the database."""
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM matches ORDER BY number")
        matches = cursor.fetchall()
    return render_template('match-schedule.html', matches=matches)

@app.route('/team-lookup', defaults={'teamnum': None})  # default to None if not provided
@app.route('/team_lookup/<int:teamnum>')
def team_lookup(teamnum):
    """Returns scouting data for a given team."""
    if teamnum is None:
        return render_template("team-lookup.html")  # load page if no team number is given

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scouting WHERE teamnum = ?", (teamnum,))
        data = cursor.fetchall()

        if not data:
            return jsonify({"error": "No data found for this team"}), 404

        columns = [desc[0] for desc in cursor.description]
        matches = [dict(zip(columns, row)) for row in data]

        # calculate avg and med
        stats = {}
        for col in columns:
            if col in ["id", "matchnum", "teamnum", "color", "endgame", "notes"]:
                continue  # skip non-numeric fields

            values = [row[col] for row in matches]
            values = [1 if v else 0 for v in values]  #convert boolean fields

            stats[col] = {
                "average": round(sum(values) / len(values), 2) if values else 0,
                "median": round(sorted(values)[len(values) // 2], 2) if values else 0
            }

    return jsonify({
        "matches": [row["matchnum"] for row in matches],
        "num_matches": len(matches),
        "stats": stats
    })

@app.route('/teams')
def list_teams():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT teamnum FROM scouting")
        teams = cursor.fetchall()
    return jsonify([team[0] for team in teams])


@app.route('/export')
def export():
    return "Export functionality will go here."

@app.route('/import-schedule', methods=['POST'])
def import_schedule():
    """Handles CSV upload, processes the file, and stores data in the database."""
    if 'file' not in request.files:
        return "No file part", 400

    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
    file.save(filepath)

    # process CSV and insert into sqlite
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM matches")  # clear previous data

        with open(filepath, newline='', encoding='utf-8') as csvfile:
            csv_reader = csv.reader(csvfile)
            next(csv_reader) # skips a row i think
            for row in csv_reader:
                try:
                    # convert all values to integers before inserting
                    match_data = [int(value) for value in row]
                    cursor.execute(
                        "INSERT INTO matches (number, blue1, blue2, blue3, red1, red2, red3) VALUES (?, ?, ?, ?, ?, ?, ?)", 
                        match_data
                    )
                except ValueError:
                    return "Error: CSV contains non-integer values", 400


        conn.commit()

    return redirect(url_for('match_schedule'))

def load_scouting_data():
    """Loads all scouting data from the database and computes averages."""
    with sqlite3.connect(DATABASE) as conn:
        df = pd.read_sql_query("SELECT * FROM scouting", conn)

    if df.empty:
        return pd.DataFrame()  # no data case

    # its averagey time
    avg_df = round(df.groupby("teamnum").mean(numeric_only=True), 3)  # ignore non-numeric columns
    avg_df["MatchesPlayed"] = df.groupby("teamnum").size()
    avg_df.reset_index(inplace=True)

    return avg_df


@app.route("/averages")
def averages():
    return render_template("averages.html")

@app.route("/api/averages")
def averages_data():
    df = load_scouting_data()
    return jsonify(df.to_dict(orient="records"))

#medians !! :3
@app.route("/medians")
def medians():
    return render_template("medians.html")

@app.route("/api/medians")
def medians_data():
    with sqlite3.connect(DATABASE) as conn:
        df = pd.read_sql_query("SELECT * FROM scouting", conn)

    if df.empty:
        return jsonify([])  # No data case

    # medians idksdfdfklsfjldajf
    median_df = df.groupby("teamnum").median(numeric_only=True)
    median_df["MatchesPlayed"] = df.groupby("teamnum").size()
    median_df.reset_index(inplace=True)

    # convert boolean fields (True/False) to 1/0
    for col in ["mobility", "defending", "groundpickup", "feeder"]:
        if col in median_df:
            median_df[col] = median_df[col].astype(int)

    return jsonify(median_df.to_dict(orient="records"))

@app.route("/api/raw")
def raw_data():
    with sqlite3.connect(DATABASE) as conn:
        df = pd.read_sql_query("SELECT * FROM scouting", conn)

    if df.empty:
        return jsonify([])  #no data case :3333

    return jsonify(df.to_dict(orient="records"))

@app.route("/raw")
def raw():
    return render_template("raw.html")

@app.route("/graphs")
def graphs():
    return render_template("graphs.html")

@app.route('/generate_graph', methods=['GET'])
@app.route('/generate_graph', methods=['GET'])
def generate_graph():
    """Generates a graph of scoring trends across matches for up to 3 teams."""
    teams = request.args.getlist('teams')  # get selected teams
    category = request.args.get('category')  # dropdown for scoring category

    if not teams or not category:
        return jsonify({"error": "Please select at least one team and a category"}), 400

    # how to calculate different categories
    category_mapping = {
        "auto_coral": "autoncoral1 + autoncoral2 + autoncoral3 + autoncoral4",
        "autoncoral1": "autoncoral1",
        "autoncoral2": "autoncoral2",
        "autoncoral3": "autoncoral3",
        "autoncoral4": "autoncoral4",
        "telecoral1": "telecoral1",
        "telecoral2": "telecoral2",
        "telecoral3": "telecoral3",
        "telecoral4": "telecoral4",
        "tele_coral": "telecoral1 + telecoral2 + telecoral3 + telecoral4",
        "total_coral": "(autoncoral1 + autoncoral2 + autoncoral3 + autoncoral4) + (telecoral1 + telecoral2 + telecoral3 + telecoral4)",
        "net": "autonalgaenet + telealgaenet",
        "processor": "autonalgaepro + telealgaepro",
        "climb": "endgame",  
    }

    if category not in category_mapping:
        return jsonify({"error": "Invalid category selected"}), 400

    sql_query = f"""
        SELECT matchnum, {category_mapping[category]} FROM scouting 
        WHERE teamnum = ? ORDER BY matchnum
    """

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        data = {}

        for team in teams:
            cursor.execute(sql_query, (team,))
            results = cursor.fetchall()
            data[team] = results  # store results per team

    if not any(data.values()):  # check if all data lists are empty
        return jsonify({"error": "No data found for the selected teams and category"}), 404



    plt.figure(figsize=(8, 5))

    if category == "climb":
        ## :)
        climb_labels = {0: "Parked", 1: "Shallow", 2: "Deep", 3: "None"}
        
        for team, results in data.items():
            climb_counts = collections.Counter(score for _, score in results)
            
            # Extract categories & match counts
            categories = list(climb_labels.values())  # ensure all categories exist on x-axis
            counts = [climb_counts.get(cat, 0) for cat in categories] 
            
            plt.bar(categories, counts, label=f'Team {team}', alpha=0.7)
            print(results)

        plt.ylabel("Number of Matches")
        plt.xlabel("Climb Category")
        plt.title("Climb Distribution Across Matches")

    else:
        for team, results in data.items():
            matches, scores = zip(*results) if results else ([], [])
            plt.plot(matches, scores, marker='o', label=f'Team {team}')

        plt.xlabel("Match Number")
        plt.ylabel(f"{category.replace('_', ' ').title()} Scored")
        plt.title(f"{category.replace('_', ' ').title()} Scoring Trend")

    plt.legend()
    plt.grid(True)

    # save graph to BytesIO
    img = io.BytesIO()
    plt.savefig(img, format='png')
    img.seek(0)
    plt.close()

    return base64.b64encode(img.getvalue()).decode('utf-8')  # return image as base64



@app.route('/upload-scouting', methods=['POST'])
def upload_scouting():
    if 'file' not in request.files:
        return "No file part", 400

    files = request.files.getlist('file') 
    if not files or all(file.filename == '' for file in files):
        return "No selected files", 400

    for file in files:
        if file.filename.endswith(".txt"):
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
            file.save(filepath)
            try:
                import_scouting_data(filepath)  
            except Exception as e:
                return f"Error processing {file.filename}: {e}", 400

    return jsonify({"message": "Upload successful!"})

# ############

# @app.route('/match-lookup', defaults = {'matchnum': None})
# @app.route('/match_lookup/<int:matchnum>')
# def match_lookup(matchnum):
#     """Returns raw scouting data for all teams in a given match."""
#     with sqlite3.connect(DATABASE) as conn:
#         cursor = conn.cursor()
        
#         # Get all teams in the match
#         cursor.execute("""
#             SELECT blue1, blue2, blue3, red1, red2, red3 
#             FROM matches WHERE number = ?
#         """, (matchnum,))
#         match = cursor.fetchone()

#         if not match:
#             return jsonify({"error": "No data found for this match"}), 404

#         teams = list(match) 

#         # Fetch raw scouting data for each team
#         cursor.execute("SELECT * FROM scouting WHERE matchnum = ?", (matchnum,))
#         data = cursor.fetchall()

#         if not data:
#             return jsonify({"error": "No scouting data found for this match"}), 404

#         # Get column names
#         columns = [desc[0] for desc in cursor.description]

#         # Convert raw rows into dictionaries
#         raw_data = [dict(zip(columns, row)) for row in data]

#     return jsonify({"matchnum": matchnum, "raw_data": raw_data})


############ i dont need this part hehehehehhehehehehhehawwhahahwhhwhwhwhat?

def reload_all_scouting_data():
    """Reload all scouting .txt files from the uploads folder into the database."""
    folder = app.config["UPLOAD_FOLDER"]
    files = [f for f in os.listdir(folder) if f.endswith(".txt")]
    
    print(f"Found {len(files)} scouting files to import...")

    for filename in files:
        filepath = os.path.join(folder, filename)
        try:
            import_scouting_data(filepath)
            print(f"✅ Imported: {filename}")
        except Exception as e:
            print(f"❌ Error importing {filename}: {e}")


if __name__ == '__main__':
    init_db()
    reload_all_scouting_data()
    plt.switch_backend('Agg')
    app.run(debug=True)
