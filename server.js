const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
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
    
    // Create users table if not exists
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL
        )
    `;
    db.query(createUsersTable, (err) => {
        if(err) console.error("Could not create users table", err);
    });

    // Create weather_records table (using a new name to avoid schema conflicts)
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
        if(err) console.error("Could not create weather table", err);
    });
});


// Signup Route
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
        db.query(sql, [name, email, hashedPassword], (err, result) => {
            if(err) {
                if(err.code === 'ER_DUP_ENTRY') return res.json({ Error: "Email already exists" });
                return res.json({ Error: "Error in registration" });
            }
            return res.json({ Status: "Success" });
        });
    } catch (err) {
        return res.json({ Error: "Encryption failed" });
    }
});

// Login Route
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM users WHERE email = ?";
    db.query(sql, [email], async (err, data) => {
        if(err) return res.json({ Error: "Server error" });
        if(data.length > 0) {
            const match = await bcrypt.compare(password, data[0].password.toString());
            if(match) {
                return res.json({ Status: "Success", Name: data[0].name, Email: data[0].email });
            } else {
                return res.json({ Error: "Password not matched" });
            }
        } else {
            return res.json({ Error: "Email not found" });
        }
    });
});

// Weather Route with User-Specific Caching
app.get('/weather', (req, res) => {
    const { city, email } = req.query;
    if(!email) return res.status(400).json({ error: "Email required for tracking" });

    // 1. Check if user already searched this city in the new weather_records table
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
        
        // 2. Fetch from FastAPI
        try {
            const response = await fetch(`http://127.0.0.1:8000/weather?place=${city}`);
            const data = await response.json();
            if (response.status !== 200) throw new Error(data.detail || "API Error");

            const temp = data.current.temperature_2m + '°C';
            const desc = data.current.weather_description;
            const location = `${data.location.name}, ${data.location.country}`;
            
            // 3. Save to User's History
            const insertSql = "INSERT INTO weather_records (user_email, place, temperature, description) VALUES (?, ?, ?, ?)";
            db.query(insertSql, [email, location, temp, desc], (err) => {
                if (err) console.error("Cache Error:", err);
                res.json({ place: location, temperature: temp, description: desc, source: 'api' });
            });
        } catch (fetchErr) {
            res.status(502).json({ error: "Weather service offline. Check api2.py" });
        }
    });
});

// User-Specific History Route
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
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.post('/add-student', (req, res) => {
    const sql = "INSERT INTO student (`Name`, `Email`) VALUES (?,?)";
    const values = [req.body.name, req.body.email];
    db.query(sql, values, (err, data) => {
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.put('/update/:id', (req, res) => {
    const sql = "UPDATE student SET `Name` = ?, `Email` = ? WHERE ID = ?";
    const values = [req.body.name, req.body.email, req.params.id];
    db.query(sql, values, (err, data) => {
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.delete('/delete/:id', (req, res) => {
    const sql = "DELETE FROM student WHERE ID = ?";
    db.query(sql, [req.params.id], (err, data) => {
        if(err) return res.json(err);
        return res.json(data);
    });
});

app.listen(3000, () => {
    console.log("Unified Backend listening on port 3000");
});
