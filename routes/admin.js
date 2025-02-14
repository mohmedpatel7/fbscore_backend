const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const Admin = require("../schema_models/Admin");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");

// Load environment variables from .env file
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN; // Secret key for JWT

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

      const authToken = jwt.sign(payload, JWT_SIGN);

      res.json({ authToken });
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

      const authToken = jwt.sign(payload, JWT_SIGN);

      res.json({ authToken });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
