const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('Frontend'));

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: 'student_db'
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed: " + err.stack);
        return;
    }
    console.log("Connected to database");

    // Create weather_records table
    const createWeatherTable = `
        CREATE TABLE IF NOT EXISTS weather_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_email VARCHAR(255),
            place VARCHAR(255) NOT NULL,
            temperature VARCHAR(50),
            description VARCHAR(255),
            search_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    db.query(createWeatherTable, (err) => {
        if (err) console.error("Could not create weather table", err);
    });
});

// Root Route
app.get('/', (req, res) => {
    return res.json("Unified Backend is Running");
});

// Simplified Login Route (Checks Name & Email in the student table)
app.post('/login', (req, res) => {
    const { name, email } = req.body;
    console.log("Login attempt for:", name, email);
    
    const sql = "SELECT * FROM student WHERE Name = ? AND Email = ?";
    db.query(sql, [name, email], (err, data) => {
        if (err) {
            console.error("Login SQL Error:", err);
            return res.json({ Error: "Server error" });
        }
        if (data.length > 0) {
            console.log("Login Success!");
            return res.json({ Status: "Success", Name: data[0].Name, Email: data[0].Email });
        } else {
            console.log("Login Failed: Record not found");
            return res.json({ Error: "Name or Email not found in student records" });
        }
    });
});

// Weather Route with User-Specific Caching
app.get('/weather', (req, res) => {
    const { city, email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });

    const checkSql = "SELECT * FROM weather_records WHERE user_email = ? AND place LIKE ? ORDER BY search_time DESC LIMIT 1";
    db.query(checkSql, [email, `%${city}%`], async (err, results) => {
        if (err) return res.status(500).json(err);

        if (results.length > 0) {
            const row = results[0];
            return res.json({ 
                place: row.place, 
                temperature: row.temperature, 
                description: row.description, 
                source: 'database' 
            });
        }

        try {
            const response = await fetch(`http://127.0.0.1:8000/weather?place=${city}`);
            const data = await response.json();
            if (response.status !== 200) throw new Error(data.detail || "API Error");

            const temp = data.current.temperature_2m + '°C';
            const desc = data.current.weather_description;
            const location = `${data.location.name}, ${data.location.country}`;

            const insertSql = "INSERT INTO weather_records (user_email, place, temperature, description) VALUES (?, ?, ?, ?)";
            db.query(insertSql, [email, location, temp, desc], (err) => {
                if (err) console.error("Cache Error:", err);
                res.json({ place: location, temperature: temp, description: desc, source: 'api' });
            });
        } catch (fetchErr) {
            res.status(502).json({ error: "Weather service offline" });
        }
    });
});

// History Route
app.get('/weather-history', (req, res) => {
    const { email } = req.query;
    const sql = "SELECT * FROM weather_records WHERE user_email = ? ORDER BY search_time DESC LIMIT 10";
    db.query(sql, [email], (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});

// Student Management Routes
app.get('/students', (req, res) => {
    const sql = "SELECT * FROM student";
    db.query(sql, (err, data) => {
        if (err) return res.json(err);
        return res.json(data);
    });
});

app.post('/add-student', (req, res) => {
    const sql = "INSERT INTO student (`Name`, `Email`) VALUES (?,?)";
    db.query(sql, [req.body.name, req.body.email], (err, data) => {
        if (err) return res.json(err);
        return res.json(data);
    });
});

app.put('/update/:id', (req, res) => {
    const sql = "UPDATE student SET `Name` = ?, `Email` = ? WHERE ID = ?";
    db.query(sql, [req.body.name, req.body.email, req.params.id], (err, data) => {
        if (err) return res.json(err);
        return res.json(data);
    });
});

app.delete('/delete/:id', (req, res) => {
    const sql = "DELETE FROM student WHERE ID = ?";
    db.query(sql, [req.params.id], (err, data) => {
        if (err) return res.json(err);
        return res.json(data);
    });
});

app.listen(3000, '0.0.0.0', () => {
    console.log("Unified Backend listening on http://10.31.13.83:3000");
});

