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
const crypto = require('crypto');
const nodemailer = require('nodemailer');
app.use('/uploads', express.static('uploads'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


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

const util = require('util');
const query = util.promisify(dbConn.query).bind(dbConn);

const uploadDirs1 = ['./uploads/documents/', './uploads/images/'];
uploadDirs1.forEach(dir => {
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
    const image_url = `/uploads/images/${req.file.filename}`;

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

    const sql = 'SELECT id, user_id, document_url, uploaded_at, year FROM user_documents WHERE id = ? AND deleted_at IS NULL';

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

    let imagePath = `http://10.0.2.2/taxApi/profile/${req.file.filename}`;

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


app.post("/insertIncome", async function (req, res) {
    let { incomebalance, incometype_id, email, year } = req.body;

    if (!incomebalance || !year || !incometype_id || !email) {
        return res.status(400).send({ error: true, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    if (isNaN(incomebalance) || isNaN(incometype_id)) {
        return res.status(400).send({ error: true, message: "ค่าที่ส่งมาต้องเป็นตัวเลข" });
    }

    // ✅ 1. ค้นหา user_id จาก email ก่อน
    let findUserQuery = "SELECT id FROM user WHERE email = ?";
    
    dbConn.query(findUserQuery, [email], (error, results) => {
        if (error) {
            console.log("❌ Error ในการค้นหา user_id:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการค้นหาผู้ใช้" });
        }

        if (results.length === 0) {
            return res.status(400).send({ error: true, message: "ไม่พบผู้ใช้ที่มีอีเมลนี้" });
        }

        let user_id = results[0].id;

        // ✅ 2. เพิ่มข้อมูลรายได้เข้าไป
        let insertQuery = "INSERT INTO income (incomebalance, incometype_id, user_id, year) VALUES (?, ?, ?, ?)";
        let values = [incomebalance, incometype_id, user_id, year];

        dbConn.query(insertQuery, values, (error, results) => {
            if (error) {
                console.log("❌ Error ในการบันทึก:", error);
                return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
            }

            return res.send({ success: 1, id: results.insertId, message: "เพิ่มข้อมูลรายได้สำเร็จ" });
        });
    });
});

app.get('/getAllIncomes', function (req, res) {
    let query = 'SELECT * FROM income;'

    dbConn.query(query, function (error, results) {
        if (error) {
            console.log("❌ Error:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
        }

        return res.send(results);
    });
});

app.get('/getIncomeByUser/:user_id', function (req, res) {
    let user_id = req.params.user_id;
    let query = `
        SELECT income.id, income.incomebalance, income.user_id, income.year, 
               income_type.incometype_name
        FROM income
        JOIN income_type ON income.incometype_id = income_type.id
        WHERE income.user_id = ?
    `;

    dbConn.query(query, [user_id], function (error, results) {
        if (error) {
            console.log("❌ Error:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
        }

        return res.send({ success: 1, data: results });
    });
});

app.post("/insertTaxDeduction", async function (req, res) {
    let { taxdeductiontype_balance, taxdeductiontype_id, email, year } = req.body;

    if (!taxdeductiontype_balance || !year || !taxdeductiontype_id || !email) {
        return res.status(400).send({ error: true, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    if (isNaN(taxdeductiontype_balance) || isNaN(taxdeductiontype_id)) {
        return res.status(400).send({ error: true, message: "ค่าที่ส่งมาต้องเป็นตัวเลข" });
    }

    // ✅ 1. ค้นหา user_id จาก email
    let findUserQuery = "SELECT id FROM user WHERE email = ?";
    
    dbConn.query(findUserQuery, [email], (error, userResults) => {
        if (error) {
            console.log("❌ Error ในการค้นหา user_id:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการค้นหาผู้ใช้" });
        }

        if (userResults.length === 0) {
            return res.status(400).send({ error: true, message: "ไม่พบผู้ใช้ที่มีอีเมลนี้" });
        }

        let user_id = userResults[0].id;

        // ✅ 2. ค้นหา taxdeductiontype_name จาก taxdeductiontype_id
        let findTaxDeductionTypeQuery = "SELECT taxdeductiontype_name FROM taxdeduction_type WHERE id = ?";
        
        dbConn.query(findTaxDeductionTypeQuery, [taxdeductiontype_id], (error, taxResults) => {
            if (error) {
                console.log("❌ Error ในการค้นหา taxdeductiontype_name:", error);
                return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการค้นหาประเภทค่าลดหย่อน" });
            }

            if (taxResults.length === 0) {
                return res.status(400).send({ error: true, message: "ไม่พบค่าลดหย่อนที่เลือก" });
            }

            let taxdeductiontype_name = taxResults[0].taxdeductiontype_name;

            // ✅ 3. บันทึกข้อมูลค่าลดหย่อนลงในตาราง taxdeduction
            let insertQuery = `
                INSERT INTO taxdeduction (taxdeductiontype_balance, taxdeductiontype_id, user_id, year)
                VALUES (?, ?, ?, ?)
            `;

            let values = [taxdeductiontype_balance, taxdeductiontype_id, user_id, year];

            dbConn.query(insertQuery, values, (error, results) => {
                if (error) {
                    console.log("❌ Error ในการบันทึก:", error);
                    return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
                }

                return res.send({
                    success: 1,
                    id: results.insertId,
                    taxdeductiontype_name: taxdeductiontype_name,
                    message: "เพิ่มข้อมูลค่าลดหย่อนสำเร็จ"
                });
            });
        });
    });
});

app.get('/getAllTaxDeductions', function (req, res) {
    let query = 'SELECT * FROM taxdeduction;'

    dbConn.query(query, function (error, results) {
        if (error) {
            console.log("❌ Error:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการดึงข้อมูลการหักภาษี" });
        }

        return res.send(results);
    });
});

app.delete('/deleteTaxDeduction/:id', function (req, res) {
    let taxdeduction_id = req.params.id;

    if (!taxdeduction_id) {
        return res.status(400).send({ error: true, message: "กรุณาระบุ ID ของค่าลดหย่อนที่ต้องการลบ" });
    }

    let deleteQuery = "DELETE FROM taxdeduction WHERE id = ?";

    dbConn.query(deleteQuery, [taxdeduction_id], function (error, results) {
        if (error) {
            console.log("❌ Error ในการลบค่าลดหย่อน:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการลบค่าลดหย่อน" });
        }

        if (results.affectedRows === 0) {
            return res.status(404).send({ error: true, message: "ไม่พบค่าลดหย่อนที่ต้องการลบ" });
        }

        return res.send({ success: 1, message: "ลบค่าลดหย่อนสำเร็จ" });
    });
});

app.delete('/deleteIncome/:id', function (req, res) {
    let income_id = req.params.id;

    if (!income_id) {
        return res.status(400).send({ error: true, message: "กรุณาระบุ ID ของรายได้ที่ต้องการลบ" });
    }

    let deleteQuery = "DELETE FROM income WHERE id = ?";

    dbConn.query(deleteQuery, [income_id], function (error, results) {
        if (error) {
            console.log("❌ Error ในการลบรายได้:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการลบรายได้" });
        }

        if (results.affectedRows === 0) {
            return res.status(404).send({ error: true, message: "ไม่พบรายได้ที่ต้องการลบ" });
        }

        return res.send({ success: 1, message: "ลบรายได้สำเร็จ" });
    });
});

app.get('/getTaxDeductionByUser/:user_id', function (req, res) {
    let user_id = req.params.user_id;

    if (!user_id) {
        return res.status(400).send({ error: true, message: "กรุณาระบุ user_id" });
    }

    let query = `
        SELECT taxdeduction.id, taxdeduction.taxdeductiontype_balance, taxdeduction.user_id, taxdeduction.year, 
               taxdeduction_type.taxdeductiontype_name
        FROM taxdeduction
        JOIN taxdeduction_type ON taxdeduction.taxdeductiontype_id = taxdeduction_type.id
        WHERE taxdeduction.user_id = ?
    `;

    dbConn.query(query, [user_id], function (error, results) {
        if (error) {
            console.log("❌ Error:", error);
            return res.status(500).send({ error: true, message: "เกิดข้อผิดพลาดในการดึงข้อมูลค่าลดหย่อน" });
        }

        if (results.length === 0) {
            return res.status(404).send({ success: 0, message: "ไม่พบข้อมูลค่าลดหย่อนของผู้ใช้" });
        }

        // ✅ คำนวณผลรวมของค่าลดหย่อน
        let totalDeduction = results.reduce((sum, item) => sum + item.taxdeductiontype_balance, 0);

        // ✅ จัดรูปแบบข้อมูลเป็นตาราง JSON
        let tableData = results.map((item, index) => ({
            ลำดับ: index + 1,
            "ชื่อค่าลดหย่อน": item.taxdeductiontype_name,
            "จำนวนเงิน": item.taxdeductiontype_balance,
            "ปี": item.year
        }));

        return res.send({
            success: 1,
            total_deduction: totalDeduction, // ✅ แสดงผลรวมค่าลดหย่อน
            total_records: results.length, // ✅ แสดงจำนวนรายการที่บันทึก
            table: tableData // ✅ แสดงผลในรูปแบบตาราง JSON
        });
    });
});

app.put('/updateTaxDeduction/:id', function (req, res) {
    let taxdeduction_id = req.params.id;
    let { taxdeductiontype_balance, taxdeductiontype_id, user_id, year } = req.body;

    if (!taxdeduction_id || !taxdeductiontype_balance || !taxdeductiontype_id || !user_id || !year) {
        return res.status(400).send({ error: true, message: "Please provide full tax deduction data and the id." });
    }

    let updateQuery = `
        UPDATE taxdeduction
        SET taxdeductiontype_balance = ?, taxdeductiontype_id = ?, user_id = ?, year = ?
        WHERE id = ?
    `;
    
    dbConn.query(updateQuery, [taxdeductiontype_balance, taxdeductiontype_id, user_id, year, taxdeduction_id], (error, results) => {
        if (error) {
            console.log("Error updating tax deduction: ", error);
            return res.status(500).send({ error: true, message: "Error updating tax deduction" });
        }
        return res.send({ success: 1, message: "Tax deduction updated successfully." });
    });
});


app.put('/updateIncome/:id', function (req, res) {
    let income_id = req.params.id;
    let { incomebalance, incometype_id, user_id, year } = req.body;

    if (!income_id || !incomebalance || !incometype_id || !user_id || !year) {
        return res.status(400).send({ error: true, message: "Please provide full income data and the id." });
    }

    let updateQuery = `
        UPDATE income 
        SET incomebalance = ?, incometype_id = ?, user_id = ?, year = ?
        WHERE id = ?
    `;
    
    dbConn.query(updateQuery, [incomebalance, incometype_id, user_id, year, income_id], (error, results) => {
        if (error) {
            console.log("Error updating income: ", error);
            return res.status(500).send({ error: true, message: "Error updating income" });
        }
        return res.send({ success: 1, message: "Income updated successfully." });
    });
});



app.post('/send-otp', async function (req, res) {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).send({ error: true, message: 'Please provide an email address.' });
    }
    
    // ตรวจสอบว่าอีเมลมีอยู่ในระบบหรือไม่
    dbConn.query('SELECT * FROM user WHERE email = ?', [email], async function (error, results) {
        if (error) throw error;
        
        if (results.length === 0) {
            return res.status(404).send({ success: 0, message: 'Email not found' });
        }

        // สร้าง OTP (ตัวเลข 6 หลัก)
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date();
        expires.setMinutes(expires.getMinutes() + 5); // OTP หมดอายุใน 5 นาที

        // บันทึก OTP ลงฐานข้อมูล
        dbConn.query(
            'UPDATE user SET otp_code = ?, otp_expires = ? WHERE email = ?',
            [otp, expires, email],
            async function (error) {
                if (error) throw error;
                try {
                    const transporter = nodemailer.createTransport({
                        host: 'smtp.gmail.com',
                        port: 587,
                        secure: false,
                        auth: {
                            user: 'bbcorn123za@gmail.com',
                            pass: 'syptqkcjdltabnur'
                        }
                    });

                    // รายละเอียดอีเมล
                    const mailOptions = {
                        from: 'bbcorn123za@gmail.com',
                        to: email,
                        subject: 'รหัส OTP สำหรับรีเซ็ตรหัสผ่าน',
                        html: `<p>รหัส OTP ของคุณคือ: <strong>${otp}</strong></p>
                              <p>รหัสนี้จะหมดอายุใน 5 นาที</p>`
                    };

                    await transporter.sendMail(mailOptions);
                    return res.send({ success: 1, message: 'OTP sent to email' });

                } catch (error) {
                    return res.status(500).send({ error: true, message: 'Error sending email' });
                }
            }
        );
    });
});

app.post('/verify-otp', async function (req, res) {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).send({ error: true, message: 'Email and OTP are required' });
    }

    dbConn.query(
        'SELECT * FROM user WHERE email = ? AND otp_code = ? AND otp_expires > NOW()',
        [email, otp],
        function (error, results) {
            if (error) throw error;

            if (results.length === 0) {
                return res.status(400).send({ error: true, message: 'Invalid or expired OTP' });
            }

            return res.send({ success: 1, message: 'OTP Verified' });
        }
    );
});



app.post('/reset-password', async function (req, res) {
    const { email,newPassword } = req.body;

    if (!email ||!newPassword) {
        return res.status(400).send({ error: true, message: 'All fields are required' });
    }

    dbConn.query(
        'SELECT * FROM user WHERE email = ?',
        [email],
        async function (error, results) {
            if (error) throw error;

            if (results.length === 0) {
                return res.status(400).send({ error: true, message: 'Invalid or expired OTP' });
            }

            // แฮ็ชรหัสผ่านใหม่
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            dbConn.query(
                'UPDATE user SET password = ?, otp_code = NULL, otp_expires = NULL WHERE email = ?',
                [hashedPassword, email],
                function (error) {
                    if (error) throw error;
                    return res.send({ success: 1, message: 'Password reset successfully' });
                }
            );
        }
    );
});



app.listen(3000, function () {
    console.log('Node app is running on port 3000');
});

module.exports = app;