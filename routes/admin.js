const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const Admin = require("../schema_models/Admin");
const Team = require("../schema_models/Team");
const ReqTeam = require("../schema_models/ReqTeam");
const Player = require("../schema_models/Players");
const User = require("../schema_models/User");
const { body, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const multer = require("multer");
const path = require("path");
const adminauth = require("../middleware/adminauth");

// Load environment variables from .env file
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN;
const baseUrl = process.env.baseUrl;

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
        teamId: team._id,
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

//Route 6:Fetching individual team details for admin.
router.get("/getTeamDetails/:teamid", [adminauth], async (req, res) => {
  const { teamid } = req.params;

  try {
    const team = await Team.findById(teamid);
    if (!team) {
      return res.status(404).json({ message: "Team not found..!" });
    }

    const player = await Player.find({ teamId: teamid }).populate("userId");

    return res.status(200).json({
      message: "Team details fetched.",
      team: {
        teamname: team.teamname,
        teamlogo: team.teamlogo
          ? `${baseUrl}/uploads/other/${path.basename(team.teamlogo)}`
          : null,
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
          pic: player.userId.pic
            ? `${baseUrl}/uploads/other/${path.basename(player.userId.pic)}`
            : null,
          email: player.userId.email,
          country: player.userId.country,
          gender: player.userId.gender,
          dob: player.userId.dob,
          position: player.userId.position,
          foot: player.userId.foot,
        },
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Internel server errror...!" });
  }
});

//Route 7:Fetching player single player details. Login required...
router.get("/getPlayerDetails/:Pid", [adminauth], async (req, res) => {
  const { Pid } = req.params;

  try {
    // Fetch the player details and populate associated team and user info
    const player = await Player.findById(Pid)
      .populate("teamId", "teamname teamlogo country")
      .populate("userId", "name pic country gender position foot dob");

    // If player not found, respond with 404
    if (!player) {
      return res.status(404).json({ message: "Player details not found..!" });
    }

    // Respond with player details
    return res.status(200).json({
      message: "Details fetched successfully!",
      player: {
        playerId: player._id,
        playerNo: player.playerNo,
        team: {
          teamId: player.teamId._id,
          teamname: player.teamId.teamname,
          teamlogo: player.teamId.teamlogo
            ? `${baseUrl}/uploads/other/${path.basename(
                player.teamId.teamlogo
              )}`
            : null,
          country: player.teamId.country,
        },
        user: {
          userId: player.userId._id,
          name: player.userId.name,
          pic: player.userId.pic
            ? `${baseUrl}/uploads/other/${path.basename(player.userId.pic)}`
            : null,
          country: player.userId.country,
          gender: player.userId.gender,
          position: player.userId.position,
          foot: player.userId.foot,
          dob: player.userId.dob,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..!" });
  }
});

//router 8:Fetching all users which are not in any team.
router.get("/usersWithoutTeam", [adminauth], async (req, res) => {
  try {
    // Get all user IDs that are already part of a team
    const playerList = await Player.find({}, "userId");
    const playerListIds = playerList.map((player) => player.userId.toString());

    if (playerListIds.length === 0) {
      return res
        .status(200)
        .json({ message: "No users without a team found." });
    }

    // Fetch all users except those in the playerListIds
    const userList = await User.find({ _id: { $nin: playerListIds } }).select(
      "-password"
    );

    const response = {
      users: userList.map((user) => ({
        userId: user._id,
        name: user.name,
        pic: user.pic
          ? `${baseUrl}/uploads/other/${path.basename(user.pic)}`
          : null,
        email: user.email,
        country: user.country,
        gender: user.gender,
        dob: user.dob,
        position: user.position,
        foot: user.foot,
      })),
    };

    return res.status(200).json({ response });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error!" });
  }
});

module.exports = router;
