const express = require("express");
const router = express.Router();
const User = require("../schema_models/User");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const userauth = require("../middleware/userauth");

// Load environment variables from .env file
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN; // Secret key for JWT
const baseUrl = process.env.baseurl;
const setOtp = {}; // Temporary storage for OTPs

// Define path to default profile picture
// const defaultProfilePath = path.join(__dirname, "../other/defaultprofile.jpg");

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

// Route 1: Send OTP
router.post(
  "/sendotp",
  [body("email").isEmail().withMessage("Invalid Email..!")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const otp = crypto.randomInt(1000, 9999).toString();
    const expiry = Date.now() + 2 * 60 * 1000; // 2-minute expiry

    setOtp[email] = { otp, expiry };

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // Use TLS
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    try {
      await transporter.sendMail({
        from: process.env.EMAIL, // Sender email address
        to: email, // Recipient email address
        subject: "OTP for Signup", // Email subject
        text: `Your OTP is ${otp}`, // Email body
      });

      return res.status(200).json({ message: "OTP sent to your email." });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Route 2: Signup with OTP verification and optional profile picture
router.post(
  "/signup",
  upload.single("pic"),
  [
    body("name").isString().withMessage("Name is required..!"),
    body("email").isEmail().withMessage("Invalid Email..!"),
    body("otp").isString().withMessage("OTP is required..!"), // Validate OTP
    body("dob").isString().withMessage("Birthdate is required..!"),
    body("gender").isString().withMessage("Gender is required..!"),
    body("country").isString().withMessage("Country is required...!"),
    body("password")
      .isString()
      .isLength({ min: 5, max: 16 })
      .withMessage("Password must be 5-16 characters..!"),
    body("position").isString().withMessage("Position is required..!"),
    body("foot").isString().withMessage("Foot preference is required..!"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, otp, dob, country, password, position, foot, gender } =
      req.body;

    try {
      // Validate OTP
      const otpData = setOtp[email];
      if (!otpData) {
        return res.status(400).json({ message: "OTP not sent or expired" });
      }
      if (otpData.otp !== otp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }
      if (Date.now() > otpData.expiry) {
        return res.status(400).json({ message: "OTP expired" });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10); 
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create and save the user
      const user = new User({
        name,
        email,
        dob,
        gender,
        country,
        password: hashedPassword,
        position,
        foot,
        pic: req.file && req.file.path,
      });
      await user.save();

      // Clear OTP after successful signup
      delete setOtp[email];

      // Generate JWT token
      const token = jwt.sign({ id: user._id }, JWT_SIGN);
      res.status(201).json({ token });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

//Route 3:Sign in
router.post(
  "/signin",
  [
    body("email").isEmail().withMessage("Invalid email..!"),
    body("password").isString().withMessage("Invalid email..!"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      //cheaking email..
      let user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      //cheaking password..
      let confirpassword = await bcrypt.compare(password, user.password);
      if (!confirpassword) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      // Generate JWT token
      const token = jwt.sign({ id: user._id }, JWT_SIGN);
      res.status(201).json({ token });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

//Route 4: Get all user details..
router.get("/getuser", [userauth], async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const user = req.user.id;
    const userdetails = await User.findById(user).select("-password");

    if (!userdetails) {
      return res.status(404).json({ message: "User not found" });
    }

    // Calculate age from dob
    const calculateAge = (dob) => {
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDifference = today.getMonth() - birthDate.getMonth();
      if (
        monthDifference < 0 ||
        (monthDifference === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      return age;
    };

    const age = userdetails.dob ? calculateAge(userdetails.dob) : null;

    const response = {
      name: userdetails.name,
      pic: userdetails.pic
        ? `${baseUrl}/uploads/other/${path.basename(userdetails.pic)}`
        : null,
      email: userdetails.email,
      age: age,
      gender: userdetails.gender,
      country: userdetails.country,
      position: userdetails.position,
      foot: userdetails.foot,
      createdAt: userdetails.createdAt,
      updatedAt: userdetails.updatedAt,
    };

    return res.status(200).json({ response });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

//Route 5:Forgot password..
router.put(
  "/forgotpassword",
  [
    body("email").isEmail().withMessage("Invalid email..!"),
    body("otp").isNumeric().withMessage("Otp is required..!"),
    body("newPassword")
      .isString()
      .isLength({ min: 5, max: 16 })
      .withMessage("Password must be 5-16 characters..!"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp, newPassword } = req.body;

    // OTP Verification
    if (
      !setOtp[email] ||
      setOtp[email].otp !== otp ||
      Date.now() > setOtp[email].expiry
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    delete setOtp[email]; // OTP is used, delete it

    try {
      //hashing new password...
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      //update user password
      const user = await User.findOneAndUpdate(
        { email: email },
        { password: hashedPassword },
        { new: true }
      );
      if (!user) {
        return res.status(400).json({ message: "User not found..!" });
      }

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

//Route 6:Updating user detials.sign in required for user...
router.put("/updateUserDetails", [userauth], async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, pic, dob, gender, country, position, foot } = req.body;

    // Build the update object dynamically
    const updatedFields = {};
    if (name !== undefined) updatedFields.name = name;
    if (pic !== undefined) updatedFields.pic = pic;
    if (dob !== undefined) updatedFields.dob = dob;
    if (gender !== undefined) updatedFields.gender = gender;
    if (country !== undefined) updatedFields.country = country;
    if (position !== undefined) updatedFields.position = position;
    if (foot !== undefined) updatedFields.foot = foot;

    // Check if there are any fields to update
    if (Object.keys(updatedFields).length === 0) {
      return res.status(400).json({ message: "No fields provided to update." });
    }

    // Find user and update details
    const user = await User.findByIdAndUpdate(userId, updatedFields, {
      new: true, // Return the updated document
      runValidators: true, // Apply schema validation
    }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      message: "User details updated successfully.",
      user,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
