const express = require("express");
const router = express.Router();
const ReqTeam = require("../schema_models/ReqTeam");
const Team = require("../schema_models/Team");
const Player = require("../schema_models/Players");
const User = require("../schema_models/User");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");
const userauth = require("../middleware/userauth");
const teamauth = require("../middleware/teamauth");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const setOtp = {}; // Temporary storage for OTPs

// Load environment variables from .env file
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN;

// Define path to default profile picture
const defaultProfilePath = path.join(__dirname, "../other/defaultprofile.jpg");

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

// Route: Send OTP To Team Owner
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
        subject: "OTP for User Signup", // Email subject
        text: `Dear User,Your OTP for team regestration is:${otp}This OTP is valid for 2 minutes. Do not share it with anyone.`, // Email body
      });

      return res.status(200).json({ message: "OTP sent to your email." });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

//Route 1:Creating team using /api/team/createTeam.
router.post(
  "/createTeam",
  upload.single("teamlogo"),
  [
    body("teamname").isString().withMessage("Invalid team name..!"),
    body("country").isString().withMessage("Invalid country..!"),
    body("createdBy").isString().withMessage("Invalid createdBy..!"),
    body("email").isEmail().withMessage("Invalid email..!"),
    body("password").isString().withMessage("Invalid password..!"),
    body("otp").isString().withMessage("Invalid otp..!"),
  ],
  [userauth],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { teamname, country, email, password, createdBy, otp } = req.body;

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

      const team = await Team.findOne({ teamname });
      if (team)
        return res.status(400).json({ message: "Team already exist..!" });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const teamcreate = new ReqTeam({
        teamname,
        teamlogo: req.file ? req.file.path : defaultProfilePath,
        country,
        createdBy,
        email,
        password: hashedPassword,
      });
      const saved = await teamcreate.save();
      return res
        .status(200)
        .json({ message: "Team request sent successfully..!", Data: saved });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Internel server errror...!" });
    }
  }
);

//Route 2:Team sign in after registration.
router.post(
  "/teamSignin",
  [
    body("email").isEmail().withMessage("Invalid email or password.!"),
    body("password").isString().withMessage("Invalid email or password.!"),
  ],
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const teamOwner = await Team.findOne({ email });
      if (!teamOwner)
        return res.status(404).json({ message: "Invalid email or password.!" });

      const isPasswordValid = await bcrypt.compare(
        password,
        teamOwner.password
      );
      if (!isPasswordValid)
        return res.status(404).json({ message: "Invalid email or password.!" });

      const payload = {
        teamOwner: {
          id: teamOwner.id,
        },
      };

      const teamtoken = jwt.sign(payload, JWT_SIGN);
      return res.status(200).json({ teamtoken });
    } catch (error) {
      return res.status(500).json({ message: "Internel server errror...!" });
    }
  }
);

//Route 3:Fetching all details for individuals team..Login required..
router.get(
  "/getTeamDetails/:teamid",
  [userauth, teamauth],
  async (req, res) => {
    const { teamid } = req.params;

    try {
      const team = await Team.findById(teamid);
      if (!team) {
        return res.status(404).json({ message: "Team not found..!" });
      }

      const player = await Player.find({ teamId: teamid });

      return res.status(200).json({
        message: "Team details fetched.",
        team: {
          teamname: team.teamname,
          teamlogo: team.teamlogo,
          country: team.country,
          createdBy: team.createdBy,
          email: team.email,
        },
        players: player.map((player) => ({
          playerId: player._id,
          playerNo: player.playerNo,

          users: {
            userId: player.userId._id,
            name: player.userId.name,
            pic: player.userId.pic,
            email: player.userId.email,
          },
        })),
      });
    } catch (error) {
      return res.status(500).json({ message: "Internel server errror...!" });
    }
  }
);

//Route 3:Searching team and user details.Login required..
router.get("/search", async (req, res) => {
  const { searchquery } = req.query; // Get the search term from query params
  try {
    if (!searchquery)
      return res.status(400).json({ message: "Search term is required..!" });

    // Regex for case-insensitive partial match
    const searchRegex = new RegExp(searchquery, "i");

    //finding search result for teams..
    const teams_result = await Team.find(
      { teamname: { $regex: searchRegex } },
      "teamname teamlogo country"
    );

    //finding search result for users..
    const user_result = await User.find(
      { name: { $regex: searchRegex } },
      "name pic country"
    );

    //return response..
    return res.json({
      success: true,
      teams_result,
      user_result,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..." });
  }
});

module.exports = router;
