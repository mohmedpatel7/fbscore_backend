const express = require("express");
const router = express.Router();
const Team = require("../schema_models/Team");
const Player = require("../schema_models/Players");
const Match = require("../schema_models/Match");
const PlayerStats = require("../schema_models/Stats");
const MatchOfficial = require("../schema_models/MatchOfficial");
const ReqMatchOfficial = require("../schema_models/ReqMatchOfficial");
const { body, validationResult } = require("express-validator");
const matchofficialauth = require("../middleware/matchofficialauth");
const userauth = require("../middleware/userauth");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const setOtp = {}; // Temporary storage for OTPs

// Load environment variables from .env file
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN;
const baseUrl = process.env.baseurl;

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
        text: `Dear User,Your OTP for match official regestration is:${otp}This OTP is valid for 2 minutes. Do not share it with anyone.`, // Email body
      });

      return res.status(200).json({ message: "OTP sent to your email." });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Route 1:Match official acount requist to admin.
router.post(
  "/matchOfficialSignup",
  [
    body("name").isString().withMessage("Name must be string!"),
    body("email").isEmail().withMessage("Invlaid email!"),
    body("password")
      .isString()
      .isLength({ min: 6, max: 18 })
      .withMessage("Invalid password..!"),
    body("otp").isString().withMessage("Invalid otp..!"),
  ],
  async (req, res) => {
    try {
      const { name, email, password, otp } = req.body;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

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

      const isMatchOfficial = await MatchOfficial.findOne({ email });
      if (isMatchOfficial)
        return res
          .status(400)
          .json({ message: "Match official already exist!" });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newMatchOfficial = new ReqMatchOfficial({
        name,
        email,
        password: hashedPassword,
      });

      await newMatchOfficial.save();
      return res.status(200).json({
        messgae: "Match official requist has been sent to admin.",
        newMatchOfficial,
      });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  }
);

// Route 2:Match official sign in after acount creation.
router.post(
  "/matchOfficialSignin",
  [
    body("email").isEmail().withMessage("Invalid email or password!"),
    body("password").isString().withMessage("Invalid email or password!"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      //Verifying email.
      const isUser = await MatchOfficial.findOne({ email });
      if (!isUser)
        return res.status(404).json({ message: "Invalid email or password!" });

      //verifying password.
      const isPasswordValid = await bcrypt.compare(password, isUser.password);
      if (!isPasswordValid)
        return res.status(404).json({ message: "Invalid email or password!" });

      const payload = {
        isUser: {
          id: isUser.id,
        },
      };

      const matchOfficialtoken = jwt.sign(payload, JWT_SIGN);

      return res.status(200).json({ matchOfficialtoken });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error", error });
    }
  }
);

// Route 3:Fetching match offcial details.signin reuired.
router.get("/getMatchOfficial", [matchofficialauth], async (req, res) => {
  try {
    const id = req.user.id;

    const matchofficial = await MatchOfficial.findOne({ id });
    if (!matchofficial)
      return res.status(404).json({ message: "No data found!" });

    const response = {
      name: matchofficial.name,
      email: matchofficial.email,
    };

    return res.status(200).json({ response });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
});

// Route 4: Create match (sign-in required for match official)
router.post("/createMatch", [matchofficialauth], async (req, res) => {
  try {
    const { teamA, teamB, match_date, match_time } = req.body;
    const createdBy = req.user.id; // Assign match official's ID

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    // Validate `match_date`
    const parsedDate = new Date(match_date);
    if (isNaN(parsedDate)) {
      return res
        .status(400)
        .json({ message: "Invalid match_date format! Use YYYY-MM-DD." });
    }

    // Validate `match_time`
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:mm (24-hour format)
    if (!timePattern.test(match_time)) {
      return res.status(400).json({
        message: "Invalid match_time format! Use HH:mm in 24-hour format.",
      });
    }

    // Combine `match_date` and `match_time` into a single Date object
    const [hours, minutes] = match_time.split(":").map(Number);
    parsedDate.setHours(hours, minutes, 0, 0);

    // Check if the match date and time are in the past
    const now = new Date();
    if (parsedDate < now) {
      return res
        .status(400)
        .json({ message: "Match date and time cannot be in the past!" });
    }

    // Validate if `teamA` exists
    const teamAExists = await Team.findById(teamA);
    if (!teamAExists) {
      return res.status(404).json({ message: "TeamA does not exist!" });
    }

    // Validate if `teamB` exists
    const teamBExists = await Team.findById(teamB);
    if (!teamBExists) {
      return res.status(404).json({ message: "TeamB does not exist!" });
    }

    // Create the new match
    const newMatch = new Match({
      teamA,
      teamB,
      createdBy,
      match_date,
      match_time,
    });

    await newMatch.save();

    // Fetch players for both teams
    const teamAPlayers = await Player.find({ teamId: teamA });
    const teamBPlayers = await Player.find({ teamId: teamB });

    const allPlayers = [...teamAPlayers, ...teamBPlayers];

    // Initialize PlayerStats for all players
    await Promise.all(
      allPlayers.map((player) =>
        PlayerStats.findOneAndUpdate(
          { player_id: player._id },
          {
            $push: {
              matches: {
                match_Id: newMatch._id,
                goals: 0,
                assists: 0,
              },
            },
          },
          { new: true, upsert: true }
        )
      )
    );

    return res.status(201).json({ success: true, match: newMatch });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error", error });
  }
});

// Route 5: Updating match status. Sign-in required for match creator
router.put("/updateStatus/:matchId", [matchofficialauth], async (req, res) => {
  try {
    const { matchId } = req.params;
    const { status } = req.body;
    const allowStatus = [
      "Upcoming",
      "Live",
      "Half Time",
      "Full Time",
      "Delayed",
    ];

    // Validate input
    if (!status || !allowStatus.includes(status)) {
      return res.status(400).json({ message: "Invalid status provided!" });
    }

    // Fetch match
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match not found!" });
    }

    // Validate match update by only creator
    if (match.createdBy?.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You are not authorized to update this match status",
      });
    }

    // Auto-set status to "Delayed" if match date/time has passed and status is still "Upcoming"
    const currentTime = new Date();
    if (
      match.status === "Upcoming" &&
      new Date(`${match.match_date}T${match.match_time}`) < currentTime
    ) {
      match.status = "Delayed";
      await match.save();
      return res
        .status(201)
        .json({ message: "Match status set to delayed automatically!", match });
    }

    // Update status manually
    match.status = status;
    await match.save();
    return res
      .status(201)
      .json({ message: "Match status updated successfully!", match });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Route 6: Search match between two teams. Sign-in required for everyone
router.get("/searchMatch", [matchofficialauth], async (req, res) => {
  try {
    const { teamname } = req.query;

    // Validate the query parameter
    if (!teamname) {
      return res.status(400).json({ message: "Team name is required!" });
    }

    // Find teams that match the name using regex (case-insensitive)
    const teams = await Team.find({
      teamname: { $regex: teamname, $options: "i" }, // "i" makes the search case-insensitive
    });

    if (!teams || teams.length === 0) {
      return res
        .status(404)
        .json({ message: `No teams found matching '${teamname}'!` });
    }

    // Extract all matching team IDs
    const teamIds = teams.map((team) => team._id);

    // Find matches involving any of the matching teams
    const matches = await Match.find({
      $or: [{ teamA: { $in: teamIds } }, { teamB: { $in: teamIds } }],
    })
      .populate("teamA", "teamname teamlogo")
      .populate("teamB", "teamname teamlogo");

    // Handle no matches found
    if (!matches || matches.length === 0) {
      return res
        .status(404)
        .json({ message: `No matches found for '${teamname}'!` });
    }

    // Return the matches
    return res.status(200).json({ success: true, matches });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error", error });
  }
});

//Route 7:Updating match and player stats.Sign in required for match creator.
router.put("/updateMatchStats", [matchofficialauth], async (req, res) => {
  try {
    const { matchId, scorerId, assistId, teamId } = req.body;

    // Validate required fields
    if (!matchId || !scorerId || !teamId) {
      return res.status(400).json({
        message: "Match ID, scorer ID, and team ID are required!",
      });
    }

    // Fetch the match to verify its existence
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ message: "Match not found!" });
    }

    // Validate match update by only the creator
    if (match.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        message: "You are not authorized to update this match status.",
      });
    }

    if (match.status !== "Live") {
      return res.status(403).json({ message: "Match status must be 'Live'!" });
    }

    // Verify that the teamId belongs to one of the teams in the match
    if (!match.teamA.equals(teamId) && !match.teamB.equals(teamId)) {
      return res
        .status(400)
        .json({ message: "The team is not part of this match!" });
    }

    // Fetch players from the Player collection for both teams
    const teamAPlayers = await Player.find({ teamId: match.teamA }).select(
      "_id"
    );
    const teamBPlayers = await Player.find({ teamId: match.teamB }).select(
      "_id"
    );

    // Combine players from both teams
    const allPlayers = [
      ...teamAPlayers.map((player) => player._id.toString()),
      ...teamBPlayers.map((player) => player._id.toString()),
    ];

    // Validate scorerId and assistId
    if (!allPlayers.includes(scorerId)) {
      return res
        .status(400)
        .json({ message: "Scorer must be part of one of the teams!" });
    }

    if (assistId && !allPlayers.includes(assistId)) {
      return res
        .status(400)
        .json({ message: "Assister must be part of one of the teams!" });
    }

    // Determine which team's score to update
    const scoreField = match.teamA.equals(teamId)
      ? "score.teamA"
      : "score.teamB";

    // Update the team score in the Match collection
    await Match.findByIdAndUpdate(
      matchId,
      {
        $inc: { [scoreField]: 1 }, // Increment the score of the appropriate team
        $push: {
          goals: {
            scorer: scorerId, // Add goal info
            assist: assistId || null, // Add assist info if provided
            team: teamId,
            timestamp: new Date(), // Record the time of the goal
          },
        },
      },
      { new: true }
    );

    // Update scorer's stats in PlayerStats collection
    await PlayerStats.findOneAndUpdate(
      { player_id: scorerId }, // Find the PlayerStats document for the scorer
      {
        $inc: {
          totalgoals: 1, // Increment total goals for the scorer
        },
        $push: {
          matches: {
            match_id: matchId,
            goals: 1, // Initialize goals in this match if it doesn't exist
            assists: 0, // Initialize assists to 0 if no assists yet
          },
        },
      },
      {
        upsert: true, // Create a PlayerStats record if it doesn't exist
        new: true,
      }
    );

    // Update assist stats if an assist ID is provided
    if (assistId) {
      await PlayerStats.findOneAndUpdate(
        { player_id: assistId }, // Find the PlayerStats document for the assist
        {
          $inc: {
            totalassists: 1, // Increment total assists for the assister
          },
          $push: {
            matches: {
              match_id: matchId,
              goals: 0, // Initialize goals to 0 if no goals yet
              assists: 1, // Initialize assists to 1 in this match if it doesn't exist
            },
          },
        },
        {
          upsert: true, // Create a PlayerStats record if it doesn't exist
          new: true,
        }
      );
    }

    return res
      .status(200)
      .json({ message: "Stats and match updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error", error });
  }
});

//Route 5:Fetching individual match details.Sign in required for user.
router.get("/matchDetails/:matchId", [matchofficialauth], async (req, res) => {
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

//Route 6:Fetching all matches.Sign in not required.
router.get("/matches", async (req, res) => {
  try {
    const matches = await Match.find()
      .populate("teamA", "teamname teamlogo")
      .populate("teamB", "teamname teamlogo");

    if (matches.length === 0) {
      return res.status(404).json({ message: "No matches found" });
    }

    const response = {
      matches: matches.map((match) => ({
        matchId: match._id,
        teamA: {
          id: match.teamA._id,
          name: match.teamA.teamname,
          logo: match.teamA.teamlogo
            ? `${baseUrl}/uploads/other/${path.basename(match.teamA.teamlogo)}`
            : null,
        },
        teamB: {
          id: match.teamB._id,
          name: match.teamB.teamname,
          logo: match.teamB.teamlogo
            ? `${baseUrl}/uploads/other/${path.basename(match.teamB.teamlogo)}`
            : null,
        },
        status: match.status,
        score: match.score,
        matchTime: match.match_time,
        matchDate: match.match_date,
      })),
    };

    return res
      .status(200)
      .json({ message: "Matches fetched successfully", data: response });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error", error });
  }
});

module.exports = router;
