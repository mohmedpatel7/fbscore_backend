const express = require("express");
const router = express.Router();
const Team = require("../schema_models/Team");
const ReqTeam = require("../schema_models/ReqTeam");
const Player = require("../schema_models/Players");
const PlayerRequest = require("../schema_models/PlayerRequest");
const User = require("../schema_models/User");
const Match = require("../schema_models/Match");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");
const teamauth = require("../middleware/teamauth");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const setOtp = {}; // Temporary storage for OTPs

// Load environment variables from .env file
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN;
const baseUrl = process.env.baseurl;

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
    body("password")
      .isString()
      .isLength({ min: 6, max: 18 })
      .withMessage("Invalid password..!"),
    body("otp").isString().withMessage("Invalid otp..!"),
  ],
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
router.get("/getTeamDetails", [teamauth], async (req, res) => {
  const teamid = req.user.teamId;

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

//Route 4:Searching team and user details.Login required..
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
      "teamname teamlogo country createdBy"
    );

    //finding search result for users..
    const user_result = await User.find(
      { name: { $regex: searchRegex } },
      "name pic country"
    );

    const team_response = {
      teams: teams_result.map((team) => ({
        teamname: team.teamname,
        teamlogo: team.teamlogo
          ? `${baseUrl}/uploads/other/${path.basename(team.teamlogo)}`
          : null,
        country: team.country,
        owner: team.createdBy,
      })),
    };

    const user_response = {
      users: user_result.map((user) => ({
        name: user.name,
        pic: user.pic
          ? `${baseUrl}/uploads/other/${path.basename(user.pic)}`
          : null,
        country: user.country,
      })),
    };

    //return response..
    return res.json({
      success: true,
      team_response,
      user_response,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..." });
  }
});

//Route 5:Sending request to player.Signin required fot team owner.
router.post(
  "/sendPlayerReq/:userId",
  [teamauth],
  [body("playerNo").isNumeric().withMessage("Invalid jersey number!")],
  async (req, res) => {
    try {
      const teamId = req.user.teamId;
      const { userId } = req.params;
      const { playerNo } = req.body;

      // Body validation.
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Finding team in db
      const team = await Team.findById(teamId);
      if (!team) return res.status(404).json({ message: "Team not found!" });

      // Finding user in db
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found!" });

      // Check if the user is already in a team
      const existingPlayer = await Player.findOne({ userId });
      if (existingPlayer) {
        return res.status(400).json({ message: "User is already in a team!" });
      }

      // Cheak if the requests already exist ?
      const existRequest = await PlayerRequest.findOne({ teamId, userId });
      if (existRequest)
        return res.status(400).json({ message: "Request already sent!" });

      // Create a new player request
      const newReq = new PlayerRequest({
        teamId,
        teamname: team.teamname,
        userId,
        email: user.email,
        playerNo,
      });

      // Save the request to the database
      await newReq.save();

      // Sending email to player..
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL,
        to: user.email,
        subject: "Team Invitation",
        text: `You have received an invitation to join ${team.teamname} as a player with jersey number ${playerNo}. Please accept or reject the request.`,
      });

      return res.status(200).json({ newReq });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error!" });
    }
  }
);

//Route 6:Removing single player from team.Login required for team owner.
router.delete("/removePlayer/:playerid", [teamauth], async (req, res) => {
  const { playerid } = req.params;

  try {
    // Find the player and check if they exist
    const player = await Player.findById(playerid).populate("userId");
    if (!player) {
      return res.status(404).json({ message: "Player not found..!" });
    }

    // Find the team and check if it exists
    const team = await Team.findById(player.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found..!" });
    }

    // Ensure the player belongs to this team
    if (!player.teamId || player.teamId.toString() !== team._id.toString()) {
      return res
        .status(403)
        .json({ message: "This player does not belong to your team." });
    }

    // Ensure the requester is the team owner
    if (team._id.toString() !== req.user.teamId.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to remove this player." });
    }

    // Remove player
    await Player.findByIdAndDelete(playerid);

    // Send email if player has an email
    if (player.userId && player.userId.email) {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL,
        to: player.userId.email,
        subject: "Team Notice",
        text: `You have been released from ${team.teamname} as a player.`,
      });
    }

    return res.status(200).json({ message: "Player removed successfully!" });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..!" });
  }
});

//Route 7:Fetching single player details. Login required for team owner...
router.get("/getPlayerDetails/:Pid", [teamauth], async (req, res) => {
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

//Route 8:Fetching individual match details.Sign in required for user.
router.get("/matchDetails/:matchId", [teamauth], async (req, res) => {
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
          select: "name pic",
        },
      })
      .populate({
        path: "goals.assist",
        populate: {
          path: "userId",
          select: "name pic",
        },
      })
      .populate("goals.team", "teamname teamlogo");

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
      teams: {
        teamA: {
          id: match.teamA._id,
          name: match.teamA.teamname,
          logo: match.teamA.teamlogo
            ? `${baseUrl}/uploads/other/${path.basename(match.teamA.teamlogo)}`
            : null,
          players: teamAPlayers.map((player) => ({
            id: player._id,
            name: player.userId.name,
            pic: player.userId.pic
              ? `${baseUrl}/uploads/other/${path.basename(player.userId.pic)}`
              : null,
            position: player.userId.position,
          })),
        },
        teamB: {
          id: match.teamB._id,
          name: match.teamB.teamname,
          logo: match.teamB.teamlogo
            ? `${baseUrl}/uploads/other/${path.basename(match.teamB.teamlogo)}`
            : null,
          players: teamBPlayers.map((player) => ({
            id: player._id,
            name: player.userId.name,
            pic: player.userId.pic
              ? `${baseUrl}/uploads/other/${path.basename(player.userId.pic)}`
              : null,
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
          logo: goal.team.teamlogo
            ? `${baseUrl}/uploads/other/${path.basename(goal.team.teamlogo)}`
            : null,
        },
        scorer: goal.scorer
          ? {
              id: goal.scorer._id,
              name: goal.scorer.userId.name,
              pic: goal.scorer.userId.pic
                ? `${baseUrl}/uploads/other/${path.basename(
                    goal.scorer.userId.pic
                  )}`
                : null,
            }
          : null,
        assist: goal.assist
          ? {
              id: goal.assist._id,
              name: goal.assist.userId.name,
              pic: goal.assist.userId.pic
                ? `${baseUrl}/uploads/other/${path.basename(
                    goal.assist.userId.pic
                  )}`
                : null,
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

module.exports = router;
