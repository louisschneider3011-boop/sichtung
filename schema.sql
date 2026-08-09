-- Filmcrew D1 schema
-- Deploy with: wrangler d1 execute filmcrew-db --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS movies (
  tmdb_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  release_date TEXT,
  overview TEXT,
  genres TEXT,
  runtime INTEGER,
  director TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_tmdb_id INTEGER NOT NULL REFERENCES movies(tmdb_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rating REAL NOT NULL CHECK (rating >= 0.5 AND rating <= 10),
  note TEXT,
  watched_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(movie_tmdb_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_movie ON ratings(movie_tmdb_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
