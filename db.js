const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let studentsData = [];
let dataPath = '';

function initDataFile() {
    try {
        const userDataPath = app.getPath('userData');
        dataPath = path.join(userDataPath, 'students.json');
        console.log('数据文件路径:', dataPath);
        
        if (fs.existsSync(dataPath)) {
            const data = fs.readFileSync(dataPath, 'utf8');
            studentsData = JSON.parse(data);
        } else {
            studentsData = [];
            saveData();
        }
        return true;
    } catch (err) {
        console.error('初始化数据文件失败:', err);
        studentsData = [];
        return false;
    }
}

function saveData() {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(studentsData, null, 2));
        return true;
    } catch (err) {
        console.error('保存数据失败:', err);
        return false;
    }
}

function getAllStudents() {
    return studentsData;
}

function getStudentByUid(uid) {
    return studentsData.find(s => s.uid === uid);
}

function upsertStudent(student) {
    const index = studentsData.findIndex(s => s.uid === student.uid);
    const newStudent = {
        ...student,
        updated_at: new Date().toISOString()
    };
    
    if (index === -1) {
        newStudent.created_at = new Date().toISOString();
        studentsData.push(newStudent);
    } else {
        newStudent.created_at = studentsData[index].created_at;
        studentsData[index] = newStudent;
    }
    
    saveData();
    return newStudent;
}

function deleteStudent(uid) {
    const index = studentsData.findIndex(s => s.uid === uid);
    if (index !== -1) {
        studentsData.splice(index, 1);
        saveData();
        return true;
    }
    return false;
}

function getStats() {
    return {
        total: studentsData.length,
        hasPhoto: studentsData.filter(s => s.photo_base64).length
    };
}

module.exports = {
    initDataFile,
    getAllStudents,
    getStudentByUid,
    upsertStudent,
    deleteStudent,
    getStats
};
