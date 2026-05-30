const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

function getDataDir() {
    // 优先尝试项目目录下的 data（开发模式或解压运行）
    // 如果 __dirname 不可写（asar 内），回退到 userData
    const devDir = path.join(__dirname, 'data');
    try {
        if (!fs.existsSync(devDir)) {
            fs.mkdirSync(devDir, { recursive: true });
        }
        // 测试写入权限
        const testFile = path.join(devDir, '.write_test');
        fs.writeFileSync(testFile, '1');
        fs.unlinkSync(testFile);
        return devDir;
    } catch (e) {
        // __dirname 不可写，回退到 userData
        const userDataDir = path.join(app.getPath('userData'), 'data');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        return userDataDir;
    }
}

function getDbPath() {
    return path.join(getDataDir(), 'students.db');
}

function rowToStudent(row) {
    if (!row) return null;
    return {
        uid: row.uid,
        name: row.name,
        gender: row.gender,
        age: row.age,
        className: row.class_name,
        level: row.level,
        idNumber: row.id_number,
        photoPath: row.photo_path,
        syncTime: row.sync_time,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function initDatabase() {
    return new Promise((resolve, reject) => {
        const dbPath = getDbPath();
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('打开数据库失败:', err);
                reject(err);
                return;
            }
            console.log('数据库路径:', dbPath);

            db.run(`
                CREATE TABLE IF NOT EXISTS students (
                    uid TEXT PRIMARY KEY,
                    name TEXT,
                    gender TEXT,
                    age INTEGER,
                    class_name TEXT,
                    level TEXT,
                    id_number TEXT,
                    photo_path TEXT,
                    sync_time TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            `, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                // 新建成绩表（与学生表独立）
                db.run(`
                    CREATE TABLE IF NOT EXISTS scores (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        uid TEXT NOT NULL,
                        name TEXT,
                        sport_id TEXT,
                        sport_name TEXT,
                        duration INTEGER,
                        legal INTEGER,
                        illegal INTEGER,
                        class_name TEXT,
                        score_time TEXT,
                        source TEXT DEFAULT '累计',
                        created_at TEXT
                    )
                `, (err2) => {
                    if (err2) {
                        reject(err2);
                    } else {
                        // 为常用查询创建索引
                        db.run(`CREATE INDEX IF NOT EXISTS idx_scores_uid ON scores(uid)`, () => {});
                        db.run(`CREATE INDEX IF NOT EXISTS idx_scores_time ON scores(score_time DESC)`, () => {});
                        resolve();
                    }
                });
            });
        });
    });
}

function getAllStudents() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM students ORDER BY created_at DESC', [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(rowToStudent));
        });
    });
}

function upsertStudent(student) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        const {
            uid, name, gender, age, className, level, idNumber,
            photoPath, photo_path, sync_time, syncTime, created_at, createdAt
        } = student;

        const pPath = photoPath || photo_path || '';
        const sTime = sync_time || syncTime || '';
        const cAt = created_at || createdAt || now;

        db.run(`
            INSERT INTO students (uid, name, gender, age, class_name, level, id_number, photo_path, sync_time, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET
                name=excluded.name,
                gender=excluded.gender,
                age=excluded.age,
                class_name=excluded.class_name,
                level=excluded.level,
                id_number=excluded.id_number,
                photo_path=excluded.photo_path,
                sync_time=excluded.sync_time,
                updated_at=excluded.updated_at
        `, [uid, name, gender, age, className || '', level || '', idNumber || '', pPath, sTime, cAt, now], function(err) {
            if (err) reject(err);
            else resolve({ ...student, updated_at: now });
        });
    });
}

// 辅助：将 db.run 包装为 Promise
function runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function upsertMultipleStudents(students) {
    return new Promise(async (resolve, reject) => {
        if (!db) {
            reject(new Error('数据库未初始化'));
            return;
        }
        const now = new Date().toISOString();
        try {
            await runSql('BEGIN TRANSACTION');
            for (const student of students) {
                const {
                    uid, name, gender, age, className, level, idNumber,
                    photoPath, photo_path, sync_time, syncTime, created_at, createdAt
                } = student;
                const pPath = photoPath || photo_path || '';
                const sTime = sync_time || syncTime || '';
                const cAt = created_at || createdAt || now;
                await runSql(`
                    INSERT INTO students (uid, name, gender, age, class_name, level, id_number, photo_path, sync_time, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(uid) DO UPDATE SET
                        name=excluded.name,
                        gender=excluded.gender,
                        age=excluded.age,
                        class_name=excluded.class_name,
                        level=excluded.level,
                        id_number=excluded.id_number,
                        photo_path=excluded.photo_path,
                        sync_time=excluded.sync_time,
                        updated_at=excluded.updated_at
                `, [uid, name, gender, age, className || '', level || '', idNumber || '', pPath, sTime, cAt, now]);
            }
            await runSql('COMMIT');
            resolve();
        } catch (err) {
            db.run('ROLLBACK', () => reject(err));
        }
    });
}

function deleteStudent(uid) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM students WHERE uid = ?', [uid], function(err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function deleteMultipleStudents(uids) {
    return new Promise((resolve, reject) => {
        const placeholders = uids.map(() => '?').join(',');
        db.run(`DELETE FROM students WHERE uid IN (${placeholders})`, uids, function(err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}

function clearAllStudents() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM students', [], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getStats() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as total FROM students', [], (err, totalRow) => {
            if (err) { reject(err); return; }
            db.get("SELECT COUNT(*) as hasPhoto FROM students WHERE photo_path != '' AND photo_path IS NOT NULL", [], (err, photoRow) => {
                if (err) { reject(err); return; }
                resolve({ total: totalRow.total, hasPhoto: photoRow.hasPhoto });
            });
        });
    });
}

// ========== 成绩表操作 ==========

function saveScore(score) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(`
            INSERT INTO scores (uid, name, sport_id, sport_name, duration, legal, illegal, class_name, score_time, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            score.uid,
            score.name || '',
            score.sportId || '',
            score.sportName || '',
            score.duration || 0,
            score.legal || 0,
            score.illegal || 0,
            score.className || '',
            score.scoreTime || (score.completedTime ? new Date(score.completedTime).toISOString() : now),
            score.source || '累计',
            now
        ], function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, ...score, created_at: now });
        });
    });
}

function saveScores(scores) {
    return new Promise(async (resolve, reject) => {
        if (!db) {
            reject(new Error('数据库未初始化'));
            return;
        }
        const now = new Date().toISOString();
        try {
            await runSql('BEGIN TRANSACTION');
            for (const score of scores) {
                await runSql(`
                    INSERT INTO scores (uid, name, sport_id, sport_name, duration, legal, illegal, class_name, score_time, source, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    score.uid,
                    score.name || '',
                    score.sportId || '',
                    score.sportName || '',
                    score.duration || 0,
                    score.legal || 0,
                    score.illegal || 0,
                    score.className || '',
                    score.scoreTime || (score.completedTime ? new Date(score.completedTime).toISOString() : now),
                    score.source || '累计',
                    now
                ]);
            }
            await runSql('COMMIT');
            resolve();
        } catch (err) {
            db.run('ROLLBACK', () => reject(err));
        }
    });
}

function getRecentScores(limit = 300) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM scores ORDER BY score_time DESC LIMIT ?
        `, [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getScoreByUidAndTime(uid, scoreTime) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT id FROM scores WHERE uid = ? AND score_time = ?
        `, [uid, scoreTime], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function getTodayActiveCount() {
    return new Promise((resolve, reject) => {
        const today = new Date().toLocaleDateString();
        db.all(`SELECT uid, score_time FROM scores`, [], (err, rows) => {
            if (err) { reject(err); return; }
            const activeUids = new Set();
            for (const row of rows) {
                const recordDate = row.score_time ? new Date(row.score_time).toLocaleDateString() : '';
                if (recordDate === today) activeUids.add(row.uid);
            }
            resolve(activeUids.size);
        });
    });
}

function getScoreCount() {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as total FROM scores`, [], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.total : 0);
        });
    });
}

function clearAllScores() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM scores', [], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = {
    initDatabase,
    getAllStudents,
    upsertStudent,
    upsertMultipleStudents,
    deleteStudent,
    deleteMultipleStudents,
    clearAllStudents,
    getStats,
    // 成绩表
    saveScore,
    saveScores,
    getRecentScores,
    getScoreByUidAndTime,
    getTodayActiveCount,
    getScoreCount,
    clearAllScores
};
