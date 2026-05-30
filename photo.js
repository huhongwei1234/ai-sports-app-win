const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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

function getPhotoDir() {
    const dir = path.join(getDataDir(), 'photos');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getPhotoPath(uid) {
    return path.join(getPhotoDir(), `${uid}.jpg`);
}

function savePhoto(uid, base64Data) {
    try {
        const photoDir = getPhotoDir();
        const filePath = getPhotoPath(uid);
        console.log('[photo.js] 保存照片 uid=', uid, '目录=', photoDir, '路径=', filePath, 'base64长度=', base64Data ? base64Data.length : 0);
        if (!base64Data || base64Data.length < 100) {
            console.error('[photo.js] base64 数据太短，拒绝保存:', uid, '长度=', base64Data ? base64Data.length : 0);
            return null;
        }
        const buffer = Buffer.from(base64Data, 'base64');
        if (!buffer || buffer.length === 0) {
            console.error('[photo.js] base64 解码后为空，拒绝保存:', uid);
            return null;
        }
        // 确保目录存在
        if (!fs.existsSync(photoDir)) {
            console.log('[photo.js] 创建目录:', photoDir);
            fs.mkdirSync(photoDir, { recursive: true });
        }
        fs.writeFileSync(filePath, buffer);
        // 验证写入
        if (!fs.existsSync(filePath)) {
            console.error('[photo.js] 文件写入后不存在:', filePath);
            return null;
        }
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            console.error('[photo.js] 文件写入后大小为0:', filePath);
            return null;
        }
        console.log('[photo.js] 照片保存成功:', filePath, '大小=', stats.size);
        return filePath;
    } catch (err) {
        console.error('[photo.js] 保存照片失败 uid=', uid, '错误=', err.message, err.stack);
        return null;
    }
}

function deletePhoto(uid) {
    try {
        const filePath = getPhotoPath(uid);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (err) {
        console.error('删除照片失败:', err);
        return false;
    }
}

function deleteMultiplePhotos(uids) {
    for (const uid of uids) {
        deletePhoto(uid);
    }
}

function getPhotoBase64(uid) {
    try {
        const filePath = getPhotoPath(uid);
        if (!fs.existsSync(filePath)) return null;
        const buffer = fs.readFileSync(filePath);
        return buffer.toString('base64');
    } catch (err) {
        console.error('读取照片失败:', err);
        return null;
    }
}

function photoExists(uid) {
    return fs.existsSync(getPhotoPath(uid));
}

module.exports = {
    getPhotoDir,
    getPhotoPath,
    savePhoto,
    deletePhoto,
    deleteMultiplePhotos,
    getPhotoBase64,
    photoExists
};
