const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "student_db" // Reusing the same DB but will create a new table
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed: " + err.stack);
        return;
    }
    console.log("Connected to database for Weather App");
    
    // Create weather_history table if it doesn't exist
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS weather_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            place VARCHAR(255) NOT NULL,
            temperature VARCHAR(50),
            description VARCHAR(255),
            search_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    db.query(createTableQuery, (err) => {
        if (err) console.error("Error creating table:", err);
    });
});

// Combined Weather Route with Cache
app.get('/weather/:city', (req, res) => {
    const city = req.params.city;
    
    // 1. Check if data exists in Database
    const checkSql = "SELECT * FROM weather_history WHERE place LIKE ? ORDER BY search_time DESC LIMIT 1";
    db.query(checkSql, [`%${city}%`], async (err, results) => {
        if (err) return res.status(500).json(err);
        
        if (results.length > 0) {
            console.log(`Serving ${city} from Database Cache`);
            return res.json({ ...results[0], source: 'database' });
        }
        
        // 2. Data not found, Fetch from your FastAPI service (api2.py)
        console.log(`Fetching ${city} from FastAPI Service (api2.py)...`);
        try {
            // Calling api2.py running on port 8000
            const response = await fetch(`http://127.0.0.1:8000/weather?place=${city}`);
            const data = await response.json();
            
            if (response.status !== 200) throw new Error(data.detail || "API Error");

            const temp = data.current.temperature_2m + '°C';
            const desc = data.current.weather_description;
            const location = `${data.location.name}, ${data.location.country}`;
            
            // 3. Save to Database for future requests
            const insertSql = "INSERT INTO weather_history (place, temperature, description) VALUES (?, ?, ?)";
            db.query(insertSql, [location, temp, desc], (err, insertResult) => {
                if (err) console.error("Error saving to cache:", err);
                res.json({ place: location, temperature: temp, description: desc, source: 'api' });
            });
            
        } catch (fetchErr) {
            console.error("FastAPI Error:", fetchErr.message);
            res.status(502).json({ error: "Failed to fetch from FastAPI service. Is it running?" });
        }
    });
});


// Route to get search history
app.get('/weather-history', (req, res) => {
    const sql = "SELECT * FROM weather_history ORDER BY search_time DESC LIMIT 10";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});


app.listen(3001, () => {
    console.log("Weather backend listening on port 3001");
});
