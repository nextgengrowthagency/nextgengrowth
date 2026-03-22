const express    = require("express");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const cors       = require("cors");
const bodyParser = require("body-parser");
const rateLimit  = require("express-rate-limit");
const mongoose   = require("mongoose");
const path       = require("path");

const app        = express();
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "nextgengrowth_secret_2026";

// ═══════════════════════════════════════════
// MONGODB CONNECTION
// Replace the URI below with your MongoDB URI
// Free MongoDB: https://cloud.mongodb.com
// ═══════════════════════════════════════════
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/nextgengrowth";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully!"))
  .catch(err => {
    console.log("⚠️  MongoDB not connected. Using in-memory store instead.");
    console.log("   To use MongoDB, set MONGO_URI environment variable.");
  });

// ═══════════════════════════════════════════
// DATABASE SCHEMAS
// ═══════════════════════════════════════════

// USER SCHEMA
const userSchema = new mongoose.Schema({
  firstName:    { type: String, required: true, trim: true },
  lastName:     { type: String, required: true, trim: true },
  name:         { type: String },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ["student", "brand"], required: true },
  // Student fields
  college:      { type: String, default: "" },
  skills:       { type: [String], default: [] },
  bio:          { type: String, default: "" },
  linkedin:     { type: String, default: "" },
  yearOfStudy:  { type: String, default: "" },
  // Brand fields
  companyName:  { type: String, default: "" },
  serviceNeeded:{ type: String, default: "" },
  // Stats (start at 0 for everyone)
  totalEarned:  { type: Number, default: 0 },
  projectsDone: { type: Number, default: 0 },
  avgRating:    { type: Number, default: 0 },
  // Projects posted by brands
  projectsPosted: { type: Number, default: 0 },
  totalSpent:     { type: Number, default: 0 },
}, { timestamps: true }); // createdAt and updatedAt auto-added

const User = mongoose.model("User", userSchema);

// APPLICATION SCHEMA
const applicationSchema = new mongoose.Schema({
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  studentName: { type: String },
  jobId:       { type: Number, required: true },
  jobTitle:    { type: String },
  brandName:   { type: String },
  pay:         { type: String },
  status:      { type: String, enum: ["pending", "review", "accepted", "rejected"], default: "review" },
  appliedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

const Application = mongoose.model("Application", applicationSchema);

// EARNINGS SCHEMA
const earningSchema = new mongoose.Schema({
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount:      { type: Number, required: true },
  description: { type: String },
  brandName:   { type: String },
  status:      { type: String, enum: ["paid", "pending"], default: "pending" },
  date:        { type: Date, default: Date.now },
}, { timestamps: true });

const Earning = mongoose.model("Earning", earningSchema);

// ═══════════════════════════════════════════
// FALLBACK: In-Memory Store (if MongoDB not connected)
// ═══════════════════════════════════════════
const memUsers        = [];
const memApplications = [];
const memEarnings     = [];

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, message: "Too many attempts. Try again later." }
});

function verifyToken(req, res, next) {
  const token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token provided." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ success: false, message: "Invalid or expired token." });
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user._id || user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET, { expiresIn: "7d" }
  );
}

function safeUser(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
}

// ═══════════════════════════════════════════
// API: REGISTER
// ═══════════════════════════════════════════
app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const { firstName, lastName, email, password, role,
            college, skills, companyName, serviceNeeded } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password || !role)
      return res.status(400).json({ success: false, message: "All fields are required." });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ success: false, message: "Invalid email address." });
    if (!["student", "brand"].includes(role))
      return res.status(400).json({ success: false, message: "Invalid role." });

    const hashedPassword = await bcrypt.hash(password, 12);
    const fullName = `${firstName} ${lastName}`;

    if (isMongoConnected()) {
      // ── MongoDB path ──
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists)
        return res.status(409).json({ success: false, message: "Email already registered." });

      const newUser = await User.create({
        firstName, lastName, name: fullName,
        email: email.toLowerCase(),
        password: hashedPassword, role,
        college:      role === "student" ? (college || "")      : "",
        skills:       role === "student" ? (skills  || [])      : [],
        companyName:  role === "brand"   ? (companyName || "")  : "",
        serviceNeeded:role === "brand"   ? (serviceNeeded || ""): "",
        // ✅ All stats start at 0
        totalEarned: 0, projectsDone: 0, avgRating: 0,
        projectsPosted: 0, totalSpent: 0,
      });

      const token = generateToken(newUser);
      console.log(`✅ Registered [MongoDB]: ${newUser.email} | Role: ${role} | Skills: ${skills}`);
      return res.status(201).json({
        success: true,
        message: `Welcome to NextGenGrowth, ${firstName}! 🎉`,
        token,
        user: safeUser(newUser)
      });

    } else {
      // ── In-Memory fallback ──
      if (memUsers.find(u => u.email === email.toLowerCase()))
        return res.status(409).json({ success: false, message: "Email already registered." });

      const newUser = {
        id: `u_${Date.now()}`, _id: `u_${Date.now()}`,
        firstName, lastName, name: fullName,
        email: email.toLowerCase(), password: hashedPassword, role,
        college: role === "student" ? (college || "") : "",
        skills:  role === "student" ? (skills  || []) : [],
        companyName:  role === "brand" ? (companyName || "") : "",
        serviceNeeded:role === "brand" ? (serviceNeeded || "") : "",
        // ✅ All stats start at 0
        totalEarned: 0, projectsDone: 0, avgRating: 0,
        projectsPosted: 0, totalSpent: 0,
        createdAt: new Date().toISOString(),
      };
      memUsers.push(newUser);
      const token = generateToken(newUser);
      console.log(`✅ Registered [Memory]: ${newUser.email} | Role: ${role}`);
      const { password: _, ...safe } = newUser;
      return res.status(201).json({
        success: true,
        message: `Welcome to NextGenGrowth, ${firstName}! 🎉`,
        token, user: safe
      });
    }

  } catch (err) {
    console.error("Register error:", err);
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Email already registered." });
    res.status(500).json({ success: false, message: "Server error. Try again." });
  }
});

// ═══════════════════════════════════════════
// API: LOGIN
// ═══════════════════════════════════════════
app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password required." });

    let user = null;

    if (isMongoConnected()) {
      user = await User.findOne({ email: email.toLowerCase() });
    } else {
      user = memUsers.find(u => u.email === email.toLowerCase());
    }

    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    if (role && user.role !== role)
      return res.status(401).json({ success: false, message: `This is a ${user.role} account, not ${role}.` });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const token = generateToken(user);
    console.log(`🔑 Login: ${user.email} | Role: ${user.role}`);

    res.json({
      success: true,
      message: `Welcome back, ${user.firstName}! 👋`,
      token,
      user: safeUser(user)
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error. Try again." });
  }
});

// ═══════════════════════════════════════════
// API: GET PROFILE
// ═══════════════════════════════════════════
app.get("/api/profile", verifyToken, async (req, res) => {
  try {
    let user = null;
    if (isMongoConnected()) {
      user = await User.findById(req.user.id);
    } else {
      user = memUsers.find(u => u.id === req.user.id || u._id === req.user.id);
    }
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// API: UPDATE PROFILE
// ═══════════════════════════════════════════
app.put("/api/profile", verifyToken, async (req, res) => {
  try {
    const { firstName, lastName, college, skills, bio, linkedin, yearOfStudy } = req.body;
    const updates = {};
    if (firstName)   updates.firstName  = firstName;
    if (lastName)    updates.lastName   = lastName;
    if (firstName || lastName) updates.name = `${firstName || ""} ${lastName || ""}`.trim();
    if (college !== undefined)     updates.college     = college;
    if (skills  !== undefined)     updates.skills      = skills;
    if (bio     !== undefined)     updates.bio         = bio;
    if (linkedin !== undefined)    updates.linkedin    = linkedin;
    if (yearOfStudy !== undefined) updates.yearOfStudy = yearOfStudy;

    let updatedUser = null;
    if (isMongoConnected()) {
      updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
    } else {
      const idx = memUsers.findIndex(u => u.id === req.user.id || u._id === req.user.id);
      if (idx > -1) { Object.assign(memUsers[idx], updates); updatedUser = memUsers[idx]; }
    }

    if (!updatedUser) return res.status(404).json({ success: false, message: "User not found." });
    console.log(`📝 Profile updated: ${updatedUser.email}`);
    res.json({ success: true, message: "Profile updated!", user: safeUser(updatedUser) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// API: GET STUDENT STATS (real data from DB)
// ═══════════════════════════════════════════
app.get("/api/stats", verifyToken, async (req, res) => {
  try {
    let user = null;
    let applications = [];
    let earnings = [];

    if (isMongoConnected()) {
      user         = await User.findById(req.user.id);
      applications = await Application.find({ studentId: req.user.id });
      earnings     = await Earning.find({ studentId: req.user.id });
    } else {
      user         = memUsers.find(u => u.id === req.user.id || u._id === req.user.id);
      applications = memApplications.filter(a => a.studentId === req.user.id);
      earnings     = memEarnings.filter(e => e.studentId === req.user.id);
    }

    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    // Calculate real stats from database
    const totalEarned    = earnings.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);
    const pendingEarnings= earnings.filter(e => e.status === "pending").reduce((s, e) => s + e.amount, 0);
    const projectsDone   = applications.filter(a => a.status === "accepted").length;
    const activeApps     = applications.filter(a => a.status === "review").length;

    res.json({
      success: true,
      stats: {
        totalEarned,
        pendingEarnings,
        projectsDone,
        activeApplications: activeApps,
        totalApplications:  applications.length,
        avgRating: user.avgRating || 0,
      },
      applications: applications.slice(-5).reverse(), // last 5
      earnings: earnings.slice(-10).reverse(),         // last 10
    });

  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// API: APPLY TO JOB
// ═══════════════════════════════════════════
app.post("/api/apply", verifyToken, async (req, res) => {
  try {
    const { jobId, jobTitle, brandName, pay } = req.body;

    if (!jobId) return res.status(400).json({ success: false, message: "Job ID required." });

    if (isMongoConnected()) {
      // Check already applied
      const existing = await Application.findOne({ studentId: req.user.id, jobId });
      if (existing) return res.status(409).json({ success: false, message: "You already applied for this job!" });

      await Application.create({
        studentId:   req.user.id,
        studentName: req.user.name,
        jobId, jobTitle, brandName, pay,
        status: "review"
      });
    } else {
      const existing = memApplications.find(a => a.studentId === req.user.id && a.jobId === jobId);
      if (existing) return res.status(409).json({ success: false, message: "Already applied!" });
      memApplications.push({
        id: `app_${Date.now()}`,
        studentId: req.user.id, studentName: req.user.name,
        jobId, jobTitle, brandName, pay, status: "review",
        appliedAt: new Date().toISOString()
      });
    }

    console.log(`📋 Application: ${req.user.email} → ${jobTitle}`);
    res.json({ success: true, message: `Applied for "${jobTitle}" successfully! 🎉` });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// API: AI JOB MATCHING
// ═══════════════════════════════════════════
app.post("/api/match-jobs", verifyToken, (req, res) => {
  try {
    const { skills = [], allJobs = [] } = req.body;
    if (!skills.length) return res.json({ success: true, matched: allJobs, stats: { perfect: 0, partial: 0, unmatched: allJobs.length, total: allJobs.length } });

    const skillMap = {
      "Video Editing":   ["video","editing","reel","reels","tiktok","youtube","shorts","footage","capcut","premiere"],
      "Graphic Design":  ["design","graphic","logo","canva","brand","branding","visual","photoshop","figma","banner","carousel","illustration"],
      "Web Development": ["web","website","html","css","javascript","wordpress","landing","page","frontend","react","development"],
      "Content Writing": ["content","writing","blog","article","seo","copy","copywriting","newsletter","email","text"],
      "Social Media":    ["social","instagram","twitter","linkedin","facebook","media","post","community","tiktok","feed"],
      "Photography":     ["photo","photography","editing","lightroom","product","image"],
      "Audio":           ["audio","music","sound","podcast","voice"],
      "Data & Excel":    ["data","excel","spreadsheet","analytics","report"],
      "AI Tools":        ["ai","artificial","intelligence","chatgpt","automation"],
    };

    const myKeywords = new Set();
    skills.forEach(skill => {
      (skillMap[skill] || [skill.toLowerCase()]).forEach(kw => myKeywords.add(kw));
    });

    const scored = allJobs.map(job => {
      const jobText = [job.title, job.brand, ...(job.tags || [])].join(" ").toLowerCase();
      let score = 0;
      const matchedTags = [];

      myKeywords.forEach(kw => { if (jobText.includes(kw)) score += 10; });
      (job.tags || []).forEach(tag => {
        if (skills.some(s => s.toLowerCase() === tag.toLowerCase())) { score += 25; matchedTags.push(tag); }
        else if (tag.toLowerCase().split(" ").some(w => myKeywords.has(w))) matchedTags.push(tag);
      });

      return { ...job, matchScore: score, matchedTags, isMatch: score >= 10 };
    }).sort((a, b) => b.matchScore - a.matchScore);

    const perfect   = scored.filter(j => j.matchScore >= 30).length;
    const partial   = scored.filter(j => j.matchScore > 0 && j.matchScore < 30).length;
    const unmatched = scored.filter(j => j.matchScore === 0).length;

    res.json({ success: true, matched: scored, stats: { perfect, partial, unmatched, total: scored.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Matching failed." });
  }
});

// ═══════════════════════════════════════════
// PAGE ROUTES
// ═══════════════════════════════════════════
app.get("/",                (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/login",           (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/register",        (req, res) => res.sendFile(path.join(__dirname, "public", "register.html")));
app.get("/dashboard",       (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/brand-dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "brand-dashboard.html")));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "NextGenGrowth API running 🚀",
    database: isMongoConnected() ? "MongoDB ✅" : "In-Memory ⚠️",
    users: isMongoConnected() ? "See MongoDB" : memUsers.length
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📄 Login      → http://localhost:${PORT}/login`);
  console.log(`📄 Register   → http://localhost:${PORT}/register`);
  console.log(`📄 Dashboard  → http://localhost:${PORT}/dashboard`);
  console.log(`📄 Brand      → http://localhost:${PORT}/brand-dashboard`);
  console.log(`🔌 Health     → http://localhost:${PORT}/api/health\n`);
});
