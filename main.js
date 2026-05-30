const { app, BrowserWindow, Menu, ipcMain, protocol, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./sqlite-db');
const photo = require('./photo');

protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false
        },
        title: 'AI体育管理系统',
        show: false
    });

    // 新路径：_internal/www/index.html
    const indexPath = path.join(__dirname, '_internal', 'www', 'index.html');
    mainWindow.loadFile(indexPath);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // 启动时版权弹窗
        dialog.showMessageBoxSync(mainWindow, {
            type: 'info',
            title: '版权声明',
            message: '版权声明',
            detail: '本软件程序（界面、操作逻辑、打包方式）版权归 XLH 所有。相关技术接口及数据版权归原权利方所有。未经授权禁止破解、二次打包、移除，版权声明。',
            buttons: ['我知道了'],
            defaultId: 0
        });
    });

    const menuTemplate = [
        {
            label: '文件',
            submenu: [
                { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
                { label: '开发者工具', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.openDevTools() },
                { type: 'separator' },
                { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC handlers for SQLite (students)
ipcMain.handle('db:getAll', async () => {
    return await db.getAllStudents();
});

ipcMain.handle('db:upsert', async (event, student) => {
    return await db.upsertStudent(student);
});

ipcMain.handle('db:upsertMultiple', async (event, students) => {
    console.log('[IPC db:upsertMultiple] 收到, 数量=', students ? students.length : 0);
    try {
        const result = await db.upsertMultipleStudents(students);
        console.log('[IPC db:upsertMultiple] 成功');
        return result;
    } catch (e) {
        console.error('[IPC db:upsertMultiple] 失败:', e.message);
        throw e;
    }
});

ipcMain.handle('db:delete', async (event, uid) => {
    const result = await db.deleteStudent(uid);
    if (result) photo.deletePhoto(uid);
    return result;
});

ipcMain.handle('db:deleteMultiple', async (event, uids) => {
    const result = await db.deleteMultipleStudents(uids);
    photo.deleteMultiplePhotos(uids);
    return result;
});

ipcMain.handle('db:clear', async () => {
    const all = await db.getAllStudents();
    all.forEach(s => photo.deletePhoto(s.uid));
    return await db.clearAllStudents();
});

ipcMain.handle('db:getStats', async () => {
    return await db.getStats();
});

// IPC handlers for scores
ipcMain.handle('score:save', async (event, score) => {
    return await db.saveScore(score);
});

ipcMain.handle('score:saveMultiple', async (event, scores) => {
    return await db.saveScores(scores);
});

ipcMain.handle('score:getRecent', async (event, limit) => {
    return await db.getRecentScores(limit);
});

ipcMain.handle('score:exists', async (event, uid, scoreTime) => {
    return await db.getScoreByUidAndTime(uid, scoreTime);
});

ipcMain.handle('score:getTodayActive', async () => {
    return await db.getTodayActiveCount();
});

ipcMain.handle('score:getCount', async () => {
    return await db.getScoreCount();
});

ipcMain.handle('score:clear', async () => {
    return await db.clearAllScores();
});

// IPC handlers for Photo
ipcMain.handle('photo:save', async (event, uid, base64Data) => {
    console.log('[IPC photo:save] uid=', uid, 'base64长度=', base64Data ? base64Data.length : 0);
    const result = photo.savePhoto(uid, base64Data);
    console.log('[IPC photo:save] 结果=', result);
    return result;
});

ipcMain.handle('photo:delete', async (event, uid) => {
    return photo.deletePhoto(uid);
});

ipcMain.handle('photo:getBase64', async (event, uid) => {
    return photo.getPhotoBase64(uid);
});

ipcMain.handle('photo:exists', async (event, uid) => {
    return photo.photoExists(uid);
});

// 导出已入库学生列表（含照片）
ipcMain.handle('export:syncedWithPhotos', async (event, { excelBase64, photoUids }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择导出文件夹',
        properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, reason: 'cancelled' };
    }

    const exportDir = result.filePaths[0];
    const photosDir = path.join(exportDir, 'photos');

    try {
        // 创建 photos 文件夹
        if (!fs.existsSync(photosDir)) {
            fs.mkdirSync(photosDir, { recursive: true });
        }

        // 写入 Excel 文件
        const excelPath = path.join(exportDir, '学生列表.xlsx');
        fs.writeFileSync(excelPath, Buffer.from(excelBase64, 'base64'));

        // 复制照片
        const photoSourceDir = photo.getPhotoDir();
        let copied = 0;
        let missing = 0;
        for (const uid of photoUids) {
            const src = path.join(photoSourceDir, `${uid}.jpg`);
            const dst = path.join(photosDir, `${uid}.jpg`);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dst);
                copied++;
            } else {
                missing++;
            }
        }

        return { success: true, exportDir, copied, missing };
    } catch (err) {
        console.error('导出失败:', err);
        return { success: false, reason: err.message };
    }
});

// 备份 data 文件夹（包含 db + photos）
ipcMain.handle('backup:data', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择备份存放位置',
        properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, reason: 'cancelled' };
    }

    // backup:data 使用 photo 模块的 getPhotoDir 来获取正确的 data 目录
    const dataDir = path.dirname(photo.getPhotoDir());
    const backupDir = result.filePaths[0];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const targetDir = path.join(backupDir, `ai-sports-backup-${timestamp}`);

    try {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        let dbCopied = false;
        let dbSize = 0;
        // 复制 students.db
        const dbSrc = path.join(dataDir, 'students.db');
        const dbDst = path.join(targetDir, 'students.db');
        if (fs.existsSync(dbSrc)) {
            fs.copyFileSync(dbSrc, dbDst);
            dbCopied = true;
            dbSize = fs.statSync(dbDst).size;
        }

        // 复制 photos 文件夹
        let copied = 0;
        const photosSrc = path.join(dataDir, 'photos');
        const photosDst = path.join(targetDir, 'photos');
        if (fs.existsSync(photosSrc)) {
            fs.mkdirSync(photosDst, { recursive: true });
            const files = fs.readdirSync(photosSrc);
            for (const file of files) {
                if (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')) {
                    fs.copyFileSync(path.join(photosSrc, file), path.join(photosDst, file));
                    copied++;
                }
            }
        }
        return { success: true, targetDir, copied, dbCopied, dbSize };
    } catch (err) {
        console.error('备份失败:', err);
        return { success: false, reason: err.message };
    }
});

// 读取备份目录内容
ipcMain.handle('restore:readBackup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择备份文件夹',
        properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, reason: 'cancelled' };
    }

    const backupDir = result.filePaths[0];
    const dbPath = path.join(backupDir, 'students.db');
    const photosDir = path.join(backupDir, 'photos');

    if (!fs.existsSync(dbPath)) {
        return { success: false, reason: '备份中未找到 students.db' };
    }

    try {
        // 用 sqlite3 直接读取备份的 db
        const sqlite3 = require('sqlite3').verbose();
        const backupDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

        const students = await new Promise((resolve, reject) => {
            backupDb.all('SELECT * FROM students ORDER BY created_at DESC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        backupDb.close();

        // 读取照片 base64
        const photoMap = {};
        if (fs.existsSync(photosDir)) {
            const files = fs.readdirSync(photosDir);
            for (const file of files) {
                if (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')) {
                    const uid = path.basename(file, path.extname(file));
                    const buffer = fs.readFileSync(path.join(photosDir, file));
                    photoMap[uid] = buffer.toString('base64');
                }
            }
        }

        return { success: true, students, photoMap, count: students.length };
    } catch (err) {
        console.error('读取备份失败:', err);
        return { success: false, reason: err.message };
    }
});

// 数据迁移：确保数据在正确的位置
async function migrateOldData() {
    const devDataDir = path.join(__dirname, 'data');
    const userDataRoot = app.getPath('userData');
    const userDataDir = path.join(userDataRoot, 'data');

    try {
        if (app.isPackaged) {
            // 打包后：确保 userData/data 存在
            if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
            
            // 1) 迁移项目目录下的旧数据 → userData/data
            if (fs.existsSync(devDataDir)) {
                // 迁移数据库
                const oldDb = path.join(devDataDir, 'students.db');
                const newDb = path.join(userDataDir, 'students.db');
                if (fs.existsSync(oldDb)) {
                    const oldSize = fs.statSync(oldDb).size;
                    const newExists = fs.existsSync(newDb);
                    const newSize = newExists ? fs.statSync(newDb).size : 0;
                    if (oldSize > 0 && (!newExists || oldSize > newSize)) {
                        fs.copyFileSync(oldDb, newDb);
                        console.log('[迁移] students.db 已迁移到 userData/data');
                    }
                }
                // 迁移照片
                const oldPhotos = path.join(devDataDir, 'photos');
                const newPhotos = path.join(userDataDir, 'photos');
                if (fs.existsSync(oldPhotos)) {
                    if (!fs.existsSync(newPhotos)) fs.mkdirSync(newPhotos, { recursive: true });
                    let migratedCount = 0;
                    for (const file of fs.readdirSync(oldPhotos)) {
                        const src = path.join(oldPhotos, file);
                        const dst = path.join(newPhotos, file);
                        if (!fs.existsSync(dst) && fs.statSync(src).size > 0) {
                            fs.copyFileSync(src, dst);
                            migratedCount++;
                        }
                    }
                    if (migratedCount > 0) {
                        console.log(`[迁移] ${migratedCount} 张照片已迁移到 userData/data`);
                    }
                }
            }
            
            // 2) 迁移 userData 根目录下的旧数据 → userData/data（历史版本遗留）
            const oldRootDb = path.join(userDataRoot, 'students.db');
            const newDb = path.join(userDataDir, 'students.db');
            if (fs.existsSync(oldRootDb)) {
                const oldSize = fs.statSync(oldRootDb).size;
                const newExists = fs.existsSync(newDb);
                const newSize = newExists ? fs.statSync(newDb).size : 0;
                if (oldSize > 0 && (!newExists || oldSize > newSize)) {
                    fs.copyFileSync(oldRootDb, newDb);
                    console.log('[迁移] userData 根目录 students.db 已迁移到 userData/data');
                }
            }
            const oldRootPhotos = path.join(userDataRoot, 'photos');
            const newPhotos = path.join(userDataDir, 'photos');
            if (fs.existsSync(oldRootPhotos)) {
                if (!fs.existsSync(newPhotos)) fs.mkdirSync(newPhotos, { recursive: true });
                let migratedCount = 0;
                for (const file of fs.readdirSync(oldRootPhotos)) {
                    const src = path.join(oldRootPhotos, file);
                    const dst = path.join(newPhotos, file);
                    if (!fs.existsSync(dst) && fs.statSync(src).size > 0) {
                        fs.copyFileSync(src, dst);
                        migratedCount++;
                    }
                }
                if (migratedCount > 0) {
                    console.log(`[迁移] ${migratedCount} 张旧照片已迁移到 userData/data/photos`);
                }
            }
        } else {
            // 开发模式：如果数据被误存到 userData，迁移回项目目录
            if (!fs.existsSync(userDataDir)) return;
            if (fs.existsSync(devDataDir) && fs.readdirSync(devDataDir).length > 0) return;
            if (!fs.existsSync(devDataDir)) fs.mkdirSync(devDataDir, { recursive: true });
            const oldDb = path.join(userDataDir, 'students.db');
            const newDb = path.join(devDataDir, 'students.db');
            if (fs.existsSync(oldDb) && !fs.existsSync(newDb)) {
                fs.copyFileSync(oldDb, newDb);
                console.log('[迁移] students.db 已迁回项目目录');
            }
            const oldPhotos = path.join(userDataDir, 'photos');
            const newPhotos = path.join(devDataDir, 'photos');
            if (fs.existsSync(oldPhotos)) {
                if (!fs.existsSync(newPhotos)) fs.mkdirSync(newPhotos, { recursive: true });
                for (const file of fs.readdirSync(oldPhotos)) {
                    const src = path.join(oldPhotos, file);
                    const dst = path.join(newPhotos, file);
                    if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
                }
                console.log(`[迁移] 照片已迁回项目目录`);
            }
        }
    } catch (err) {
        console.error('[迁移] 数据迁移失败:', err);
    }
}

// 获取数据目录路径（供前端显示）
ipcMain.handle('app:getDataPath', async () => {
    // 返回实际生效的数据目录（和 photo.js / sqlite-db.js 一致）
    const photo = require('./photo');
    return path.dirname(photo.getPhotoDir());
});

// 获取 config.json 路径（打包后在 asar.unpacked，开发时在项目目录）
function getConfigPath() {
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', '_internal', 'www', 'config.json');
    if (fs.existsSync(unpackedPath)) {
        return unpackedPath;
    }
    return path.join(__dirname, 'config.json');
}

// 动态读取应用配置
ipcMain.handle('app:getConfig', async () => {
    const configPath = getConfigPath();
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { schoolName: '实验小学' };
    }
});

app.whenReady().then(async () => {
    protocol.handle('app', (request) => {
        const url = new URL(request.url);
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.startsWith('/')) pathname = pathname.slice(1);

        // 特殊处理 logo.jpg 请求
        if (pathname === 'logo.jpg') {
            const logoPath = path.join(__dirname, 'logo.jpg');
            try {
                const data = fs.readFileSync(logoPath);
                return new Response(data, { headers: { 'Content-Type': 'image/jpeg' } });
            } catch (e) {
                return new Response('Not Found', { status: 404 });
            }
        }

        // 优先使用项目目录，如果不可写则回退到 userData
        const dataRoot = path.dirname(photo.getPhotoDir());
        // pathname 可能已包含 data/ 前缀，去掉以避免重复拼接
        let relativePath = pathname;
        if (relativePath.startsWith('data/')) {
            relativePath = relativePath.slice(5);
        }
        const filePath = path.join(dataRoot, relativePath);
        // 安全检查：防止路径遍历
        if (!filePath.startsWith(dataRoot)) {
            return new Response('Forbidden', { status: 403 });
        }
        let data;
        try {
            data = fs.readFileSync(filePath);
        } catch (e) {
            return new Response('Not Found', { status: 404 });
        }
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.json') mimeType = 'application/json';
        else if (ext === '.html') mimeType = 'text/html';
        else if (ext === '.css') mimeType = 'text/css';
        else if (ext === '.js') mimeType = 'application/javascript';
        return new Response(data, { headers: { 'Content-Type': mimeType } });
    });
    // 启动时自动迁移旧数据（从 asar 内部或旧 __dirname/data 到 userData）
    await migrateOldData();

    // 允许摄像头和麦克风权限请求
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'camera' || permission === 'microphone') {
            callback(true);
        } else {
            callback(false);
        }
    });

    await db.initDatabase();
    createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });
