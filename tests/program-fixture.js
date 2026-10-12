export function prepareProgramFixture(db){
  db.exec(`CREATE TABLE IF NOT EXISTS program_starts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    started_at INTEGER NOT NULL CHECK(started_at >= 0)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS program_answers (
    user_id INTEGER NOT NULL REFERENCES users(id), day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 7),
    reflection TEXT NOT NULL, questions TEXT NOT NULL, exercise TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,day)
  )`);

 db.function('GREATEST', {varargs:true}, (...values)=>Math.max(...values));
}
