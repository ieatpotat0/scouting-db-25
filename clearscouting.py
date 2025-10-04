# clearscouting.py
import sqlite3

DATABASE = "matches.db"

with sqlite3.connect(DATABASE) as conn:
    conn.execute("DELETE FROM scouting")
    conn.commit()
    print("✅ yay i cleared all the old scouting data!")
