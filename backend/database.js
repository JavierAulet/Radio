const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'radio.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create tables if they don't exist
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

db.run(`CREATE TABLE IF NOT EXISTS djs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT NOT NULL
      )`, (err) => {
          if (!err) {
              db.get('SELECT * FROM djs WHERE username = ?', ['admin'], (err, row) => {
                  if (!row) {
                      db.run('INSERT INTO djs (username, password, display_name) VALUES (?, ?, ?)', 
                             ['admin', 'supersecret', 'DJ Residente']);
                  }
              });
          }
      });

      db.run(`CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_name TEXT NOT NULL,
        artist_name TEXT,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dj_id INTEGER,
        day_of_week INTEGER,
        start_time TEXT,
        end_time TEXT,
        show_name TEXT,
        FOREIGN KEY(dj_id) REFERENCES djs(id)
      )`);
    });
  }
});

// Helper functions for user XP and Leveling
const getUser = (username) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
};

const createUser = (username) => {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO users (username) VALUES (?)', [username], function(err) {
      if (err) reject(err);
      resolve({ id: this.lastID, username, xp: 0, level: 1 });
    });
  });
};

const addXP = (username, amount) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) return reject(err);
      
      if (!user) {
        // User not found, shouldn't happen usually if created on connect
        return reject(new Error('User not found'));
      }

      const newXp = user.xp + amount;
      // Simple formula: Level = Math.floor(Math.sqrt(newXp / 10)) + 1
      // e.g. 0-39 XP = Lvl 1, 40-159 XP = Lvl 2, 160-359 XP = Lvl 3
      // For fast demonstration: let's make it 10 XP per level
      const newLevel = Math.floor(newXp / 10) + 1;

      db.run('UPDATE users SET xp = ?, level = ? WHERE username = ?', [newXp, newLevel, username], function(err) {
        if (err) reject(err);
        resolve({ ...user, xp: newXp, level: newLevel });
      });
    });
  });
};

const authenticateDj = (username, password) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM djs WHERE username = ? AND password = ?', [username, password], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
};

const getSchedules = () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT s.id, s.day_of_week, s.start_time, s.end_time, s.show_name, d.display_name, d.username
            FROM schedules s
            JOIN djs d ON s.dj_id = d.id
            ORDER BY s.day_of_week ASC, s.start_time ASC
        `, [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
};

const addSchedule = (dj_id, day_of_week, start_time, end_time, show_name) => {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO schedules (dj_id, day_of_week, start_time, end_time, show_name) VALUES (?, ?, ?, ?, ?)', 
        [dj_id, day_of_week, start_time, end_time, show_name], function(err) {
            if (err) reject(err);
            resolve({ id: this.lastID });
        });
    });
};

const deleteSchedule = (id) => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM schedules WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            resolve({ deleted: this.changes > 0 });
        });
    });
};

const getScheduleById = (id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM schedules WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
};

const getAllDjs = () => {
    return new Promise((resolve, reject) => {
        db.all('SELECT id, username, display_name FROM djs ORDER BY id ASC', [], (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
};

const createDj = (username, password, display_name) => {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO djs (username, password, display_name) VALUES (?, ?, ?)',
        [username, password, display_name], function(err) {
            if (err) reject(err);
            resolve({ id: this.lastID, username, display_name });
        });
    });
};

const deleteDj = (id) => {
    return new Promise((resolve, reject) => {
        // First delete schedules related to this DJ
        db.run('DELETE FROM schedules WHERE dj_id = ?', [id], (err) => {
            if (err) return reject(err);
            // Then delete the DJ
            db.run('DELETE FROM djs WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                resolve({ deleted: this.changes > 0 });
            });
        });
    });
};

const parseArtist = (filename) => {
  const name = filename.replace(/\.mp3$/i, '');
  const parts = name.split(' - ');
  if (parts.length >= 3 && /^\d+$/.test(parts[0].trim()) && /^\d+[A-Za-z]+$/.test(parts[1].trim())) {
    return parts[2].trim();
  }
  if (parts.length >= 2) return parts[0].trim();
  return null;
};

const logPlay = (songName) => {
  const artist = parseArtist(songName);
  db.run('INSERT INTO play_history (song_name, artist_name) VALUES (?, ?)', [songName, artist]);
};

const getTopSongs = (limit = 10) => {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT song_name, artist_name, COUNT(*) as plays
      FROM play_history
      WHERE played_at > datetime('now', '-7 days')
      GROUP BY song_name
      ORDER BY plays DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const getTopArtists = (limit = 10) => {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT artist_name, COUNT(*) as plays
      FROM play_history
      WHERE played_at > datetime('now', '-7 days') AND artist_name IS NOT NULL AND artist_name != ''
      GROUP BY artist_name
      ORDER BY plays DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

module.exports = {
  db,
  getUser,
  createUser,
  addXP,
  authenticateDj,
  getSchedules,
  addSchedule,
  deleteSchedule,
  getScheduleById,
  getAllDjs,
  createDj,
  deleteDj,
  logPlay,
  getTopSongs,
  getTopArtists
};
