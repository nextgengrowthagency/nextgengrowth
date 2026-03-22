const express    = require("express");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const cors       = require("cors");
const bodyParser = require("body-parser");
const rateLimit  = require("express-rate-limit");
const path       = require("path");
const mongoose   = require("mongoose");

const app        = express();
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "nextgengrowth_secret_2026";
const MONGO_URI  = process.env.MONGODB_URI;

// ═══════════════════════════════════════════
// MONGODB CONNECTION
// ═══════════════════════════════════════════
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully!"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// ═══════════════════════════════════════════
// MONGOOSE SCHEMAS (Database Tables)
// ═══════════════════════════════════════════

// USER SCHEMA
const userSchema = new mongoose.Schema({
  firstName:     { type: String, required: true },
  lastName:      { type: String, required: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  password:      { type: String, required: true },
  role:          { type: String, enum: ["student", "brand"], required: true },
  college:       { type: String, default: "" },
  skills:        { type: [String], default: [] },
  companyName:   { type: String, default: "" },
  serviceNeeded: { type: String, default: "" },
  bio:           { type: String, default: "" },
  linkedin:      { type: String, default: "" },
}, { timestamps: true });

// APPLICATION SCHEMA
const applicationSchema = new mongoose.Schema({
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  jobId:      { type: Number, required: true },
  jobTitle:   { type: String, required: true },
  brandName:  { type: String, required: true },
  pay:        { type: String, required: true },
  status:     { type: String, enum: ["review", "accepted", "rejected"], default: "review" },
}, { timestamps: true });

// EARNING SCHEMA
const earningSchema = new mongoose.Schema({
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount:      { type: Number, required: true },
  description: { type: String, default: "Project payment" },
  status:      { type: String, enum: ["paid", "pending"], default: "paid" },
}, { timestamps: true });

// BRAND PROJECT SCHEMA
const brandProjectSchema = new mongoose.Schema({
  brandId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title:       { type: String, required: true },
  description: { type: String, default: "" },
  budget:      { type: String, required: true },
  category:    { type: String, required: true },
  deadline:    { type: String, default: "" },
  status:      { type: String, enum: ["open", "closed"], default: "open" },
}, { timestamps: true });

// MODELS
const User         = mongoose.model("User",         userSchema);
const Application  = mongoose.model("Application",  applicationSchema);
const Earning      = mongoose.model("Earning",       earningSchema);
const BrandProject = mongoose.model("BrandProject", brandProjectSchema);

console.log("✅ All MongoDB models loaded!");

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many attempts. Try again later." }
});

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: `${user.firstName} ${user.lastName}` },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyToken(req, res, next) {
  const token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ success: false, message: "Invalid or expired token." });
  }
}

function safeUser(user) {
  const u = user.toObject ? user.toObject() : user;
  delete u.password;
  u.name = `${u.firstName} ${u.lastName}`;
  return u;
}

// ═══════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════

// REGISTER
app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const { firstName, lastName, email, password, role,
            college, skills, companyName, serviceNeeded } = req.body;

    if (!firstName || !lastName || !email || !password || !role)
      return res.status(400).json({ success: false, message: "All fields required." });

    if (password.length < 8)
      return res.status(400).json({ success: false, message: "Password must be 8+ characters." });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ success: false, message: "Invalid email." });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ success: false, message: "Email already registered." });

    const hashedPwd = await bcrypt.hash(password, 12);

    const newUser = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPwd,
      role,
      college:       college       || "",
      skills:        skills        || [],
      companyName:   companyName   || "",
      serviceNeeded: serviceNeeded || "",
    });

    const token = generateToken(newUser);
    console.log(`✅ Registered [${role}]: ${email}`);

    res.status(201).json({
      success: true,
      message: `Welcome to NextGenGrowth, ${firstName}! 🎉`,
      token,
      user: safeUser(newUser)
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// LOGIN
app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password required." });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    if (role && user.role !== role)
      return res.status(401).json({ success: false, message: `This is a ${user.role} account.` });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    const token = generateToken(user);
    console.log(`🔑 Login: ${email} [${user.role}]`);

    res.json({
      success: true,
      message: `Welcome back, ${user.firstName}! 👋`,
      token,
      user: safeUser(user)
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// PROFILE ROUTES
// ═══════════════════════════════════════════

// GET profile
app.get("/api/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// UPDATE profile
app.put("/api/profile", verifyToken, async (req, res) => {
  try {
    const { firstName, lastName, college, skills, bio, linkedin } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { firstName, lastName, college, skills, bio, linkedin } },
      { new: true }
    );

    res.json({ success: true, message: "Profile updated!", user: safeUser(updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// STUDENT ROUTES
// ═══════════════════════════════════════════

// Student stats — REAL data from MongoDB
app.get("/api/student/stats", verifyToken, async (req, res) => {
  try {
    const sid = req.user.id;

    const [earned, projectsDone, activeApps, pending, transactions, applications] = await Promise.all([
      Earning.aggregate([{ $match: { studentId: new mongoose.Types.ObjectId(sid), status: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Application.countDocuments({ studentId: sid, status: "accepted" }),
      Application.countDocuments({ studentId: sid, status: "review" }),
      Earning.aggregate([{ $match: { studentId: new mongoose.Types.ObjectId(sid), status: "pending" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Earning.find({ studentId: sid }).sort({ createdAt: -1 }).limit(10),
      Application.find({ studentId: sid }).sort({ createdAt: -1 }).limit(10),
    ]);

    res.json({
      success: true,
      stats: {
        totalEarned:  earned[0]?.total  || 0,
        projectsDone: projectsDone      || 0,
        activeApps:   activeApps        || 0,
        pending:      pending[0]?.total || 0,
        rating:       projectsDone > 0 ? 4.9 : null,
      },
      transactions,
      applications
    });

  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// APPLY TO JOB
app.post("/api/apply", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "student")
      return res.status(403).json({ success: false, message: "Only students can apply." });

    const { jobId, jobTitle, brandName, pay } = req.body;

    const existing = await Application.findOne({ studentId: req.user.id, jobId });
    if (existing)
      return res.status(409).json({ success: false, message: "You already applied for this project." });

    await Application.create({
      studentId: req.user.id,
      jobId, jobTitle, brandName, pay
    });

    const activeCount = await Application.countDocuments({ studentId: req.user.id, status: "review" });

    res.json({
      success: true,
      message: `Applied for "${jobTitle}"! 🎉`,
      activeApplications: activeCount
    });

  } catch (err) {
    console.error("Apply error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// BRAND ROUTES
// ═══════════════════════════════════════════

// Brand stats
app.get("/api/brand/stats", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "brand")
      return res.status(403).json({ success: false, message: "Brand only." });

    const [totalProjects, openProjects, projects] = await Promise.all([
      BrandProject.countDocuments({ brandId: req.user.id }),
      BrandProject.countDocuments({ brandId: req.user.id, status: "open" }),
      BrandProject.find({ brandId: req.user.id }).sort({ createdAt: -1 }),
    ]);

    res.json({
      success: true,
      stats: { totalProjects, openProjects, totalApps: 0 },
      projects
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Post brand project
app.post("/api/brand/project", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "brand")
      return res.status(403).json({ success: false, message: "Brand only." });

    const { title, description, budget, category, deadline } = req.body;

    if (!title || !budget || !category)
      return res.status(400).json({ success: false, message: "Title, budget and category required." });

    const project = await BrandProject.create({
      brandId: req.user.id,
      title, description, budget, category, deadline
    });

    res.json({ success: true, message: "Project posted! Students will see it now 🚀", projectId: project._id });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// AI JOB MATCHING
// ═══════════════════════════════════════════
app.post("/api/match-jobs", verifyToken, (req, res) => {
  try {
    const { skills = [], allJobs = [] } = req.body;
    if (!skills.length)
      return res.json({ success: true, matched: allJobs, stats: { perfect: 0, partial: 0, unmatched: allJobs.length, total: allJobs.length } });

    const skillMap = {
      'Video Editing':   ['video','editing','reel','reels','tiktok','youtube','shorts','capcut'],
      'Graphic Design':  ['design','graphic','logo','canva','brand','branding','visual','figma','banner'],
      'Web Development': ['web','website','html','css','wordpress','landing','page','frontend','react'],
      'Content Writing': ['content','writing','blog','article','seo','copy','copywriting','newsletter','email'],
      'Social Media':    ['social','instagram','twitter','linkedin','facebook','media','post'],
      'Photography':     ['photo','photography','lightroom','product','image'],
      'Audio':           ['audio','music','sound','podcast'],
      'Data & Excel':    ['data','excel','spreadsheet','analytics'],
      'AI Tools':        ['ai','artificial','chatgpt','automation'],
    };

    const kws = new Set();
    skills.forEach(sk => (skillMap[sk] || []).forEach(k => kws.add(k)));

    const scored = allJobs.map(job => {
      const txt = [job.title, job.brand, ...(job.tags || [])].join(' ').toLowerCase();
      let score = 0;
      const mt = [];
      kws.forEach(k => { if (txt.includes(k)) score += 10; });
      (job.tags || []).forEach(t => {
        if (skills.some(s => s.toLowerCase() === t.toLowerCase())) { score += 25; mt.push(t); }
        else if ([...kws].some(k => t.toLowerCase().includes(k))) mt.push(t);
      });
      return { ...job, matchScore: score, matchedTags: mt, isMatch: score >= 10 };
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
// ADMIN ROUTES
// ═══════════════════════════════════════════
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "admin@nextgengrowth.in";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "NGG@Admin2026";

app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin", email }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ success: true, token, message: "Welcome back, Admin! 👑" });
  } else {
    res.status(401).json({ success: false, message: "Invalid admin credentials." });
  }
});

function adminOnly(req, res, next) {
  const token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token." });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ success: false, message: "Admins only." });
    req.admin = decoded;
    next();
  } catch {
    res.status(403).json({ success: false, message: "Invalid token." });
  }
}

// Admin stats
app.get("/api/admin/stats", adminOnly, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);

    const [totalUsers, totalStudents, totalBrands, totalProjects,
           openProjects, totalApps, acceptedApps, todaySignups, earningsData, pendingData] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "brand" }),
      BrandProject.countDocuments(),
      BrandProject.countDocuments({ status: "open" }),
      Application.countDocuments(),
      Application.countDocuments({ status: "accepted" }),
      User.countDocuments({ createdAt: { $gte: today } }),
      Earning.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
      Earning.aggregate([{ $match: { status: "pending" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers, totalStudents, totalBrands,
        totalProjects, openProjects,
        totalApps, acceptedApps,
        totalEarnings:  earningsData[0]?.total || 0,
        pendingEarnings: pendingData[0]?.total || 0,
        todaySignups,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin get all users
app.get("/api/admin/users", adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const result = users.map(u => ({ ...u.toObject(), name: `${u.firstName} ${u.lastName}` }));
    res.json({ success: true, users: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin delete user
app.delete("/api/admin/user/:id", adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    await User.findByIdAndDelete(req.params.id);
    await Application.deleteMany({ studentId: req.params.id });
    res.json({ success: true, message: `User ${user.email} deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin get all projects
app.get("/api/admin/projects", adminOnly, async (req, res) => {
  try {
    const projects = await BrandProject.find().populate("brandId", "firstName lastName email").sort({ createdAt: -1 });
    const result = projects.map(p => ({
      ...p.toObject(),
      firstName:  p.brandId?.firstName || "",
      lastName:   p.brandId?.lastName  || "",
      brandEmail: p.brandId?.email     || "",
    }));
    res.json({ success: true, projects: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin delete project
app.delete("/api/admin/project/:id", adminOnly, async (req, res) => {
  try {
    await BrandProject.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Project deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin get all applications
app.get("/api/admin/applications", adminOnly, async (req, res) => {
  try {
    const apps = await Application.find().populate("studentId", "firstName lastName email").sort({ createdAt: -1 });
    const result = apps.map(a => ({
      ...a.toObject(),
      firstName:    a.studentId?.firstName || "",
      lastName:     a.studentId?.lastName  || "",
      studentEmail: a.studentId?.email     || "",
    }));
    res.json({ success: true, applications: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin update application status
app.put("/api/admin/application/:id", adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    await Application.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true, message: `Application ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin get transactions
app.get("/api/admin/transactions", adminOnly, async (req, res) => {
  try {
    const txs = await Earning.find().populate("studentId", "firstName lastName email").sort({ createdAt: -1 });
    const result = txs.map(t => ({
      ...t.toObject(),
      firstName: t.studentId?.firstName || "",
      lastName:  t.studentId?.lastName  || "",
      email:     t.studentId?.email     || "",
    }));
    res.json({ success: true, transactions: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin add manual earning
app.post("/api/admin/earning", adminOnly, async (req, res) => {
  try {
    const { studentId, amount, description, status } = req.body;
    await Earning.create({ studentId, amount, description, status: status || "paid" });
    res.json({ success: true, message: "Earning added!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════
// PAGE ROUTES
// ═══════════════════════════════════════════
app.get("/",                (req,res) => res.sendFile(path.join(__dirname,"public","login.html")));
app.get("/login",           (req,res) => res.sendFile(path.join(__dirname,"public","login.html")));
app.get("/register",        (req,res) => res.sendFile(path.join(__dirname,"public","register.html")));
app.get("/dashboard",       (req,res) => res.sendFile(path.join(__dirname,"public","dashboard.html")));
app.get("/brand-dashboard", (req,res) => res.sendFile(path.join(__dirname,"public","brand-dashboard.html")));
app.get("/admin",           (req,res) => res.sendFile(path.join(__dirname,"public","admin.html")));

app.get("/api/health", async (req,res) => {
  const userCount = await User.countDocuments();
  res.json({ success: true, message: "NextGenGrowth API 🚀 MongoDB Connected!", users: userCount });
});

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📄 Login      → http://localhost:${PORT}/login`);
  console.log(`📄 Register   → http://localhost:${PORT}/register`);
  console.log(`📄 Dashboard  → http://localhost:${PORT}/dashboard`);
  console.log(`👑 Admin      → http://localhost:${PORT}/admin`);
  console.log(`🗄️  Database   → MongoDB Atlas\n`);
});
