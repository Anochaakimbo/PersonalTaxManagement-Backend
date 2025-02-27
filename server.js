var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mysql = require('mysql');
var multer = require('multer');
var path = require('path');
var fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var dbConn = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3308
});

dbConn.connect();

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

// 📌 ตั้งค่า multer สำหรับอัปโหลดรูปภาพ
const imageStorage = multer.diskStorage({
    destination: './uploads/images/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const uploadDocument = multer({ storage: documentStorage });
const uploadImage = multer({ storage: imageStorage });

// 📌 API อัปโหลดเอกสาร
app.post('/upload-document/:user_id', uploadDocument.single('document'), (req, res) => {
    const user_id = req.params.user_id;
    const document_url = `/uploads/documents/${req.file.filename}`;

    if (!user_id || !req.file) {
        return res.status(400).send({ error: true, message: 'กรุณาแนบไฟล์และระบุ user_id' });
    }

    const sql = `INSERT INTO user_documents (user_id, document_url) VALUES (?, ?)`;
    dbConn.query(sql, [user_id, document_url], (err, result) => {
        if (err) {
            return res.status(500).send({ error: true, message: 'Upload failed' });
        }
        res.send({ success: true, document_url });
    });
});

// 📌 API อัปโหลดรูปภาพ
app.post('/upload-image/:user_id', uploadImage.single('image'), (req, res) => {
    const user_id = req.params.user_id;
    const image_url = `/uploads/images/${req.file.filename}`;

    if (!user_id || !req.file) {
        return res.status(400).send({ error: true, message: 'กรุณาแนบไฟล์รูปและระบุ user_id' });
    }

    const sql = `INSERT INTO user_documents (user_id, document_url) VALUES (?, ?)`;
    dbConn.query(sql, [user_id, image_url], (err, result) => {
        if (err) {
            return res.status(500).send({ error: true, message: 'Upload failed' });
        }
        res.send({ success: true, image_url });
    });
});

// 📌 API ดึงเอกสารและรูปภาพของผู้ใช้
app.get('/user-files/:user_id', (req, res) => {
    const user_id = req.params.user_id;
    const sql = `SELECT id, document_url, uploaded_at FROM user_documents WHERE user_id = ?`;

    dbConn.query(sql, [user_id], (err, results) => {
        if (err) {
            return res.status(500).send({ error: true, message: 'Error fetching files' });
        }
        res.send(results);
    });
});

// 📌 API ลบเอกสารหรือรูปภาพ
app.delete('/delete-file/:id', (req, res) => {
    const file_id = req.params.id;
    
    // ค้นหาที่อยู่ของไฟล์ก่อนลบ
    const findFileQuery = `SELECT document_url FROM user_documents WHERE id = ?`;
    dbConn.query(findFileQuery, [file_id], (err, results) => {
        if (err) {
            return res.status(500).send({ error: true, message: 'Error finding file' });
        }

        if (results.length === 0) {
            return res.status(400).send({ error: true, message: 'File not found' });
        }

        const filePath = `.${results[0].document_url}`;
        
        // ลบไฟล์จากเซิร์ฟเวอร์
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Failed to delete file:', err);
            }
        });

        // ลบข้อมูลจากฐานข้อมูล
        const deleteQuery = `DELETE FROM user_documents WHERE id = ?`;
        dbConn.query(deleteQuery, [file_id], (err, result) => {
            if (err) {
                return res.status(500).send({ error: true, message: 'Error deleting file' });
            }
            res.send({ success: true, message: 'File deleted successfully' });
        });
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
