const express=require("express");
const mysql=require('mysql2');
const cors=require('cors');
const app=express();

app.use(cors());

app.use(express.json());

const db=mysql.createConnection({
    host:"localhost",
    user:"root",
    password:"",
    database:'student_db'
});

db.connect((err)=>{
    if(err){
        console.log("Database connection failed: " + err.stack);
        return;
    }
    console.log("Connected to database");
});

app.get('/', (re, res) => {
    return res.json("From Backend Side");
});

app.get('/students', (req, res) => {
    const sql = "SELECT * FROM student";
    db.query(sql, (err, data) => {
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.post('/create', (req, res) => {
    const sql = "INSERT INTO student (`Name`, `Email`) VALUES (?,?)";
    const values = [
        req.body.name,
        req.body.email
    ];
    db.query(sql, values, (err, data) => {
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.put('/update/:id', (req, res) => {
    const sql = "update student set `Name` = ?, `Email` = ? where ID = ?";
    const values = [
        req.body.name,
        req.body.email
    ];
    const id = req.params.id;
    db.query(sql, [...values, id], (err, data) => {
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.delete('/delete/:id', (req, res) => {
    const sql = "DELETE FROM student WHERE ID = ?";
    const id = req.params.id;
    db.query(sql, [id], (err, data) => {
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.listen(8081, ()=>{
    console.log("listening");
});
