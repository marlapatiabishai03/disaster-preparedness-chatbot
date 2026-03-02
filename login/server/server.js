require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

/* ======================================================
   MYSQL CONNECTION
====================================================== */
const db = mysql.createConnection({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    socketPath: "/tmp/mysql.sock"
});

db.connect((err) => {
    if (err) {
        console.error("❌ MySQL connection failed:", err.message);
    } else {
        console.log("✅ MySQL connected successfully");
    }
});

/* ======================================================
   AUTH ROUTES
====================================================== */

/* REGISTER */
app.post("/register", async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: "All fields required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
        "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
        [name, email, hashedPassword, role || "student"],
        (err) => {
            if (err) {
                return res.status(500).json({
                    message: "User already exists or database error"
                });
            }
            res.json({ message: "User registered successfully" });
        }
    );
});

/* LOGIN */
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE email = ?",
        [email],
        async (err, results) => {

            if (err) {
                return res.status(500).json({ message: "Database error" });
            }

            if (results.length === 0) {
                return res.status(401).json({ message: "Invalid email or password" });
            }

            const user = results[0];

            try {
                const match = await bcrypt.compare(password, user.password);

                if (!match) {
                    return res.status(401).json({
                        message: "Invalid email or password"
                    });
                }

                return res.status(200).json({
                    message: "Login successful",
                    user: {
                        id: user.id,
                        name: user.name,
                        role: user.role
                    }
                });

            } catch (error) {
                return res.status(500).json({ message: "Server error" });
            }
        }
    );
});

/* ======================================================
   ADMIN – DISASTER MANAGEMENT
====================================================== */

app.post("/admin/add-disaster", (req, res) => {
    const { title, description, safety_measures } = req.body;

    if (!title || !description || !safety_measures) {
        return res.status(400).json({ message: "All fields required" });
    }

    db.query(
        "INSERT INTO disasters (title, description, safety_measures) VALUES (?, ?, ?)",
        [title, description, safety_measures],
        (err) => {
            if (err) {
                return res.status(500).json({ message: "Database error" });
            }
            res.json({ message: "Disaster content added successfully" });
        }
    );
});

app.get("/admin/disasters", (req, res) => {
    db.query("SELECT * FROM disasters", (err, results) => {
        if (err) {
            return res.status(500).json({ message: "Database error" });
        }
        res.json(results);
    });
});

app.put("/admin/update-disaster/:id", (req, res) => {
    const { id } = req.params;
    const { title, description, safety_measures } = req.body;

    db.query(
        "UPDATE disasters SET title=?, description=?, safety_measures=? WHERE id=?",
        [title, description, safety_measures, id],
        (err) => {
            if (err) {
                return res.status(500).json({ message: "Database error" });
            }
            res.json({ message: "Disaster updated successfully" });
        }
    );
});

app.delete("/admin/delete-disaster/:id", (req, res) => {
    const { id } = req.params;

    db.query(
        "DELETE FROM disasters WHERE id=?",
        [id],
        (err) => {
            if (err) {
                return res.status(500).json({ message: "Database error" });
            }
            res.json({ message: "Disaster deleted successfully" });
        }
    );
});

/* ======================================================
   QUIZ ROUTES
====================================================== */

app.post("/quiz/submit", (req, res) => {
    const { userId, score, total } = req.body;

    if (!userId || score === undefined || !total) {
        return res.status(400).json({ message: "Invalid quiz data" });
    }

    db.query(
        "INSERT INTO quiz_results (user_id, score, total) VALUES (?, ?, ?)",
        [userId, score, total],
        (err) => {
            if (err) {
                return res.status(500).json({ message: "Database error" });
            }
            res.json({ message: "Quiz submitted successfully" });
        }
    );
});

app.get("/quiz/score/:userId", (req, res) => {
    const { userId } = req.params;

    db.query(
        "SELECT score, total FROM quiz_results WHERE user_id=? ORDER BY attempted_at DESC LIMIT 1",
        [userId],
        (err, results) => {
            if (err) {
                return res.status(500).json({ message: "Database error" });
            }

            if (results.length === 0) {
                return res.json({ attempted: false });
            }

            res.json({
                attempted: true,
                score: results[0].score,
                total: results[0].total
            });
        }
    );
});

app.get("/admin/quiz/latest", (req, res) => {
    db.query(
        `SELECT qr.score, qr.total, u.name
         FROM quiz_results qr
         JOIN users u ON qr.user_id = u.id
         ORDER BY qr.attempted_at DESC
         LIMIT 1`,
        (err, results) => {

            if (err) {
                return res.status(500).json({ message: "Database error" });
            }

            if (results.length === 0) {
                return res.json({ attempted: false });
            }

            res.json({
                attempted: true,
                score: results[0].score,
                total: results[0].total,
                student: results[0].name
            });
        }
    );
});

/* ======================================================
   REAL-TIME ALERTS
====================================================== */

app.post("/admin/add-alert", (req, res) => {
    const { title, message } = req.body;

    if (!title || !message) {
        return res.status(400).json({ message: "All fields required" });
    }

    db.query(
        "INSERT INTO alerts (title, message) VALUES (?, ?)",
        [title, message],
        (err) => {
            if (err) {
                return res.status(500).json({ message: "Database error" });
            }
            res.json({ message: "Alert sent successfully" });
        }
    );
});

app.get("/alerts/latest", (req, res) => {
    db.query(
        "SELECT title, message, created_at FROM alerts ORDER BY created_at DESC LIMIT 1",
        (err, results) => {

            if (err) {
                return res.status(500).json({ message: "Database error" });
            }

            if (results.length === 0) {
                return res.json({ available: false });
            }

            res.json({
                available: true,
                alert: results[0]
            });
        }
    );
});

/* ======================================================
   AI CHATBOT
====================================================== */

app.post("/chat", (req, res) => {
    const userMessage = req.body.message;
    const command = `ollama run phi --prompt "${userMessage.replace(/"/g, '\\"')}"`;

    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) {
            return res.json({ reply: "AI error occurred" });
        }
        res.json({ reply: stdout.trim() });
    });
});

/* ======================================================
   START SERVER
====================================================== */

app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
});