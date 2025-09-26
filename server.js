const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

const app = express();
app.use(express.json());
const PORT = 3000;

// ------------------------
// Ensure uploads folder exists
// ------------------------
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// ------------------------
// Serve static assets
// ------------------------
app.use(express.static(__dirname)); // serve CSS, JS, images, pages

// ------------------------
// Multer setup for file upload
// ------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({ storage });

// ------------------------
// Database setup
// ------------------------
const db = new sqlite3.Database("records.db");
db.run(`CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  hash TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT,
  details TEXT,
  status TEXT
)`);

// ------------------------
// Routes
// ------------------------

// Main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Other pages
app.get("/check", (req, res) => {
  res.sendFile(path.join(__dirname, "pages/check.html"));
});
app.get("/tracker", (req, res) => {
  res.sendFile(path.join(__dirname, "pages/tracker.html"));
});

// ------------------------
// API Endpoints
// ------------------------

// Upload record
app.post("/upload-record", upload.single("recordfile"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const hash = crypto.createHash("sha256").update(req.file.filename).digest("hex");

  db.run(`INSERT INTO records (filename, hash) VALUES (?, ?)`,
    [req.file.filename, hash],
    function(err) {
      if (err) return res.status(500).json({ error: "DB insert failed" });
      res.json({ message: "File uploaded", filename: req.file.filename, hash });
    }
  );
});

// Submit claim
app.post("/submit-claim", (req, res) => {
  const { userId, details } = req.body;
  if (!userId || !details) return res.status(400).json({ error: "Missing userId or details" });

  db.run(`INSERT INTO claims (userId, details, status) VALUES (?, ?, ?)`,
    [userId, details, "Pending"],
    function(err) {
      if (err) return res.status(500).json({ error: "DB insert failed" });
      res.json({ message: "Claim submitted", claimId: this.lastID, status: "Pending" });
    }
  );
});

// Get all records
app.get("/get-records", (req, res) => {
  db.all(`SELECT * FROM records`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB query failed" });
    res.json(rows);
  });
});

// Get all claims
app.get("/get-all-claims", (req, res) => {
  db.all(`SELECT * FROM claims`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB query failed" });
    res.json(rows);
  });
});

// Get claims for user
app.get("/get-claims/:userId", (req, res) => {
  const userId = req.params.userId;
  db.all(`SELECT * FROM claims WHERE userId = ?`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB query failed" });
    res.json({ claims: rows });
  });
});

// ------------------------
// Start server
// ------------------------
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
