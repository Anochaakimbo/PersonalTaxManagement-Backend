var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mysql = require('mysql');
const bcrypt = require('bcryptjs');
require('dotenv').config();

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


// Insert account
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

// Login
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

// Search student by ID
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

// Set port
app.listen(3000, function () {
    console.log('Node app is running on port 3000');
});

module.exports = app;
