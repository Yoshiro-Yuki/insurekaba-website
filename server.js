const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { ethers } = require("ethers");

const app = express();

// =========================
// MIDDLEWARE SETUP - ORDER MATTERS!
// =========================
app.use(cors()); // Enable CORS for all origins
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// =========================
// DATABASE SETUP
// =========================
const db = new sqlite3.Database("records.db", (err) => {
    if (err) {
        console.error("Could not connect to database", err);
    } else {
        console.log("Connected to SQLite database.");
    }
});

// Use db.serialize to ensure table creation happens in order
db.serialize(() => {
    // Create records table with enhanced security fields
    db.run(`CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        filename TEXT,
        original_filename TEXT,
        stored_filename TEXT,
        hash TEXT,
        file_size INTEGER,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        uploaded_by INTEGER,
        hospital_id INTEGER,
        blockchain_tx_hash TEXT,
        verification_status TEXT DEFAULT 'pending'
    )`);

    // Create users table with role and hospital_id
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        name TEXT,
        email TEXT,
        password TEXT,
        role TEXT DEFAULT 'user',
        hospital_id INTEGER,
        walletAddress TEXT,
        consent BOOLEAN DEFAULT 0,
        token_balance INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create hospitals table
    db.run(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        address TEXT,
        contact TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create claims table
    db.run(`
      CREATE TABLE IF NOT EXISTS claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        details TEXT,
        status TEXT DEFAULT 'Pending',
        amount DECIMAL(10,2) DEFAULT 0,
        reviewed_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create notifications table
    db.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        type TEXT,
        title TEXT,
        message TEXT,
        isRead BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create token_transactions table for health incentives
    db.run(`
      CREATE TABLE IF NOT EXISTS token_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        type TEXT,
        amount INTEGER,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns to existing tables
    db.all("PRAGMA table_info(users);", (err, cols) => {
        if (err) return;
        
        const hasRole = cols.some(c => c.name === "role");
        const hasHospitalId = cols.some(c => c.name === "hospital_id");
        const hasTokenBalance = cols.some(c => c.name === "token_balance");
        
        if (!hasRole) {
            db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`);
        }
        if (!hasHospitalId) {
            db.run(`ALTER TABLE users ADD COLUMN hospital_id INTEGER`);
        }
        if (!hasTokenBalance) {
            db.run(`ALTER TABLE users ADD COLUMN token_balance INTEGER DEFAULT 0`);
        }
    });

    db.all("PRAGMA table_info(records);", (err, cols) => {
        if (err) return;
        
        const hasUploadedBy = cols.some(c => c.name === "uploaded_by");
        const hasHospitalId = cols.some(c => c.name === "hospital_id");
        const hasOriginalFilename = cols.some(c => c.name === "original_filename");
        const hasStoredFilename = cols.some(c => c.name === "stored_filename");
        const hasFileSize = cols.some(c => c.name === "file_size");
        const hasBlockchainTxHash = cols.some(c => c.name === "blockchain_tx_hash");
        const hasVerificationStatus = cols.some(c => c.name === "verification_status");
        
        if (!hasUploadedBy) {
            db.run(`ALTER TABLE records ADD COLUMN uploaded_by INTEGER`);
        }
        if (!hasHospitalId) {
            db.run(`ALTER TABLE records ADD COLUMN hospital_id INTEGER`);
        }
        if (!hasOriginalFilename) {
            db.run(`ALTER TABLE records ADD COLUMN original_filename TEXT`);
        }
        if (!hasStoredFilename) {
            db.run(`ALTER TABLE records ADD COLUMN stored_filename TEXT`);
        }
        if (!hasFileSize) {
            db.run(`ALTER TABLE records ADD COLUMN file_size INTEGER`);
        }
        if (!hasBlockchainTxHash) {
            db.run(`ALTER TABLE records ADD COLUMN blockchain_tx_hash TEXT`);
        }
        if (!hasVerificationStatus) {
            db.run(`ALTER TABLE records ADD COLUMN verification_status TEXT DEFAULT 'pending'`);
        }
    });

    db.all("PRAGMA table_info(claims);", (err, cols) => {
        if (err) return;
        
        const hasAmount = cols.some(c => c.name === "amount");
        if (!hasAmount) {
            db.run(`ALTER TABLE claims ADD COLUMN amount DECIMAL(10,2) DEFAULT 0`);
        }
    });

    // Insert sample hospitals
    db.get("SELECT COUNT(*) as count FROM hospitals", (err, row) => {
        if (!err && row.count === 0) {
            db.run(`INSERT INTO hospitals (name, address, contact) VALUES 
                ('St. Mary Hospital', '123 Main St, Manila', '+63-2-123-4567'),
                ('General Hospital', '456 Health Ave, Quezon City', '+63-2-987-6543'),
                ('Medical Center Plus', '789 Care Blvd, Makati', '+63-2-555-0123')`,
                (err) => {
                    if (err) {
                        console.error("Error inserting hospitals:", err);
                    } else {
                        console.log("Sample hospitals added");
                    }
                    startServer();
                }
            );
        } else {
            startServer();
        }
    });

    // Insert default admin user if not exists
    db.get("SELECT * FROM users WHERE id = 999", (err, row) => {
        if (!err && !row) {
            db.run(`INSERT INTO users (id, username, name, email, password, role, walletAddress, consent) 
                    VALUES (999, 'admin_philhealth', 'PhilHealth Admin', 'admin@philhealth.gov.ph', 'admin123', 'admin-philhealth', '0x9c3FB0860Fdc3E39016c393B07091A58d479c250', 1)`,
                (err) => {
                    if (err) console.error("Error creating admin user:", err);
                    else console.log("Default admin user created (ID: 999)");
                }
            );
        }
    });
});

// =========================
// BLOCKCHAIN SETUP
// =========================
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Created uploads directory');
}

const provider = new ethers.JsonRpcProvider("https://ultra-cosmological-daylight.ethereum-sepolia.quiknode.pro/8900680f193e2e927778171a8dad2e1a41667bf7/"); 
const contractAddress = "0xF15b4267d5ffB92EaE7835Fbe56B3a302DB5e417"; 
const contractABI = [
    {
        "inputs": [{"internalType": "string", "name": "fileHash", "type": "string"}],
        "name": "addRecord",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "string", "name": "fileHash", "type": "string"},
            {"internalType": "uint256", "name": "userId", "type": "uint256"},
            {"internalType": "uint256", "name": "uploadedBy", "type": "uint256"},
            {"internalType": "uint256", "name": "timestamp", "type": "uint256"}
        ],
        "name": "addDetailedRecord",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "claimId", "type": "uint256"},
            {"internalType": "string", "name": "status", "type": "string"},
            {"internalType": "uint256", "name": "approverId", "type": "uint256"},
            {"internalType": "uint256", "name": "timestamp", "type": "uint256"}
        ],
        "name": "recordClaimApproval",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];
const signer = new ethers.Wallet("0x105fdd2cc53b1a108be73ea4abf92267e98699b6f61e40b5715b0283f858acfd", provider);
const contract = new ethers.Contract(contractAddress, contractABI, signer);

// Enhanced blockchain function with detailed metadata
async function sendDetailedRecordToBlockchain(fileHash, userId, uploadedBy, timestamp) {
    try {
        let tx;
        try {
            tx = await contract.addDetailedRecord(fileHash, userId, uploadedBy, timestamp);
        } catch (detailedErr) {
            console.log("Detailed blockchain function not available, using simple version");
            tx = await contract.addRecord(fileHash);
        }
        
        await tx.wait();
        console.log("Sent detailed record to blockchain:", tx.hash);
        return { success: true, transactionHash: tx.hash };
    } catch (err) {
        console.error("Blockchain error:", err);
        return { success: false, error: err.message };
    }
}

// Function to record claim approvals on blockchain
async function recordClaimApprovalOnBlockchain(claimId, status, approverId) {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const tx = await contract.recordClaimApproval(claimId, status, approverId, timestamp);
        await tx.wait();
        console.log("Claim approval recorded on blockchain:", tx.hash);
        return { success: true, transactionHash: tx.hash };
    } catch (err) {
        console.error("Blockchain claim approval error:", err);
        return { success: false, error: err.message };
    }
}

// =========================
// MULTER SETUP WITH SECURE FILENAME GENERATION
// =========================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const randomBytes = crypto.randomBytes(16).toString('hex');
        const fileExtension = path.extname(file.originalname);
        const secureFilename = `${timestamp}_${randomBytes}${fileExtension}`;
        cb(null, secureFilename);
    }
});
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// =========================
// MIDDLEWARE FOR ROLE-BASED ACCESS
// =========================

const authenticateUser = (req, res, next) => {
    let userId;
    
    if (req.body && req.body.userId) {
        userId = req.body.userId;
    } else if (req.params && req.params.userId) {
        userId = req.params.userId;
    } else if (req.query && req.query.userId) {
        userId = req.query.userId;
    }
    
    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    // Handle the hardcoded admin user
    if (userId == 999) {
        req.user = {
            id: 999,
            username: 'admin_philhealth',
            role: 'admin-philhealth',
            walletAddress: '0x9c3FB0860Fdc3E39016c393B07091A58d479c250',
            hospital_id: null
        };
        return next();
    }

    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: "User not found or unauthorized" });
        }
        req.user = user;
        next();
    });
};

const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: "Access denied", 
                message: `Required role: ${allowedRoles.join(' or ')}` 
            });
        }
        next();
    };
};

// =========================
// NOTIFICATION FUNCTIONS
// =========================
function createNotification(userId, type, title, message) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO notifications (userId, type, title, message) VALUES (?, ?, ?, ?)`,
            [userId, type, title, message],
            function (err) {
                if (err) {
                    console.error("Notification creation error:", err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

function earnTokens(userId, amount, description) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(
                `UPDATE users SET token_balance = token_balance + ? WHERE id = ?`,
                [amount, userId]
            );
            
            db.run(
                `INSERT INTO token_transactions (userId, type, amount, description) VALUES (?, 'earned', ?, ?)`,
                [userId, amount, description],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    });
}

// =========================
// HEALTH CHECK ENDPOINT
// =========================
app.get("/health", (req, res) => {
    res.json({ 
        status: "ok", 
        message: "Server is running",
        timestamp: new Date().toISOString()
    });
});

// =========================
// DASHBOARD API
// =========================
app.get("/get-summary/:userId", authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const claimsData = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as total, 
                 SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                 SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved
                 FROM claims WHERE userId = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        const tokens = req.user.token_balance || 0;

        const notifications = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as unread FROM notifications WHERE userId = ? AND isRead = 0`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.unread);
                }
            );
        });

        res.json({
            userId: userId,
            summary: {
                totalClaims: claimsData.total,
                pendingClaims: claimsData.pending,
                approvedClaims: claimsData.approved,
                tokenBalance: tokens,
                unreadNotifications: notifications
            }
        });

    } catch (error) {
        console.error("Summary query error:", error);
        res.status(500).json({ error: "Failed to fetch summary", details: error.message });
    }
});

// =========================
// USER MANAGEMENT ROUTES
// =========================

app.post("/create-user", (req, res) => {
    const { email, walletAddress, password, role = 'user', hospital_id, name } = req.body;
    
    if (!email || !walletAddress || !password) {
        return res.status(400).json({ error: "Email, wallet address, and password are required" });
    }

    if (!ethers.isAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address format" });
    }

    const username = `user_${walletAddress.slice(-8)}`;
    
    const validRoles = ['user', 'admin-philhealth', 'admin-hospital'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
    }

    if (role === 'admin-hospital' && !hospital_id) {
        return res.status(400).json({ error: "hospital_id is required for admin-hospital role" });
    }

    db.run(
        `INSERT INTO users (username, password, email, walletAddress, role, hospital_id, name, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [username, password, email, walletAddress, role, hospital_id, name, 1],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(409).json({ error: "Email or wallet address already registered" });
                }
                return res.status(500).json({ error: "User creation failed" });
            }
            res.status(201).json({ 
                message: "Account created successfully", 
                userId: this.lastID,
                username: username,
                walletAddress: walletAddress,
                email: email,
                role: role 
            });
        }
    );
});

app.post("/login", (req, res) => {
    const { walletAddress, username, password } = req.body;
    
    const loginField = walletAddress || username;
    
    if (!loginField || !password) {
        return res.status(400).json({ error: "Username/wallet address and password are required" });
    }

    const isWalletLogin = loginField.startsWith('0x');
    const queryField = isWalletLogin ? 'walletAddress' : 'username';

    db.get(
        `SELECT u.*, h.name as hospital_name FROM users u 
         LEFT JOIN hospitals h ON u.hospital_id = h.id 
         WHERE u.${queryField} = ? AND u.password = ?`,
        [loginField, password],
        (err, row) => {
            if (err) return res.status(500).json({ error: "Login failed" });
            if (!row) return res.status(401).json({ error: "Invalid credentials" });
            
            res.json({
                message: "Login successful",
                userId: row.id,
                username: row.username,
                role: row.role,
                hospital_id: row.hospital_id,
                hospital_name: row.hospital_name,
                walletAddress: row.walletAddress,
                token_balance: row.token_balance
            });
        }
    );
});

app.get("/get-profile/:userId", authenticateUser, (req, res) => {
    const { userId } = req.params;

    if (req.user.role === 'user' && userId != req.user.id) {
        return res.status(403).json({ error: "Access denied" });
    }

    db.get(
        `SELECT u.*, h.name as hospital_name FROM users u 
         LEFT JOIN hospitals h ON u.hospital_id = h.id 
         WHERE u.id = ?`, 
        [userId], 
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: "Profile fetch failed" });
            }
            if (!row) {
                return res.status(404).json({ error: "User not found" });
            }
            
            delete row.password;
            res.json(row);
        }
    );
});

app.post("/update-profile", authenticateUser, (req, res) => {
    const { name, email, walletAddress, consent } = req.body;
    const userId = req.user.id;

    db.run(
        `UPDATE users SET 
            name = COALESCE(?, name), 
            email = COALESCE(?, email), 
            walletAddress = COALESCE(?, walletAddress), 
            consent = COALESCE(?, consent),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name, email, walletAddress, consent, userId],
        function (err) {
            if (err) {
                console.error("Profile update error:", err);
                return res.status(500).json({ error: "Profile update failed" });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "User not found" });
            }
            res.json({ message: "Profile updated successfully" });
        }
    );
});

// =========================
// ENHANCED MEDICAL RECORDS ROUTES
// =========================

app.get("/search-hospital-users", authenticateUser, requireRole(['admin-hospital']), (req, res) => {
    const { search } = req.query;
    
    let query = `SELECT id, username, name, email FROM users WHERE hospital_id = ? AND role = 'user'`;
    let params = [req.user.hospital_id];
    
    if (search) {
        query += ` AND (name LIKE ? OR username LIKE ? OR email LIKE ?)`;
        const searchTerm = `%${search}%`;
        params = params.concat([searchTerm, searchTerm, searchTerm]);
    }
    
    query += ` LIMIT 20`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Search failed" });
        }
        res.json({ users: rows });
    });
});

app.post("/upload-record", upload.single("recordfile"), authenticateUser, requireRole(['user', 'admin-hospital']), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        let { targetUserId } = req.body;
        
        if (req.user.role === 'admin-hospital' && targetUserId) {
            const targetUser = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM users WHERE id = ? AND hospital_id = ?", [targetUserId, req.user.hospital_id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!targetUser) {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(403).json({ error: "User not found in your hospital or access denied" });
            }
        } else {
            targetUserId = req.user.id;
        }

        const originalFilename = req.file.originalname;
        const storedFilename = req.file.filename;
        const filePath = req.file.path;
        const fileSize = req.file.size;

        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ error: "File upload failed - file not found" });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        const recordId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO records (userId, filename, original_filename, stored_filename, hash, file_size, uploaded_by, hospital_id, verification_status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [targetUserId, storedFilename, originalFilename, storedFilename, hash, fileSize, req.user.id, req.user.hospital_id, 'pending'],
                function (err) {
                    if (err) {
                        console.error("Database insert error:", err);
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });

        const timestamp = Math.floor(Date.now() / 1000);
        const blockchainResult = await sendDetailedRecordToBlockchain(hash, targetUserId, req.user.id, timestamp);

        if (blockchainResult.success) {
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE records SET blockchain_tx_hash = ?, verification_status = 'verified' WHERE id = ?`,
                    [blockchainResult.transactionHash, recordId],
                    function (err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
        }

        if (targetUserId == req.user.id) {
            try {
                await earnTokens(req.user.id, 10, "Medical record uploaded");
            } catch (tokenErr) {
                console.error("Token award failed:", tokenErr);
            }
        }

        if (targetUserId != req.user.id) {
            try {
                await createNotification(
                    targetUserId,
                    "record_upload",
                    "New Medical Record Added",
                    `A medical record "${originalFilename}" has been securely added to your file by healthcare staff. Hash: ${hash.substring(0, 16)}...`
                );
            } catch (notifErr) {
                console.error("Notification creation failed:", notifErr);
            }
        }

        res.json({
            message: "File uploaded successfully",
            recordId: recordId,
            userId: targetUserId,
            originalFilename: originalFilename,
            storedFilename: storedFilename,
            hash: hash,
            fileSize: fileSize,
            uploaded_by: req.user.id,
            blockchainStored: blockchainResult.success,
            blockchainTxHash: blockchainResult.transactionHash || null,
            verificationStatus: blockchainResult.success ? 'verified' : 'pending'
        });

    } catch (error) {
        console.error("Upload error:", error);
        
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupErr) {
                console.error("File cleanup failed:", cleanupErr);
            }
        }
        
        res.status(500).json({ 
            error: "Upload failed", 
            details: error.message
        });
    }
});

app.get("/admin-hospital-files", authenticateUser, requireRole(['admin-hospital']), (req, res) => {
    const hospitalId = req.user.hospital_id;

    const query = `SELECT r.id, u.name as patient_name, u.walletAddress, r.original_filename, 
                          r.file_size, r.hash, r.uploaded_at, r.verification_status, r.blockchain_tx_hash
                   FROM records r
                   JOIN users u ON r.userId = u.id
                   WHERE r.hospital_id = ?
                   ORDER BY r.uploaded_at DESC`;

    db.all(query, [hospitalId], (err, rows) => {
        if (err) {
            console.error("Error fetching hospital files:", err);
            return res.status(500).json({ error: "Failed to fetch hospital files" });
        }

        res.json({
            hospital_id: hospitalId,
            files: rows
        });
    });
});

app.get("/download-file/:recordId", authenticateUser, async (req, res) => {
    try {
        const { recordId } = req.params;
        
        const record = await new Promise((resolve, reject) => {
            db.get(
                `SELECT r.*, u.name as owner_name FROM records r
                 LEFT JOIN users u ON r.userId = u.id
                 WHERE r.id = ?`,
                [recordId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!record) {
            return res.status(404).json({ error: "File not found" });
        }

        let hasAccess = false;
        
        if (req.user.role === 'user' && record.userId == req.user.id) {
            hasAccess = true;
        } else if (req.user.role === 'admin-hospital' && record.hospital_id == req.user.hospital_id) {
            hasAccess = true;
        }

        if (!hasAccess) {
            return res.status(403).json({ error: "Access denied: You don't have permission to access this file" });
        }

        const filePath = path.join(uploadDir, record.stored_filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "File not found on server" });
        }

        if (record.userId != req.user.id) {
            await createNotification(
                record.userId,
                "record_access",
                "Medical Record Accessed",
                `Your file "${record.original_filename}" was accessed by authorized hospital staff.`
            );
        }

        res.setHeader('Content-Disposition', `attachment; filename="${record.original_filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error("File download error:", error);
        res.status(500).json({ error: "File download failed", details: error.message });
    }
});

app.post("/verify-file-integrity", authenticateUser, async (req, res) => {
    try {
        const { recordId } = req.body;
        
        const record = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM records WHERE id = ?", [recordId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!record) {
            return res.status(404).json({ error: "Record not found" });
        }

        if (req.user.role === 'user' && record.userId != req.user.id) {
            return res.status(403).json({ error: "Access denied" });
        }

        const filePath = path.join(uploadDir, record.stored_filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "File not found on server" });
        }

        const fileBuffer = fs.readFileSync(filePath);
        const currentHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
        
        const hashMatch = currentHash === record.hash;
        
        res.json({
            recordId: parseInt(recordId),
            originalFilename: record.original_filename,
            storedHash: record.hash,
            currentHash: currentHash,
            hashMatch: hashMatch,
            blockchainTxHash: record.blockchain_tx_hash,
            verificationStatus: record.verification_status,
            integrityStatus: hashMatch ? 'VERIFIED' : 'TAMPERED',
            message: hashMatch ? 
                "File integrity verified - file has not been tampered with" : 
                "WARNING: File integrity compromised - file may have been modified"
        });

    } catch (error) {
        console.error("File verification error:", error);
        res.status(500).json({ error: "Verification failed", details: error.message });
    }
});

app.get("/get-records/:targetUserId", authenticateUser, async (req, res) => {
    try {
        const { targetUserId } = req.params;
        
        if (req.user.role === 'user' && targetUserId != req.user.id) {
            return res.status(403).json({ error: "Access denied: Can only view your own records" });
        }
        
        if (req.user.role === 'admin-hospital') {
            const targetUser = await new Promise((resolve, reject) => {
                db.get("SELECT hospital_id FROM users WHERE id = ?", [targetUserId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!targetUser || targetUser.hospital_id !== req.user.hospital_id) {
                return res.status(403).json({ error: "Access denied: User not in your hospital" });
            }
        }

        const records = await new Promise((resolve, reject) => {
            db.all(
                `SELECT r.id, r.original_filename, r.hash, r.file_size, r.uploaded_at, 
                        r.uploaded_by, r.blockchain_tx_hash, r.verification_status,
                        u.name as uploaded_by_name 
                 FROM records r 
                 LEFT JOIN users u ON r.uploaded_by = u.id 
                 WHERE r.userId = ? ORDER BY r.uploaded_at DESC`,
                [targetUserId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        if (records.length > 0 && targetUserId != req.user.id) {
            await createNotification(
                targetUserId,
                "record_access",
                "Medical Records Accessed",
                `Your medical records were accessed by authorized personnel.`
            );
        }

        res.json({ 
            userId: targetUserId,
            records: records.map(record => ({
                ...record,
                downloadUrl: `/download-file/${record.id}`,
                canVerify: true
            }))
        });

    } catch (error) {
        console.error("Database query error:", error);
        res.status(500).json({ error: "Query failed", details: error.message });
    }
});

// =========================
// CLAIMS ROUTES
// =========================

app.post("/submit-claim", authenticateUser, requireRole(['user']), async (req, res) => {
    try {
        const { details, amount } = req.body;

        if (!details) {
            return res.status(400).json({ error: "Claim details are required" });
        }

        const claimId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO claims (userId, details, amount, status) VALUES (?, ?, ?, ?)`,
                [req.user.id, details, amount || 0, "Pending"],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        await createNotification(
            req.user.id,
            "claim",
            "Claim Submitted Successfully",
            `Your claim has been submitted and is now pending review. Claim ID: ${claimId}`
        );

        res.json({
            message: "Claim submitted successfully",
            claimId: claimId,
            status: "Pending"
        });

    } catch (error) {
        console.error("Claims insert error:", error);
        res.status(500).json({ error: "Claim submission failed", details: error.message });
    }
});

app.post("/update-claim", authenticateUser, requireRole(['admin-philhealth']), async (req, res) => {
    try {
        const { claimId, status } = req.body;

        if (!claimId || !status) {
            return res.status(400).json({ error: "claimId and status are required" });
        }

        const validStatuses = ["Approved", "Denied", "Paid"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const claim = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM claims WHERE id = ?", [claimId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!claim) {
            return res.status(404).json({ error: "Claim not found" });
        }

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE claims SET status = ?, reviewed_by = ? WHERE id = ?`,
                [status, req.user.id, claimId],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });

        const blockchainResult = await recordClaimApprovalOnBlockchain(claimId, status, req.user.id);

        if (status === "Approved") {
            await earnTokens(claim.userId, 50, `Claim #${claimId} approved`);
        }

        let notificationMessage;
        switch (status) {
            case "Approved":
                notificationMessage = `Great news! Your claim #${claimId} has been approved by PhilHealth. You earned 50 tokens! ${blockchainResult.success ? 'Approval recorded on blockchain.' : ''}`;
                break;
            case "Denied":
                notificationMessage = `Your claim #${claimId} has been denied by PhilHealth. Please contact support. ${blockchainResult.success ? 'Decision recorded on blockchain.' : ''}`;
                break;
            case "Paid":
                notificationMessage = `Your claim #${claimId} has been paid by PhilHealth. ${blockchainResult.success ? 'Payment recorded on blockchain.' : ''}`;
                break;
        }

        await createNotification(
            claim.userId,
            "claim_update",
            `Claim ${status}`,
            notificationMessage
        );

        res.json({
            message: "Claim updated successfully",
            claimId: parseInt(claimId),
            newStatus: status,
            reviewed_by: req.user.id,
            blockchainRecorded: blockchainResult.success,
            blockchainTxHash: blockchainResult.transactionHash
        });

    } catch (error) {
        console.error("Claims update error:", error);
        res.status(500).json({ error: "Claim update failed", details: error.message });
    }
});

app.get("/get-claims", authenticateUser, (req, res) => {
    if (req.user.role === 'admin-philhealth') {
        db.all(
            `SELECT c.*, u.name as user_name, u.email, r.name as reviewed_by_name FROM claims c
             LEFT JOIN users u ON c.userId = u.id
             LEFT JOIN users r ON c.reviewed_by = r.id
             ORDER BY c.created_at DESC`,
            [],
            (err, rows) => {
                if (err) return res.status(500).json({ error: "Query failed" });
                res.json({ claims: rows });
            }
        );
    } else {
        db.all(
            `SELECT * FROM claims WHERE userId = ? ORDER BY created_at DESC`,
            [req.user.id],
            (err, rows) => {
                if (err) return res.status(500).json({ error: "Query failed" });
                res.json({ userId: req.user.id, claims: rows });
            }
        );
    }
});

app.get("/get-claims/:userId", authenticateUser, (req, res) => {
    const { userId } = req.params;

    if (req.user.role === 'user' && userId != req.user.id) {
        return res.status(403).json({ error: "Access denied: You can only view your own claims." });
    }
    
    db.all(
        `SELECT * FROM claims WHERE userId = ? ORDER BY created_at DESC`,
        [userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Query failed" });
            }
            res.json({ userId: userId, claims: rows });
        }
    );
});

// =========================
// HEALTH INCENTIVES MODULE
// =========================

app.post("/earn-tokens", authenticateUser, requireRole(['user']), async (req, res) => {
    try {
        const { activity, amount = 10 } = req.body;
        
        if (!activity) {
            return res.status(400).json({ error: "Activity description is required" });
        }

        const tokenRewards = {
            "health_checkup": 25,
            "exercise_logged": 5,
            "medication_compliance": 15,
            "wellness_survey": 10,
            "preventive_care": 30
        };

        const tokenAmount = tokenRewards[activity] || amount;

        await earnTokens(req.user.id, tokenAmount, activity);

        await createNotification(
            req.user.id,
            "tokens_earned",
            "Tokens Earned!",
            `You earned ${tokenAmount} tokens for ${activity}. Keep up the healthy lifestyle!`
        );

        res.json({
            message: "Tokens earned successfully",
            activity: activity,
            tokensEarned: tokenAmount
        });

    } catch (error) {
        console.error("Token earning error:", error);
        res.status(500).json({ error: "Token earning failed", details: error.message });
    }
});

app.get("/get-token-history/:userId", authenticateUser, (req, res) => {
    const { userId } = req.params;

    if (req.user.role === 'user' && userId != req.user.id) {
        return res.status(403).json({ error: "Access denied" });
    }

    db.all(
        `SELECT * FROM token_transactions WHERE userId = ? ORDER BY created_at DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "Query failed" });
            
            db.get(
                `SELECT token_balance FROM users WHERE id = ?`,
                [userId],
                (err, user) => {
                    if (err) return res.status(500).json({ error: "Query failed" });
                    
                    res.json({
                        userId: userId,
                        currentBalance: user.token_balance,
                        transactions: rows
                    });
                }
            );
        }
    );
});

// =========================
// NOTIFICATIONS ROUTES
// =========================

app.get("/get-notifications/:userId", authenticateUser, (req, res) => {
    const { userId } = req.params;

    if (req.user.role === 'user' && userId != req.user.id) {
        return res.status(403).json({ error: "Access denied" });
    }

    db.all(
        `SELECT * FROM notifications WHERE userId = ? ORDER BY created_at DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "Query failed" });
            
            res.json({
                userId: userId,
                notifications: rows,
                unreadCount: rows.filter(n => !n.isRead).length
            });
        }
    );
});

app.post("/mark-notification-read", authenticateUser, (req, res) => {
    const { notificationId } = req.body;

    if (!notificationId) {
        return res.status(400).json({ error: "notificationId is required" });
    }

    db.get(
        `SELECT userId FROM notifications WHERE id = ?`,
        [notificationId],
        (err, notification) => {
            if (err || !notification) {
                return res.status(404).json({ error: "Notification not found" });
            }

            if (req.user.role === 'user' && notification.userId != req.user.id) {
                return res.status(403).json({ error: "Access denied" });
            }

            db.run(
                `UPDATE notifications SET isRead = 1 WHERE id = ?`,
                [notificationId],
                function (err) {
                    if (err) {
                        return res.status(500).json({ error: "Update failed" });
                    }
                    res.json({
                        message: "Notification marked as read",
                        notificationId: parseInt(notificationId)
                    });
                }
            );
        }
    );
});

app.post("/mark-all-notifications-read", authenticateUser, (req, res) => {
    const userId = req.user.id;

    db.run(
        `UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0`,
        [userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: "Update failed" });
            }
            res.json({
                message: "All notifications marked as read",
                userId: userId,
                updatedCount: this.changes
            });
        }
    );
});

// =========================
// ADMIN ROUTES
// =========================

app.get("/get-hospitals", (req, res) => {
    db.all("SELECT * FROM hospitals ORDER BY name", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Query failed" });
        }
        res.json({ hospitals: rows });
    });
});

app.get("/get-hospital-users", authenticateUser, requireRole(['admin-hospital']), (req, res) => {
    db.all(
        `SELECT id, username, name, email, token_balance, created_at FROM users WHERE hospital_id = ? AND role = 'user'`,
        [req.user.hospital_id],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Query failed" });
            }
            res.json({ 
                hospital_id: req.user.hospital_id,
                users: rows 
            });
        }
    );
});

app.get("/admin-dashboard", authenticateUser, requireRole(['admin-philhealth']), (req, res) => {
    Promise.all([
        new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as total, 
                 SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                 SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved,
                 SUM(CASE WHEN status = 'Denied' THEN 1 ELSE 0 END) as denied,
                 SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paid
                 FROM claims`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        }),
        new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as total_users,
                 SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as patients,
                 SUM(CASE WHEN role = 'admin-hospital' THEN 1 ELSE 0 END) as hospital_admins
                 FROM users`,
                [],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        }),
        new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as total_records FROM records", [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        })
    ]).then(([claims, users, records]) => {
        res.json({
            dashboard: {
                claims: claims,
                users: users,
                records: records
            }
        });
    }).catch(error => {
        console.error("Admin dashboard error:", error);
        res.status(500).json({ error: "Dashboard query failed" });
    });
});

// =========================
// ERROR HANDLING MIDDLEWARE
// =========================
app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
});

app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
});

// =========================
// SERVER START FUNCTION
// =========================
let serverStarted = false;
function startServer() {
    if (serverStarted) return;
    serverStarted = true;

    app.listen(PORT, () => {
        console.log(`\n========================================`);
        console.log(`SERVER RUNNING SUCCESSFULLY`);
        console.log(`========================================`);
        console.log(`URL: http://localhost:${PORT}`);
        console.log(`Health Check: http://localhost:${PORT}/health`);
        console.log(`\nROLE-BASED ACCESS CONTROL ENABLED`);
        console.log(`Roles: user, admin-philhealth, admin-hospital`);
        console.log(`\nAVAILABLE ENDPOINTS:`);
        console.log(`  Health: GET /health`);
        console.log(`  Dashboard: GET /get-summary/:userId`);
        console.log(`  Auth: POST /login, POST /create-user`);
        console.log(`  Records: POST /upload-record, GET /get-records/:userId`);
        console.log(`  Claims: POST /submit-claim, POST /update-claim, GET /get-claims`);
        console.log(`  Tokens: POST /earn-tokens, GET /get-token-history/:userId`);
        console.log(`  Notifications: GET /get-notifications/:userId`);
        console.log(`  Profile: GET /get-profile/:userId, POST /update-profile`);
        console.log(`  Admin: GET /get-hospitals, GET /get-hospital-users`);
        console.log(`========================================\n`);
    }).on('error', (err) => {
        console.error('SERVER FAILED TO START:', err);
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Please close the other application or use a different port.`);
        }
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});