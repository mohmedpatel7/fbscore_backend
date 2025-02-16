const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const Admin = require("../schema_models/Admin");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const adminauth = require("../middleware/adminauth");
const ReqTeam = require("../schema_models/ReqTeam");
const Team = require("../schema_models/Team");

// Load environment variables from .env file
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN;

// Configure multer for profile picture upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads")); // Folder for storing uploaded files
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB file size limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);

    if (mimetype && extname) return cb(null, true);
    cb("Error: Images Only!");
  },
});

//Route 1:Admin create..
router.post(
  "/adminSignup",
  upload.single("pic"),
  [
    body("name").isString().withMessage("name is required.!"),
    body("adminId").isString().withMessage("admin id is required..!"),
    body("password")
      .isString()
      .isLength({ min: 5, max: 16 })
      .withMessage("Password must be 5-16 characters..!"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, adminId, password } = req.body;

      // Check if admin already exists
      const existingAdmin = await Admin.findOne({ adminId });
      if (existingAdmin) {
        return res
          .status(400)
          .json({ error: "Admin with this ID already exists" });
      }

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new admin
      const admin = new Admin({
        name,
        adminId,
        password: hashedPassword,
        profilePic: req.file ? req.file.filename : null,
      });

      // Save admin to database
      await admin.save();

      // Create JWT token
      const payload = {
        admin: {
          id: admin.id,
        },
      };

      const admintoken = jwt.sign(payload, JWT_SIGN);

      res.json({ admintoken });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

//Route 2:Admin Signin...
router.post(
  "/adminSignin",
  [
    body("adminId").isString().withMessage("Admin ID is required!"),
    body("password").exists().withMessage("Password is required!"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { adminId, password } = req.body;

      // Find admin by adminId
      const admin = await Admin.findOne({ adminId });
      if (!admin) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      if (!isPasswordValid) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      // Create JWT token
      const payload = {
        admin: {
          id: admin.id,
        },
      };

      const admintoken = jwt.sign(payload, JWT_SIGN);

      res.json({ admintoken });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

//Route 3:Fetching all team requests.Sign in required for admin..
router.get("/fetchTeamRequests", [adminauth], async (req, res) => {
  try {
    const requests = await ReqTeam.find({});

    if (!requests)
      return res.status(400).json({ message: "No requests found..!" });

    const response = {
      requests: requests.map((request) => ({
        requestId: request._id,
        teamname: request.teamname,
        teamlogo: request.teamlogo,
        owner: request.createdBy,
        country: request.country,
        email: request.email,
        password: request.password,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      })),
    };

    return res.status(200).json({ response });
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
});

//Route 4:Admin action on team requests.Signin required for admin.
router.post("/adminAcTeam/:reqId", [adminauth], async (req, res) => {
  try {
    const { action } = req.body;
    const { reqId } = req.params;

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!reqId) return res.status(404).json({ Message: "Id not provided.!" });

    const userRequest = await ReqTeam.findById(reqId);
    if (!userRequest)
      return res.status(400).json({ message: "Request not found..!" });

    if (action === "accept") {
      const newTeam = new Team({
        teamname: userRequest.teamname,
        teamlogo: userRequest.teamlogo,
        country: userRequest.country,
        createdBy: userRequest.createdBy,
        email: userRequest.email,
        password: userRequest.password,
      });

      await newTeam.save();
      await ReqTeam.findByIdAndDelete(reqId);

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // Use TLS
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL, // Sender email address
        to: userRequest.email, // Recipient email address
        subject: "Team regestration.", // Email subject
        text: `Congrates! Your request for the team registration has been accepted by fbscore,Sign in with your ${userRequest.email} and password.`, // Email body
      });

      return res.status(200).json({ newTeam });
    } else if (action === "reject") {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // Use TLS
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL, // Sender email address
        to: userRequest.email, // Recipient email address
        subject: "Team regestration", // Email subject
        text: `Your request for the team registration has been rejected by fbscore,You can apply again later.`, // Email body
      });

      await ReqTeam.findByIdAndDelete(reqId);
      return res.json({ Message: "request rejected." });
    }
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
});

//Route 5:Fetching all team details.Sign in required for admin.
router.get("/getTeams", [adminauth], async (req, res) => {
  try {
    const teams = await Team.find().select("-password");

    if (!teams) return res.status(404).json({ message: "No teams found.!" });

    const response = {
      teams: teams.map((team) => ({
        teamname: team.teamname,
        teamlogo: team.teamlogo,
        country: team.country,
        createdBy: team.createdBy,
        email: team.email,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      })),
    };

    return res.status(200).json({ response });
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
