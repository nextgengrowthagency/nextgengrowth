const express    = require("express");
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const cors       = require("cors");
const bodyParser = require("body-parser");
const rateLimit  = require("express-rate-limit");
const path       = require("path");
const mongoose   = require("mongoose");
const nodemailer = require("nodemailer");

const app        = express();
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "nextgengrowth_secret_2026";
const MONGO_URI  = process.env.MONGODB_URI;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

// ═══════════════════════════════════════════
// MONGODB CONNECTION
// ═══════════════════════════════════════════
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ═══════════════════════════════════════════
// EMAIL SETUP
// ═══════════════════════════════════════════
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_PASS }
});

// Test email connection
transporter.verify((err) => {
  if (err) console.log("⚠️ Email not connected:", err.message);
  else console.log("✅ Email ready! Gmail connected.");
});

// Send email helper
async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"NextGenGrowth" <${GMAIL_USER}>`,
      to, subject, html
    });
    console.log(`📧 Email sent to: ${to}`);
  } catch (err) {
    console.error("❌ Email error:", err.message);
  }
}

// Email templates
function emailStudentAccepted(studentName, jobTitle, brandName) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7fdf9;padding:20px">
    <div style="background:linear-gradient(135deg,#0a7c44,#064e2b);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
      <h1 style="color:white;margin:0;font-size:28px">🎉 Congratulations!</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">NextGenGrowth</p>
    </div>
    <div style="background:white;border-radius:16px;padding:28px;border:1px solid #d1ead9">
      <h2 style="color:#0a1f12;margin-top:0">Hi ${studentName}! 👋</h2>
      <p style="color:#2d5a3d;font-size:16px">Great news! Your application has been <strong style="color:#00c96b">ACCEPTED</strong>!</p>
      <div style="background:#e8fdf2;border:1px solid #d1ead9;border-radius:12px;padding:16px;margin:20px 0">
        <p style="margin:0;color:#064e2b"><strong>📋 Project:</strong> ${jobTitle}</p>
        <p style="margin:8px 0 0;color:#064e2b"><strong>🏢 Brand:</strong> ${brandName}</p>
      </div>
      <p style="color:#6b8f77">Log in to your dashboard to view the details and get started!</p>
      <a href="https://nextgengrowth-production.up.railway.app/dashboard" style="display:inline-block;background:linear-gradient(135deg,#0a7c44,#064e2b);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:8px">View Dashboard →</a>
    </div>
    <p style="text-align:center;color:#6b8f77;font-size:13px;margin-top:16px">NextGenGrowth — Student Opportunity Platform</p>
  </div>`;
}

function emailStudentRejected(studentName, jobTitle, brandName) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7fdf9;padding:20px">
    <div style="background:linear-gradient(135deg,#0a7c44,#064e2b);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
      <h1 style="color:white;margin:0;font-size:28px">NextGenGrowth</h1>
    </div>
    <div style="background:white;border-radius:16px;padding:28px;border:1px solid #d1ead9">
      <h2 style="color:#0a1f12;margin-top:0">Hi ${studentName},</h2>
      <p style="color:#2d5a3d;font-size:16px">Thank you for applying! Unfortunately, your application for <strong>${jobTitle}</strong> from <strong>${brandName}</strong> was not selected this time.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:20px 0">
        <p style="margin:0;color:#dc2626">💪 Don't give up! Many more projects are waiting for you.</p>
      </div>
      <p style="color:#6b8f77">Keep improving your skills and applying. Your next opportunity is just around the corner!</p>
      <a href="https://nextgengrowth-production.up.railway.app/dashboard" style="display:inline-block;background:linear-gradient(135deg,#0a7c44,#064e2b);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:8px">Browse More Projects →</a>
    </div>
    <p style="text-align:center;color:#6b8f77;font-size:13px;margin-top:16px">NextGenGrowth — Student Opportunity Platform</p>
  </div>`;
}

function emailBrandNewApplication(brandName, studentName, jobTitle, studentEmail, skills) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7fdf9;padding:20px">
    <div style="background:linear-gradient(135deg,#0a7c44,#064e2b);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
      <h1 style="color:white;margin:0;font-size:28px">📥 New Application!</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">NextGenGrowth</p>
    </div>
    <div style="background:white;border-radius:16px;padding:28px;border:1px solid #d1ead9">
      <h2 style="color:#0a1f12;margin-top:0">Hi ${brandName}! 👋</h2>
      <p style="color:#2d5a3d;font-size:16px">A student has applied for your project!</p>
      <div style="background:#e8fdf2;border:1px solid #d1ead9;border-radius:12px;padding:16px;margin:20px 0">
        <p style="margin:0;color:#064e2b"><strong>👤 Student:</strong> ${studentName}</p>
        <p style="margin:8px 0;color:#064e2b"><strong>📧 Email:</strong> ${studentEmail}</p>
        <p style="margin:8px 0;color:#064e2b"><strong>📋 Project:</strong> ${jobTitle}</p>
        <p style="margin:8px 0 0;color:#064e2b"><strong>🎯 Skills:</strong> ${skills||'Not specified'}</p>
      </div>
      <p style="color:#6b8f77">Log in to your brand dashboard to review and accept/reject the application.</p>
      <a href="https://nextgengrowth-production.up.railway.app/brand-dashboard" style="display:inline-block;background:linear-gradient(135deg,#0a7c44,#064e2b);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;margin-top:8px">Review Application →</a>
    </div>
    <p style="text-align:center;color:#6b8f77;font-size:13px;margin-top:16px">NextGenGrowth — Student Opportunity Platform</p>
  </div>`;
}

function emailWelcome(name, role) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7fdf9;padding:20px">
    <div style="background:linear-gradient(135deg,#0a7c44,#064e2b);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
      <h1 style="color:white;margin:0;font-size:28px">🎉 Welcome!</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">NextGenGrowth</p>
    </div>
    <div style="background:white;border-radius:16px;padding:28px;border:1px solid #d1ead9">
      <h2 style="color:#0a1f12;margin-top:0">Hi ${name}! 👋</h2>
      <p style="color:#2d5a3d;font-size:16px">Welcome to <strong>NextGenGrowth</strong> — India's Student Opportunity Platform!</p>
      ${role==='student'?`
      <div style="background:#e8fdf2;border:1px solid #d1ead9;border-radius:12px;padding:16px;margin:20px 0">
        <p style="margin:0;color:#064e2b;font-weight:bold">🚀 Your Next Steps:</p>
        <p style="margin:8px 0;color:#2d5a3d">1. Add your skills in Profile</p>
        <p style="margin:8px 0;color:#2d5a3d">2. Browse matched projects</p>
        <p style="margin:8px 0 0;color:#2d5a3d">3. Apply and start earning! 💰</p>
      </div>
      <a href="https://nextgengrowth-production.up.railway.app/dashboard" style="display:inline-block;background:linear-gradient(135deg,#0a7c44,#064e2b);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold">Go to Dashboard →</a>
      `:`
      <div style="background:#e8fdf2;border:1px solid #d1ead9;border-radius:12px;padding:16px;margin:20px 0">
        <p style="margin:0;color:#064e2b;font-weight:bold">🚀 Your Next Steps:</p>
        <p style="margin:8px 0;color:#2d5a3d">1. Post your first project</p>
        <p style="margin:8px 0;color:#2d5a3d">2. Review student applications</p>
        <p style="margin:8px 0 0;color:#2d5a3d">3. Get quality work done! ✅</p>
      </div>
      <a href="https://nextgengrowth-production.up.railway.app/brand-dashboard" style="display:inline-block;background:linear-gradient(135deg,#0a7c44,#064e2b);color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold">Go to Dashboard →</a>
      `}
    </div>
    <p style="text-align:center;color:#6b8f77;font-size:13px;margin-top:16px">NextGenGrowth — Student Opportunity Platform</p>
  </div>`;
}

// ═══════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════
const userSchema = new mongoose.Schema({
  firstName:{type:String,required:true},lastName:{type:String,required:true},
  email:{type:String,required:true,unique:true,lowercase:true},
  password:{type:String,required:true},role:{type:String,enum:["student","brand"],required:true},
  college:{type:String,default:""},skills:{type:[String],default:[]},
  companyName:{type:String,default:""},serviceNeeded:{type:String,default:""},
  bio:{type:String,default:""},linkedin:{type:String,default:""},
},{timestamps:true});

const applicationSchema = new mongoose.Schema({
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  jobId:{type:Number,required:true},jobTitle:{type:String,required:true},
  brandName:{type:String,required:true},brandId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  pay:{type:String,required:true},status:{type:String,enum:["review","accepted","rejected"],default:"review"},
},{timestamps:true});

const earningSchema = new mongoose.Schema({
  studentId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  amount:{type:Number,required:true},description:{type:String,default:"Project payment"},
  status:{type:String,enum:["paid","pending"],default:"paid"},
},{timestamps:true});

const brandProjectSchema = new mongoose.Schema({
  brandId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  title:{type:String,required:true},description:{type:String,default:""},
  budget:{type:String,required:true},category:{type:String,required:true},
  deadline:{type:String,default:""},status:{type:String,enum:["open","closed"],default:"open"},
},{timestamps:true});

const User=mongoose.model("User",userSchema);
const Application=mongoose.model("Application",applicationSchema);
const Earning=mongoose.model("Earning",earningSchema);
const BrandProject=mongoose.model("BrandProject",brandProjectSchema);

console.log("✅ All models loaded!");

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname,"public")));
app.set('trust proxy',1);

const authLimiter=rateLimit({windowMs:15*60*1000,max:20,message:{success:false,message:"Too many attempts."}});

function generateToken(user){
  return jwt.sign({id:user._id,email:user.email,role:user.role,name:`${user.firstName} ${user.lastName}`},JWT_SECRET,{expiresIn:"7d"});
}
function verifyToken(req,res,next){
  const token=(req.headers["authorization"]||"").split(" ")[1];
  if(!token)return res.status(401).json({success:false,message:"No token."});
  try{req.user=jwt.verify(token,JWT_SECRET);next();}
  catch{res.status(403).json({success:false,message:"Invalid token."});}
}
function safeUser(user){
  const u=user.toObject?user.toObject():user;
  delete u.password;u.name=`${u.firstName} ${u.lastName}`;return u;
}

// ═══════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════
app.post("/api/register",authLimiter,async(req,res)=>{
  try{
    const{firstName,lastName,email,password,role,college,skills,companyName,serviceNeeded}=req.body;
    if(!firstName||!lastName||!email||!password||!role)
      return res.status(400).json({success:false,message:"All fields required."});
    if(password.length<8)return res.status(400).json({success:false,message:"Password must be 8+ characters."});
    const existing=await User.findOne({email:email.toLowerCase()});
    if(existing)return res.status(409).json({success:false,message:"Email already registered."});
    const hashedPwd=await bcrypt.hash(password,12);
    const newUser=await User.create({firstName,lastName,email:email.toLowerCase(),password:hashedPwd,role,college:college||"",skills:skills||[],companyName:companyName||"",serviceNeeded:serviceNeeded||""});
    const token=generateToken(newUser);
    // Send welcome email
    sendEmail(email,`Welcome to NextGenGrowth, ${firstName}! 🎉`,emailWelcome(firstName,role));
    console.log(`✅ Registered [${role}]: ${email}`);
    res.status(201).json({success:true,message:`Welcome to NextGenGrowth, ${firstName}! 🎉`,token,user:safeUser(newUser)});
  }catch(err){console.error("Register error:",err);res.status(500).json({success:false,message:"Server error."});}
});

app.post("/api/login",authLimiter,async(req,res)=>{
  try{
    const{email,password,role}=req.body;
    if(!email||!password)return res.status(400).json({success:false,message:"Email and password required."});
    const user=await User.findOne({email:email.toLowerCase()});
    if(!user)return res.status(401).json({success:false,message:"Invalid email or password."});
    if(role&&user.role!==role)return res.status(401).json({success:false,message:`This is a ${user.role} account.`});
    const ok=await bcrypt.compare(password,user.password);
    if(!ok)return res.status(401).json({success:false,message:"Invalid email or password."});
    const token=generateToken(user);
    console.log(`🔑 Login: ${email} [${user.role}]`);
    res.json({success:true,message:`Welcome back, ${user.firstName}! 👋`,token,user:safeUser(user)});
  }catch(err){console.error("Login error:",err);res.status(500).json({success:false,message:"Server error."});}
});

// ═══════════════════════════════════════════
// PROFILE ROUTES
// ═══════════════════════════════════════════
app.get("/api/profile",verifyToken,async(req,res)=>{
  try{
    const user=await User.findById(req.user.id);
    if(!user)return res.status(404).json({success:false,message:"User not found."});
    res.json({success:true,user:safeUser(user)});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.put("/api/profile",verifyToken,async(req,res)=>{
  try{
    const{firstName,lastName,college,skills,bio,linkedin}=req.body;
    const updates={};
    if(firstName!==undefined)updates.firstName=firstName;
    if(lastName!==undefined)updates.lastName=lastName;
    if(college!==undefined)updates.college=college;
    if(skills!==undefined)updates.skills=skills;
    if(bio!==undefined)updates.bio=bio;
    if(linkedin!==undefined)updates.linkedin=linkedin;
    const updated=await User.findByIdAndUpdate(req.user.id,{$set:updates},{new:true,runValidators:false});
    res.json({success:true,message:"Profile updated!",user:safeUser(updated)});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

// ═══════════════════════════════════════════
// STUDENT ROUTES
// ═══════════════════════════════════════════
app.get("/api/student/stats",verifyToken,async(req,res)=>{
  try{
    const sid=req.user.id;
    const[earned,projectsDone,activeApps,pending,transactions,applications]=await Promise.all([
      Earning.aggregate([{$match:{studentId:new mongoose.Types.ObjectId(sid),status:"paid"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
      Application.countDocuments({studentId:sid,status:"accepted"}),
      Application.countDocuments({studentId:sid,status:"review"}),
      Earning.aggregate([{$match:{studentId:new mongoose.Types.ObjectId(sid),status:"pending"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
      Earning.find({studentId:sid}).sort({createdAt:-1}).limit(10),
      Application.find({studentId:sid}).sort({createdAt:-1}).limit(10),
    ]);
    res.json({success:true,stats:{totalEarned:earned[0]?.total||0,projectsDone:projectsDone||0,activeApps:activeApps||0,pending:pending[0]?.total||0,rating:projectsDone>0?4.9:null},transactions,applications});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

// APPLY — with brand email notification
app.post("/api/apply",verifyToken,async(req,res)=>{
  try{
    if(req.user.role!=="student")return res.status(403).json({success:false,message:"Only students can apply."});
    const{jobId,jobTitle,brandName,pay}=req.body;
    const existing=await Application.findOne({studentId:req.user.id,jobId});
    if(existing)return res.status(409).json({success:false,message:"Already applied for this project."});
    await Application.create({studentId:req.user.id,jobId,jobTitle,brandName,pay});
    const activeCount=await Application.countDocuments({studentId:req.user.id,status:"review"});
    // Get student details for email
    const student=await User.findById(req.user.id);
    // Find brand by name and send email
    const brand=await User.findOne({companyName:brandName,role:"brand"});
    if(brand&&brand.email){
      sendEmail(brand.email,`📥 New Application for "${jobTitle}"!`,emailBrandNewApplication(brand.companyName||brand.firstName,student.firstName+' '+student.lastName,jobTitle,student.email,student.skills.join(', ')));
    }
    res.json({success:true,message:`Applied for "${jobTitle}"! 🎉`,activeApplications:activeCount});
  }catch(err){console.error("Apply error:",err);res.status(500).json({success:false,message:"Server error."});}
});

// ═══════════════════════════════════════════
// BRAND ROUTES
// ═══════════════════════════════════════════
app.get("/api/brand/stats",verifyToken,async(req,res)=>{
  try{
    if(req.user.role!=="brand")return res.status(403).json({success:false,message:"Brand only."});
    const[totalProjects,openProjects,projects]=await Promise.all([
      BrandProject.countDocuments({brandId:req.user.id}),
      BrandProject.countDocuments({brandId:req.user.id,status:"open"}),
      BrandProject.find({brandId:req.user.id}).sort({createdAt:-1}),
    ]);
    res.json({success:true,stats:{totalProjects,openProjects,totalApps:0},projects});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.post("/api/brand/project",verifyToken,async(req,res)=>{
  try{
    if(req.user.role!=="brand")return res.status(403).json({success:false,message:"Brand only."});
    const{title,description,budget,category,deadline}=req.body;
    if(!title||!budget||!category)return res.status(400).json({success:false,message:"Title, budget and category required."});
    const project=await BrandProject.create({brandId:req.user.id,title,description,budget,category,deadline});
    res.json({success:true,message:"Project posted! 🚀",projectId:project._id});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

// ✅ NEW — Brand sees applications for their projects
app.get("/api/brand/applications",verifyToken,async(req,res)=>{
  try{
    if(req.user.role!=="brand")return res.status(403).json({success:false,message:"Brand only."});
    // Get applications where brandName matches this brand's company
    const brand=await User.findById(req.user.id);
    const apps=await Application.find({brandName:brand.companyName||brand.firstName+' '+brand.lastName})
      .populate("studentId","firstName lastName email college skills bio linkedin")
      .sort({createdAt:-1});
    const result=apps.map(a=>({
      ...a.toObject(),
      student:{
        id:a.studentId?._id,
        name:`${a.studentId?.firstName||''} ${a.studentId?.lastName||''}`.trim(),
        email:a.studentId?.email||'',
        college:a.studentId?.college||'',
        skills:a.studentId?.skills||[],
        bio:a.studentId?.bio||'',
        linkedin:a.studentId?.linkedin||'',
      }
    }));
    res.json({success:true,applications:result});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

// ✅ NEW — Brand accepts or rejects application (with email to student)
app.put("/api/brand/application/:id",verifyToken,async(req,res)=>{
  try{
    if(req.user.role!=="brand")return res.status(403).json({success:false,message:"Brand only."});
    const{status}=req.body; // "accepted" or "rejected"
    if(!["accepted","rejected"].includes(status))
      return res.status(400).json({success:false,message:"Status must be accepted or rejected."});
    const app=await Application.findById(req.params.id).populate("studentId","firstName lastName email");
    if(!app)return res.status(404).json({success:false,message:"Application not found."});
    app.status=status;await app.save();
    // ✅ Send email to student
    const student=app.studentId;
    if(student&&student.email){
      if(status==="accepted"){
        sendEmail(student.email,`🎉 Your application was ACCEPTED! — ${app.jobTitle}`,emailStudentAccepted(student.firstName,app.jobTitle,app.brandName));
      }else{
        sendEmail(student.email,`Application Update — ${app.jobTitle}`,emailStudentRejected(student.firstName,app.jobTitle,app.brandName));
      }
    }
    console.log(`📋 Application ${status}: ${app.jobTitle} → ${student?.email}`);
    res.json({success:true,message:`Application ${status}! Email sent to student. ✅`});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

// ═══════════════════════════════════════════
// AI JOB MATCHING
// ═══════════════════════════════════════════
app.post("/api/match-jobs",verifyToken,(req,res)=>{
  try{
    const{skills=[],allJobs=[]}=req.body;
    if(!skills.length)return res.json({success:true,matched:allJobs,stats:{perfect:0,partial:0,unmatched:allJobs.length,total:allJobs.length}});
    const skillMap={'Video Editing':['video','editing','reel','reels','tiktok','youtube','shorts','capcut'],'Graphic Design':['design','graphic','logo','canva','brand','branding','visual','figma','banner'],'Web Development':['web','website','html','css','wordpress','landing','page','frontend'],'Content Writing':['content','writing','blog','article','seo','copy','copywriting','newsletter'],'Social Media':['social','instagram','twitter','linkedin','media','post'],'Photography':['photo','photography','lightroom','product'],'Audio':['audio','music','sound','podcast'],'Data & Excel':['data','excel','spreadsheet'],'AI Tools':['ai','chatgpt','automation']};
    const kws=new Set();skills.forEach(sk=>(skillMap[sk]||[]).forEach(k=>kws.add(k)));
    const scored=allJobs.map(job=>{
      const txt=[job.title,job.brand,...(job.tags||[])].join(' ').toLowerCase();
      let score=0;const mt=[];
      kws.forEach(k=>{if(txt.includes(k))score+=10;});
      (job.tags||[]).forEach(t=>{if(skills.some(s=>s.toLowerCase()===t.toLowerCase())){score+=25;mt.push(t);}else if([...kws].some(k=>t.toLowerCase().includes(k)))mt.push(t);});
      return{...job,matchScore:score,matchedTags:mt,isMatch:score>=10};
    }).sort((a,b)=>b.matchScore-a.matchScore);
    res.json({success:true,matched:scored,stats:{perfect:scored.filter(j=>j.matchScore>=30).length,partial:scored.filter(j=>j.matchScore>0&&j.matchScore<30).length,unmatched:scored.filter(j=>j.matchScore===0).length,total:scored.length}});
  }catch(err){res.status(500).json({success:false,message:"Matching failed."});}
});

// ═══════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════
const ADMIN_EMAIL=process.env.ADMIN_EMAIL||"admin@nextgengrowth.in";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"NGG@Admin2026";

app.post("/api/admin/login",(req,res)=>{
  const{email,password}=req.body;
  if(email===ADMIN_EMAIL&&password===ADMIN_PASSWORD){
    const token=jwt.sign({role:"admin",email},JWT_SECRET,{expiresIn:"1d"});
    res.json({success:true,token,message:"Welcome back, Admin! 👑"});
  }else{
    res.status(401).json({success:false,message:"Invalid admin credentials."});
  }
});

function adminOnly(req,res,next){
  const token=(req.headers["authorization"]||"").split(" ")[1];
  if(!token)return res.status(401).json({success:false,message:"No token."});
  try{const decoded=jwt.verify(token,JWT_SECRET);if(decoded.role!=="admin")return res.status(403).json({success:false,message:"Admins only."});req.admin=decoded;next();}
  catch{res.status(403).json({success:false,message:"Invalid token."});}
}

app.get("/api/admin/stats",adminOnly,async(req,res)=>{
  try{
    const today=new Date();today.setHours(0,0,0,0);
    const[totalUsers,totalStudents,totalBrands,totalProjects,openProjects,totalApps,acceptedApps,todaySignups,earningsData,pendingData]=await Promise.all([
      User.countDocuments(),User.countDocuments({role:"student"}),User.countDocuments({role:"brand"}),
      BrandProject.countDocuments(),BrandProject.countDocuments({status:"open"}),
      Application.countDocuments(),Application.countDocuments({status:"accepted"}),
      User.countDocuments({createdAt:{$gte:today}}),
      Earning.aggregate([{$match:{status:"paid"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
      Earning.aggregate([{$match:{status:"pending"}},{$group:{_id:null,total:{$sum:"$amount"}}}]),
    ]);
    res.json({success:true,stats:{totalUsers,totalStudents,totalBrands,totalProjects,openProjects,totalApps,acceptedApps,totalEarnings:earningsData[0]?.total||0,pendingEarnings:pendingData[0]?.total||0,todaySignups}});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.get("/api/admin/users",adminOnly,async(req,res)=>{
  try{
    const users=await User.find().select("-password").sort({createdAt:-1});
    const result=users.map(u=>({...u.toObject(),name:`${u.firstName} ${u.lastName}`}));
    res.json({success:true,users:result});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.delete("/api/admin/user/:id",adminOnly,async(req,res)=>{
  try{
    const user=await User.findById(req.params.id);
    if(!user)return res.status(404).json({success:false,message:"User not found."});
    await User.findByIdAndDelete(req.params.id);
    await Application.deleteMany({studentId:req.params.id});
    res.json({success:true,message:`User ${user.email} deleted.`});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.get("/api/admin/projects",adminOnly,async(req,res)=>{
  try{
    const projects=await BrandProject.find().populate("brandId","firstName lastName email").sort({createdAt:-1});
    const result=projects.map(p=>({...p.toObject(),firstName:p.brandId?.firstName||"",lastName:p.brandId?.lastName||"",brandEmail:p.brandId?.email||""}));
    res.json({success:true,projects:result});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.delete("/api/admin/project/:id",adminOnly,async(req,res)=>{
  try{await BrandProject.findByIdAndDelete(req.params.id);res.json({success:true,message:"Project deleted."});}
  catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.get("/api/admin/applications",adminOnly,async(req,res)=>{
  try{
    const apps=await Application.find().populate("studentId","firstName lastName email").sort({createdAt:-1});
    const result=apps.map(a=>({...a.toObject(),firstName:a.studentId?.firstName||"",lastName:a.studentId?.lastName||"",studentEmail:a.studentId?.email||""}));
    res.json({success:true,applications:result});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.get("/api/admin/transactions",adminOnly,async(req,res)=>{
  try{
    const txs=await Earning.find().populate("studentId","firstName lastName email").sort({createdAt:-1});
    const result=txs.map(t=>({...t.toObject(),firstName:t.studentId?.firstName||"",lastName:t.studentId?.lastName||"",email:t.studentId?.email||""}));
    res.json({success:true,transactions:result});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

app.post("/api/admin/earning",adminOnly,async(req,res)=>{
  try{
    const{studentId,amount,description,status}=req.body;
    await Earning.create({studentId,amount,description,status:status||"paid"});
    // Email student about payment
    const student=await User.findById(studentId);
    if(student){
      sendEmail(student.email,`💰 Payment Received — NextGenGrowth`,`<div style="font-family:Arial,sans-serif;padding:20px;background:#f7fdf9"><div style="background:linear-gradient(135deg,#0a7c44,#064e2b);border-radius:16px;padding:24px;text-align:center;color:white"><h2>💰 Payment Received!</h2><p style="font-size:2rem;font-weight:bold">₹${amount}</p><p>${description||'Project payment'}</p></div><a href="https://nextgengrowth-production.up.railway.app/dashboard" style="display:inline-block;background:#0a7c44;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;margin-top:16px">View Earnings →</a></div>`);
    }
    res.json({success:true,message:"Earning added!"});
  }catch(err){res.status(500).json({success:false,message:"Server error."});}
});

// ═══════════════════════════════════════════
// PAGE ROUTES
// ═══════════════════════════════════════════
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","login.html")));
app.get("/login",(req,res)=>res.sendFile(path.join(__dirname,"public","login.html")));
app.get("/register",(req,res)=>res.sendFile(path.join(__dirname,"public","register.html")));
app.get("/dashboard",(req,res)=>res.sendFile(path.join(__dirname,"public","dashboard.html")));
app.get("/brand-dashboard",(req,res)=>res.sendFile(path.join(__dirname,"public","brand-dashboard.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));

app.get("/api/health",async(req,res)=>{
  const userCount=await User.countDocuments();
  res.json({success:true,message:"NextGenGrowth API 🚀 MongoDB Connected!",users:userCount});
});

app.listen(PORT,()=>{
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📧 Email:  ${GMAIL_USER||'Not configured'}`);
  console.log(`🗄️  DB:     MongoDB Atlas\n`);
});
