var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mysql = require('mysql');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/', function (req, res) {
    return res.send({ error: true, message: 'Test Student Web API' });
});

var dbConn = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});


dbConn.connect();

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'profile/');
    },
    filename: function (req, file, cb) {
        cb(null, `profile_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage: storage });

const fs = require('fs');

const uploadDir = path.join(__dirname, 'profile');

// ตรวจสอบว่ามีโฟลเดอร์หรือไม่ ถ้าไม่มีให้สร้าง
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}


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
            let insertData;
                insertData = `INSERT INTO user(email, password, fname, lname, gender) VALUES ('${email}', '${password_hash}', '${fname}', '${lname}', '${gender}')`;

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
                        "id": results[0].id,  // ✅ เพิ่ม id กลับไปด้วย
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
                gender: results[0].gender,
                profile_image: results[0].profile_image || null
            });
        } else {
            return res.status(400).send({ error: true, message: 'User not found!!' });
        }
    });
});

app.put('/updateUser/:id', function (req, res) {
    let userId = req.params.id;
    let { email, fname, lname, gender } = req.body;

    if (!userId || !email || !fname || !lname || !gender) {
        return res.status(400).send({ error: true, message: 'Missing fields' });
    }

    dbConn.query(
        'UPDATE user SET email = ?, fname = ?, lname = ?, gender = ? WHERE id = ?',
        [email, fname, lname, gender, userId],
        function (error, results) {
            if (error) throw error;
            return res.send({ message: 'User updated successfully' });
        }
    );
});

app.post('/change-password', function (req, res) {
    let { userId, oldPassword, newPassword } = req.body;

    if (!userId || !oldPassword || !newPassword) {
        return res.status(400).send({ error: true, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    // ✅ ดึงรหัสผ่านเก่าจากฐานข้อมูล
    dbConn.query('SELECT password FROM user WHERE id = ?', [userId], function (error, results) {
        if (error) {
            console.error("❌ Database error:", error);
            return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในการดึงรหัสผ่าน' });
        }

        if (results.length === 0) {
            return res.status(404).send({ error: true, message: 'ไม่พบผู้ใช้' });
        }

        const storedPassword = results[0].password;

        // ✅ ตรวจสอบรหัสผ่านเก่าด้วย bcrypt.compare()
        bcrypt.compare(oldPassword, storedPassword, function (err, isMatch) {
            if (err) {
                console.error("❌ Bcrypt error:", err);
                return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน' });
            }

            if (!isMatch) {
                return res.status(400).send({ error: true, message: 'รหัสผ่านเก่าไม่ถูกต้อง' });
            }

            // ✅ ถ้ารหัสผ่านถูกต้อง แฮชรหัสผ่านใหม่
            bcrypt.genSalt(10, function (err, salt) {
                if (err) {
                    console.error("❌ Bcrypt error:", err);
                    return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในการสร้าง Salt' });
                }

                bcrypt.hash(newPassword, salt, function (err, hashedNewPassword) {
                    if (err) {
                        console.error("❌ Bcrypt error:", err);
                        return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในการแฮชรหัสผ่านใหม่' });
                    }

                    // ✅ อัปเดตรหัสผ่านใหม่ในฐานข้อมูล
                    dbConn.query('UPDATE user SET password = ? WHERE id = ?', [hashedNewPassword, userId], function (error) {
                        if (error) {
                            console.error("❌ Database error:", error);
                            return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในการอัปเดตรหัสผ่าน' });
                        }

                        return res.send({ message: 'เปลี่ยนรหัสผ่านสำเร็จ!' });
                    });
                });
            });
        });
    });
});


app.get('/get-password/:id', function (req, res) {
    let userId = req.params.id;

    if (!userId) {
        return res.status(400).send({ error: true, message: 'Missing user ID' });
    }

    // ✅ ใช้ dbConn.query() แทน query()
    dbConn.query('SELECT password FROM user WHERE id = ?', [userId], function (error, results) {
        if (error) {
            console.error("❌ Database error:", error);
            return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในการดึงรหัสผ่าน' });
        }

        if (results.length === 0) {
            return res.status(404).send({ error: true, message: 'User not found' });
        }

        return res.json({ password: results[0].password }); // ✅ ส่งค่า JSON กลับไป
    });
});






app.post('/uploadProfileImage/:id', upload.single('profile_image'), function (req, res) {
    let userId = req.params.id;

    if (!req.file) {
        return res.status(400).send({ error: true, message: 'กรุณาอัปโหลดไฟล์รูปภาพ' });
    }

    let imagePath = `http://10.0.2.2/projectApi/profile/${req.file.filename}`;

    dbConn.query(
        'UPDATE user SET profile_image = ? WHERE id = ?',
        [imagePath, userId],
        function (error, results) {
            if (error) {
                console.error("Database Error:", error); // Log error เพื่อ Debug
                return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในระบบฐานข้อมูล' });
            }
    
            if (results.affectedRows === 0) {
                return res.status(404).send({ error: true, message: 'ไม่พบผู้ใช้ที่ต้องการอัปเดตรูปภาพ' });
            }
    
            return res.send({ message: 'อัปโหลดรูปภาพสำเร็จ!', profile_image: imagePath });
        }
    );
    
});

app.get('/getUserProfile/:id', function (req, res) {
    let userId = parseInt(req.params.id, 10);

    dbConn.query(
        'SELECT profile_image FROM user WHERE id = ?',
        [userId],
        function (error, results) {
            if (error) {
                console.error("Database Error:", error);
                return res.status(500).send({ error: true, message: 'เกิดข้อผิดพลาดในระบบฐานข้อมูล' });
            }

            if (results.length === 0) {
                return res.status(404).send({ error: true, message: 'ไม่พบผู้ใช้' });
            }

            return res.send({ profile_image: results[0].profile_image });
        }
    );
});






app.listen(3000, function () {
    console.log('Node app is running on port 3000');
});

module.exports = app;
