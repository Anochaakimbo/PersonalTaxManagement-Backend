var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mysql = require('mysql');
var multer = require('multer');
var path = require('path');
var fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

app.use('/uploads', express.static('uploads'));

app.use(express.json()); // ✅ ต้องใช้ middleware นี้
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



var dbConn = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

dbConn.connect();

const util = require('util');
const query = util.promisify(dbConn.query).bind(dbConn);
// 📌 ตรวจสอบและสร้างโฟลเดอร์สำหรับอัปโหลดไฟล์อัตโนมัติ
const uploadDirs = ['./uploads/documents/', './uploads/images/'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log('📂 Created folder:', dir);
    }
});

// 📌 ตั้งค่า multer สำหรับอัปโหลดเอกสาร
const documentStorage = multer.diskStorage({
    destination: './uploads/documents/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const imageStorage = multer.diskStorage({
    destination: './uploads/images/',
    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname) || '.jpg'; // ✅ ถ้าไม่มี ใช้ค่าเริ่มต้น
        cb(null, Date.now() + extension);
    }
});


const uploadDocument = multer({ storage: documentStorage });
const uploadImage = multer({ storage: imageStorage });

// 📌 API อัปโหลดเอกสาร
app.post('/upload-document/:user_id', uploadDocument.single('document'), (req, res) => {
    console.log("req.file:", req.file);
    console.log("req.body:", req.body);
    console.log("req.params:", req.params);

    if (!req.file) {
        return res.status(400).send({ error: true, message: 'ไฟล์หายไป!' });
    }

    res.send({ success: true, message: 'Upload success' });
});

// ส่วนของ API อัปโหลดรูปภาพ - แก้ไขตรงการเก็บพาธของไฟล์รูปภาพ
app.post('/upload-image/:user_id', uploadImage.single('file'), (req, res) => {
    const year = req.body.year;  // รับปีจาก body
    if (!req.file) {
        return res.status(400).send({ error: true, message: 'ไฟล์รูปภาพหายไป' });
    }

    const user_id = req.params.user_id;
    // แก้ไขพาธให้ถูกต้อง
    const image_url = '/uploads/images/${req.file.filename}';

    const sql = 'INSERT INTO user_documents (user_id, document_url, year) VALUES (?, ?, ?)';
    dbConn.query(sql, [user_id, image_url, year], (err, result) => {
        if (err) {
            return res.status(500).send({ error: true, message: 'Upload failed' });
        }
        res.send({ success: true, image_url });
    });
});

// แก้ไข API ดึงข้อมูลเอกสารตาม ID
app.get('/user-files/document/:document_id', (req, res) => {
    const document_id = req.params.document_id;

    console.log('📌 กำลังดึงข้อมูลเอกสาร ID:', document_id);

    const sql = 'SELECT id, document_url, uploaded_at, year FROM user_documents WHERE id = ? AND deleted_at IS NULL';

    dbConn.query(sql, [document_id], (err, results) => {
        if (err) {
            console.error('❌ SQL Error:', err);
            return res.status(500).send({ error: true, message: 'Error fetching document' });
        }

        if (results.length === 0) {
            return res.status(404).send({ error: true, message: 'Document not found' });
        }

        console.log('✅ ผลลัพธ์ที่ได้:', results[0]);
        res.send(results[0]);
    });
});

app.get('/user-files/:user_id/year/:year', (req, res) => {
    const user_id = req.params.user_id;
    const year = req.params.year;  // รับปีที่ต้องการกรอง

    console.log('📌 กำลังดึงข้อมูลของ user_id:', user_id, 'ปี:', year); // ✅ Debug

    const sql = `SELECT id, document_url, uploaded_at FROM user_documents WHERE user_id = ? AND year = ? AND deleted_at IS NULL`;

    dbConn.query(sql, [user_id, year], (err, results) => {
        if (err) {
            console.error('❌ SQL Error:', err); // ✅ Debug เช็ก error
            return res.status(500).send({ error: true, message: 'Error fetching files' });
        }

        // เพิ่มฟิลด์ year โดยคำนวณจาก uploaded_at
        const documentsWithYear = results.map(document => {
            const year = new Date(document.uploaded_at).getFullYear();
            return { ...document, year: year };
        });

        console.log('✅ ผลลัพธ์ที่ได้:', documentsWithYear); // ✅ ดูข้อมูลที่ดึงออกมาจากฐานข้อมูล

        res.send(documentsWithYear);
    });
});


// 📌 API ลบเอกสารหรือรูปภาพ
app.delete('/delete-file/:id', (req, res) => {
    const file_id = req.params.id;

    // อัปเดตค่า deleted_at ให้เป็น timestamp ปัจจุบัน
    const softDeleteQuery = `UPDATE user_documents SET deleted_at = NOW() WHERE id = ?`;

    dbConn.query(softDeleteQuery, [file_id], (err, result) => {
        if (err) {
            return res.status(500).send({ error: true, message: 'Error deleting file' });
        }
        res.send({ success: true, message: 'File soft deleted successfully' });
    });
});




// 🚀 API การจัดการผู้ใช้ (โค้ดเดิมของคุณ)
app.post('/insertUser', async function (req, res) {
    let post = req.body;
    let { email, password, fname, lname, gender } = post;
    const salt = await bcrypt.genSalt(10);
    let password_hash = await bcrypt.hash(password, salt);

    if (!post) {
        return res.status(400).send({ error: true, message: 'Please provide student data' });
    }

    dbConn.query('SELECT * FROM user WHERE email = ?', email, function (error, results, fields) {
        if (error) throw error;

        if (results[0]) {
            return res.status(400).send({ error: true, message: 'This User is already in the database.' });
        } else {
            let insertData = `INSERT INTO user(email, password, fname, lname, gender) VALUES ('${email}', '${password_hash}', '${fname}', '${lname}', '${gender}')`;
            dbConn.query(insertData, (error, results) => {
                if (error) throw error;
                return res.send(results);
            });
        }
    });
});

app.post('/login', async function (req, res) {
    let user = req.body;
    let { email, password } = user;

    if (!email || !password) {
        return res.status(400).send({ error: true, message: 'Please provide the Email and password.' });
    }

    dbConn.query('SELECT * FROM user WHERE email = ?', [email], function (error, results, fields) {
        if (error) throw error;

        if (results[0]) {
            bcrypt.compare(password, results[0].password, function (error, result) {
                if (error) throw error;

                if (result) {
                    return res.send({ 
                        "success": 1, 
                        "id": results[0].id,  
                        "email": results[0].email
                    });
                } else {
                    return res.send({ "success": 0 });
                }
            });
        } else {
            return res.send({ success: 0 });
        }
    });
});

app.get('/search/:id', function (req, res) {
    let id = req.params.id;

    if (!id) {
        return res.status(400).send({ error: true, message: 'Please provide the ID' });
    }

    dbConn.query('SELECT * FROM user WHERE id = ?', id, function (error, results, fields) {
        if (error) throw error;

        if (results[0]) {
            return res.send({
                id : results[0].id,
                email: results[0].email,
                fname: results[0].fname,
                lname: results[0].lname,
                gender: results[0].gender
            });
        } else {
            return res.status(400).send({ error: true, message: 'User not found!!' });
        }
    });
});

// 🚀 เปิดเซิร์ฟเวอร์
app.listen(3000, function () {
    console.log('Node app is running on port 3000');
});

module.exports = app;