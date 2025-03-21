const express = require("express");
const router = express.Router();
const User = require("../schema_models/User");
const Team = require("../schema_models/Team");
const Player = require("../schema_models/Players");
const Match = require("../schema_models/Match");
const PlayerStats = require("../schema_models/Stats");
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

const storage = multer.memoryStorage(); // Store file in memory
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB file size limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);

    if (mimetype && extname) return cb(null, true);
    cb(new Error("Error: Images Only!"));
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
        subject: "OTP for User Signup", // Email subject
        text: `Dear User,Your OTP for signup verification is:${otp}This OTP is valid for 2 minutes. Do not share it with anyone.`, // Email body
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
    body("otp").isString().withMessage("OTP is required..!"),
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

      // Convert image to Base64 (With MIME type)
      let profilePic = null;
      if (req.file) {
        profilePic = `data:${
          req.file.mimetype
        };base64,${req.file.buffer.toString("base64")}`;
      }

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
        pic: profilePic, // Save Base64 image with MIME type
      });
      await user.save();

      // Clear OTP after successful signup
      delete setOtp[email];

      // Generate JWT token
      const usertoken = jwt.sign({ id: user._id }, JWT_SIGN);
      res.status(201).json({ usertoken });
    } catch (error) {
      console.error(error);
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

      // Check if user is active
      if (!user.active) {
        return res
          .status(403)
          .json({ message: "Your account is deactivated. Contact support." });
      }

      //cheaking password..
      let confirpassword = await bcrypt.compare(password, user.password);
      if (!confirpassword) {
        return res.status(400).json({ message: "Invalid email or password" });
      }

      // Generate JWT token
      const usertoken = jwt.sign({ id: user._id }, JWT_SIGN);
      res.status(201).json({ usertoken });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Route 4: Get all user details including teammates
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

    const isPlayer = await Player.findOne({ userId: user }).populate("teamId");
    const allPlayerStats = await PlayerStats.find({ user_id: user });
    const totalGoals = allPlayerStats.reduce(
      (sum, stat) => sum + (stat.totalgoals || 0),
      0
    );
    const totalAssists = allPlayerStats.reduce(
      (sum, stat) => sum + (stat.totalassists || 0),
      0
    );
    const totalMatches = await Match.countDocuments({
      $and: [
        {
          $or: [
            { teamA: isPlayer?.teamId?._id },
            { teamB: isPlayer?.teamId?._id },
          ],
        },
        { status: "Full Time" },
      ],
    });

    const currentPlayerStats = await PlayerStats.findOne({
      player_id: isPlayer?._id,
    });
    let teammates = [];
    if (isPlayer?.teamId) {
      teammates = await Player.find({
        teamId: isPlayer.teamId._id,
        userId: { $ne: user },
      })
        .populate("userId", "name pic email gender country position foot")
        .select("playerNo");
    }

    const fullTimeMatches = await Match.find({
      $or: [{ teamA: isPlayer?.teamId?._id }, { teamB: isPlayer?.teamId?._id }],
      status: "Full Time",
    })
      .populate("teamA teamB", "teamname teamlogo")
      .sort({ match_date: 1 })
      .limit(7);

    const otherMatches = await Match.find({
      $or: [{ teamA: isPlayer?.teamId?._id }, { teamB: isPlayer?.teamId?._id }],
      status: { $ne: "Full Time" },
    })
      .populate("teamA teamB", "teamname teamlogo")
      .sort({ match_date: 1 })
      .limit(10);

    const teamMatches = [...fullTimeMatches, ...otherMatches];

    const response = {
      id: userdetails._id,
      name: userdetails.name,
      pic: userdetails?.pic || "", // Base64 image
      email: userdetails.email,
      age: calculateAge(userdetails.dob),
      dob: userdetails.dob,
      gender: userdetails.gender,
      country: userdetails.country,
      position: userdetails.position,
      foot: userdetails.foot,
      createdAt: userdetails.createdAt,
      updatedAt: userdetails.updatedAt,
      playerDetails: isPlayer
        ? {
            playerId: isPlayer._id,
            teamname: isPlayer.teamId?.teamname || "Unknown Team",
            teamlogo: isPlayer.teamId?.teamlogo || "", // Base64 logo
            jeresyNo: isPlayer.playerNo || "N/A",
            teamcountry: isPlayer.teamId?.country || "N/A",
            teamowner: isPlayer.teamId?.createdBy || "N/A",
            teamemail: isPlayer.teamId?.email || "N/A",
          }
        : null,
      stats: {
        totalgoals: totalGoals,
        totalassists: totalAssists,
        currentgoals: currentPlayerStats ? currentPlayerStats.totalgoals : 0,
        currentassists: currentPlayerStats
          ? currentPlayerStats.totalassists
          : 0,
        totalmatches: totalMatches || 0,
      },
      teammates: teammates.map((player) => ({
        playerId: player._id || "N/A",
        userId: player.userId._id || "N/A",
        name: player.userId.name || "N/A",
        pic: player.userId.pic || "", // Base64 image
        email: player.userId.email || "N/A",
        gender: player.userId.gender || "N/A",
        country: player.userId.country || "N/A",
        position: player.userId.position || "N/A",
        foot: player.userId.foot || "N/A",
        jeresyNo: player.playerNo || "N/A",
      })),
      matches: teamMatches.map((match) => ({
        matchId: match._id,
        teamA: match.teamA
          ? {
              id: match.teamA._id,
              teamname: match.teamA.teamname,
              teamlogo: match.teamA.teamlogo || "", // Base64 logo
            }
          : null,
        teamB: match.teamB
          ? {
              id: match.teamB._id,
              teamname: match.teamB.teamname,
              teamlogo: match.teamB.teamlogo || "", // Base64 logo
            }
          : null,
        score: match.score || { teamA: 0, teamB: 0 },
        date: match.match_date,
        time: match.match_time,
        status: match.status,
      })),
    };

    return res.status(200).json({ response });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
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

      return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
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

//Route 7:Fetching all details for individuals team..Login required for user..
router.get("/getTeamDetails/:teamid", [userauth], async (req, res) => {
  const { teamid } = req.params;

  try {
    const team = await Team.findById(teamid);
    if (!team) {
      return res.status(404).json({ message: "Team not found..!" });
    }

    const player = await Player.find({ teamId: teamid }).populate("userId");

    // Fetch matches where the team has played (either as teamA or teamB)
    const matches = await Match.find({
      $or: [{ teamA: teamid }, { teamB: teamid }],
    });

    // Total matches played
    const totalMatches = matches.length;

    // Count wins based on score comparison
    const wins = matches.filter((match) => {
      if (match.teamA.toString() === teamid.toString()) {
        return match.score.teamA > match.score.teamB; // Team A won
      } else if (match.teamB.toString() === teamid.toString()) {
        return match.score.teamB > match.score.teamA; // Team B won
      }
      return false;
    }).length;

    return res.status(200).json({
      message: "Team details fetched.",
      team: {
        teamname: team.teamname,
        teamlogo: team.teamlogo,
        country: team.country,
        createdBy: team.createdBy,
        email: team.email,
        totalMatches,
        wins,
      },
      players: player.map((player) => ({
        playerId: player._id,
        playerNo: player.playerNo,

        users: {
          userId: player.userId._id,
          name: player.userId.name,
          pic: player.userId.pic,
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

//Route 8:Fetching individual match details.Sign in required for user.
router.get("/matchDetails/:matchId", [userauth], async (req, res) => {
  try {
    const { matchId } = req.params;

    const match = await Match.findById(matchId)
      .populate("teamA", "teamname teamlogo")
      .populate("teamB", "teamname teamlogo")
      .populate("createdBy", "name")
      .populate({
        path: "goals.scorer",
        populate: {
          path: "userId",
          select: "name pic position",
        },
      })
      .populate({
        path: "goals.assist",
        populate: {
          path: "userId",
          select: "name pic position",
        },
      })
      .populate("goals.team", "teamname teamlogo")
      .populate({
        path: "mvp",
        populate: { path: "userId", select: "name pic position" },
      });

    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    const teamAPlayers = await Player.find({
      teamId: match.teamA._id,
    }).populate("userId", "name pic position");

    const teamBPlayers = await Player.find({
      teamId: match.teamB._id,
    }).populate("userId", "name pic position");

    // Restructure the response
    const response = {
      matchId: match._id,
      matchDate: match.match_date,
      matchTime: match.match_time,
      status: match.status,
      createdBy: match.createdBy.name,
      mvp: match.mvp
        ? {
            id: match.mvp._id,
            name: match.mvp.userId?.name || "Unknown",
            pic: match.mvp.userId?.pic,
            position: match.mvp.userId?.position || "Unknown",
            teamName: match.mvp.teamId
              ? match.teamA._id.equals(match.mvp.teamId)
                ? match.teamA.teamname
                : match.teamB.teamname
              : "Unknown",
          }
        : null,

      teams: {
        teamA: {
          id: match.teamA._id,
          name: match.teamA.teamname,
          logo: match.teamA.teamlogo,
          players: teamAPlayers.map((player) => ({
            id: player._id,
            jeresyNo: player.playerNo,
            name: player.userId.name,
            pic: player.userId.pic,
            position: player.userId.position,
          })),
        },
        teamB: {
          id: match.teamB._id,
          name: match.teamB.teamname,
          logo: match.teamB.teamlogo,
          players: teamBPlayers.map((player) => ({
            jeresyNo: player.playerNo,
            id: player._id,
            name: player.userId.name,
            pic: player.userId.pic,
            position: player.userId.position,
          })),
        },
      },
      score: {
        teamA: match.score.teamA,
        teamB: match.score.teamB,
      },
      goals: match.goals.map((goal) => ({
        id: goal._id,
        timestamp: goal.timestamp,
        team: {
          id: goal.team._id,
          name: goal.team.teamname,
          logo: goal.team.teamlogo,
        },
        scorer: goal.scorer
          ? {
              id: goal.scorer._id,
              name: goal.scorer.userId.name,
              pic: goal.scorer.userId.pic,
              position: goal.scorer?.userId?.position,
            }
          : null,
        assist: goal.assist
          ? {
              id: goal.assist._id,
              name: goal.assist.userId.name,
              pic: goal.assist.userId.pic,
              position: goal.assist?.userId?.position,
            }
          : null,
      })),
    };

    return res
      .status(200)
      .json({ message: "Data fetched successfully", data: response });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error", error });
  }
});

// Route 9: Fetching other team details.
router.get("/getTeamDetails/:teamid", [userauth], async (req, res) => {
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
        teamlogo: team.teamlogo,
        country: team.country,
        createdBy: team.createdBy,
        email: team.email,
        createdAt: team.createdAt,
      },
      players: player.map((player) => ({
        playerId: player._id,
        playerNo: player.playerNo,

        users: {
          userId: player.userId._id,
          name: player.userId.name,
          pic: player.userId.pic,
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

// Route 10:Get other player profile.
router.get("/getPlayerDetails/:Pid", [userauth], async (req, res) => {
  const { Pid } = req.params;

  try {
    // Fetch the player details and get userId
    const player = await Player.findById(Pid)
      .populate("teamId", "teamname teamlogo country email createdBy")
      .populate("userId", "name pic country gender position foot dob email");

    if (!player) {
      return res.status(404).json({ message: "Player details not found..!" });
    }

    const userId = player.userId._id;

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

    // Fetch all player stats for the user across all teams
    const allPlayerStats = await PlayerStats.find({ user_id: userId });

    // Calculate total goals and assists across all teams
    const totalGoals = allPlayerStats.reduce(
      (sum, stat) => sum + (stat.totalgoals || 0),
      0
    );
    const totalAssists = allPlayerStats.reduce(
      (sum, stat) => sum + (stat.totalassists || 0),
      0
    );

    // Fetch total matches played for **current** team only
    const totalMatches = await Match.countDocuments({
      $and: [
        { $or: [{ teamA: player.teamId._id }, { teamB: player.teamId._id }] },
        { status: "Full Time" },
      ],
    });

    // Fetch stats for only the current player (NOT all teams)
    const currentPlayerStats = await PlayerStats.findOne({
      player_id: player._id,
    });

    return res.status(200).json({
      message: "Details fetched successfully!",
      player: {
        playerId: player._id,
        playerNo: player.playerNo,
        team: {
          teamId: player.teamId._id,
          teamname: player.teamId.teamname,
          teamemail: player.teamId.email,
          teamlogo: player.teamId.teamlogo,
          country: player.teamId.country,
          owner: player.teamId.createdBy,
        },
        user: {
          userId: player.userId._id,
          name: player.userId.name,
          pic: player.userId.pic,
          country: player.userId.country,
          gender: player.userId.gender,
          position: player.userId.position,
          foot: player.userId.foot,
          email: player.userId.email,
          dob: player.userId.dob,
          age: calculateAge(player.userId.dob),
        },
        stats: {
          totalgoals: totalGoals, // Total from ALL teams
          totalassits: totalAssists, // Total from ALL teams
          currentgoals: currentPlayerStats ? currentPlayerStats.totalgoals : 0, // Current team's goals
          currentassists: currentPlayerStats
            ? currentPlayerStats.totalassists
            : 0, // Current team's assists
          totalmatches: totalMatches || 0, // Only for the current team
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..!" });
  }
});

// Route 11:get player details using userid.
router.get("/getPlayerDetailsByUserId/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch the user details
    const user = await User.findById(
      userId,
      "name pic country gender position foot dob email"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found..!" });
    }

    // Calculate age from dob
    const calculateAge = (dob) => {
      if (!dob) return null;
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

    // Prepare user data
    const userData = {
      userId: user._id,
      name: user.name,
      pic: user.pic,
      country: user.country,
      gender: user.gender,
      position: user.position,
      foot: user.foot,
      email: user.email,
      dob: user.dob,
      age: calculateAge(user.dob),
    };

    // Fetch the player details using userId
    const player = await Player.findOne({ userId: userId }).populate(
      "teamId",
      "teamname teamlogo country email createdBy"
    );

    // If no player is found, return only user data
    if (!player) {
      return res.status(200).json({
        message: "User is not a player.",
        player: null,
        user: userData,
      });
    }

    // Fetch all player stats for the user across all teams
    const allPlayerStats = await PlayerStats.find({ user_id: userId });

    // Calculate total goals and assists across all teams
    const totalGoals = allPlayerStats.reduce(
      (sum, stat) => sum + (stat.totalgoals || 0),
      0
    );
    const totalAssists = allPlayerStats.reduce(
      (sum, stat) => sum + (stat.totalassists || 0),
      0
    );

    // Fetch total matches played for **current** team only
    const totalMatches = await Match.countDocuments({
      $and: [
        { $or: [{ teamA: player.teamId._id }, { teamB: player.teamId._id }] },
        { status: "Full Time" },
      ],
    });

    // Fetch stats for only the current player (NOT all teams)
    const currentPlayerStats = await PlayerStats.findOne({
      player_id: player._id,
    });

    return res.status(200).json({
      message: "Details fetched successfully!",
      player: {
        playerId: player._id,
        playerNo: player.playerNo,
        team: {
          teamId: player.teamId._id,
          teamname: player.teamId.teamname,
          teamemail: player.teamId.email,
          teamlogo: player.teamId.teamlogo,
          country: player.teamId.country,
          owner: player.teamId.createdBy,
        },
        user: userData,
        stats: {
          totalgoals: totalGoals, // Total from ALL teams
          totalassits: totalAssists, // Total from ALL teams
          currentgoals: currentPlayerStats ? currentPlayerStats.totalgoals : 0, // Current team's goals
          currentassists: currentPlayerStats
            ? currentPlayerStats.totalassists
            : 0, // Current team's assists
          totalmatches: totalMatches || 0, // Only for the current team
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..!" });
  }
});

module.exports = router;
