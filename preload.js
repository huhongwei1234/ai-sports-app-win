const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    isElectron: true,
    // config 改为异步 IPC 获取，preload 中不再直接读文件
    getConfig: () => ipcRenderer.invoke('app:getConfig'),
    getDataPath: () => ipcRenderer.invoke('app:getDataPath'),

    // 学生数据库 IPC
    dbGetAll: () => ipcRenderer.invoke('db:getAll'),
    dbUpsert: (student) => ipcRenderer.invoke('db:upsert', student),
    dbUpsertMultiple: (students) => ipcRenderer.invoke('db:upsertMultiple', students),
    dbDelete: (uid) => ipcRenderer.invoke('db:delete', uid),
    dbDeleteMultiple: (uids) => ipcRenderer.invoke('db:deleteMultiple', uids),
    dbClear: () => ipcRenderer.invoke('db:clear'),
    dbGetStats: () => ipcRenderer.invoke('db:getStats'),

    // 成绩表 IPC
    scoreSave: (score) => ipcRenderer.invoke('score:save', score),
    scoreSaveMultiple: (scores) => ipcRenderer.invoke('score:saveMultiple', scores),
    scoreGetRecent: (limit) => ipcRenderer.invoke('score:getRecent', limit),
    scoreExists: (uid, scoreTime) => ipcRenderer.invoke('score:exists', uid, scoreTime),
    scoreGetTodayActive: () => ipcRenderer.invoke('score:getTodayActive'),
    scoreGetCount: () => ipcRenderer.invoke('score:getCount'),
    scoreClear: () => ipcRenderer.invoke('score:clear'),

    // 照片 IPC
    photoSave: (uid, base64Data) => ipcRenderer.invoke('photo:save', uid, base64Data),
    photoDelete: (uid) => ipcRenderer.invoke('photo:delete', uid),
    photoGetBase64: (uid) => ipcRenderer.invoke('photo:getBase64', uid),
    photoExists: (uid) => ipcRenderer.invoke('photo:exists', uid),

    // 备份/导入 IPC
    exportSyncedWithPhotos: (data) => ipcRenderer.invoke('export:syncedWithPhotos', data),
    backupData: () => ipcRenderer.invoke('backup:data'),
    readBackup: () => ipcRenderer.invoke('restore:readBackup'),
});

console.log('AI体育管理系统 preload 已加载');
