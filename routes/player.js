const express = require("express");
const router = express.Router();
const Team = require("../schema_models/Team");
const User = require("../schema_models/User");
const PlayerRequest = require("../schema_models/PlayerRequest");
const Player = require("../schema_models/Players");
const { body, validationResult } = require("express-validator");
const userauth = require("../middleware/userauth");
const teamauth = require("../middleware/teamauth");
const nodemailer = require("nodemailer");
const path = require("path");
const Match = require("../schema_models/Match");

// Load environment variables from .env file
require("dotenv").config();

const baseUrl = process.env.baseurl;

// Route 1: Fetching team requests for sign in user.
router.get("/getTeamReq", userauth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user exists
    const isUser = await User.findById(userId);
    if (!isUser) return res.status(404).json({ message: "User not found!" });

    // Fetch requests
    const requests = await PlayerRequest.find({ userId });

    // If no requests found
    if (requests.length === 0) {
      return res.status(404).json({ message: "No requests found!" });
    }

    const response = {
      requests: requests.map((req) => ({
        reqId: req._id,
        teamname: req.teamname,
        JeresyNo: req.playerNo,
        date: req.createdAt,
      })),
    };

    return res.status(200).json({ response });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error!" });
  }
});

// Route 2: Users action on team requests.Sign in reuired for user.
router.post("/userAction/:reqId", [userauth], async (req, res) => {
  try {
    const { reqId } = req.params;
    const { action } = req.body;

    // Fetch PlayerRequest and populate both team and user data
    const requestExist = await PlayerRequest.findById(reqId)
      .populate("teamId")
      .populate("userId");
    if (!requestExist) {
      return res.status(404).json({ message: "Request not found!" });
    }

    // Authorization check (Ensure only the request owner can act)
    if (requestExist.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "You are not authorized!" });
    }

    const team = requestExist.teamId; // Since populated, it already contains team data
    if (!team) {
      return res.status(404).json({ message: "Team not found!" });
    }

    // Check if the user is already part of another team
    const existingPlayer = await Player.findOne({
      userId: requestExist.userId._id,
    });
    if (existingPlayer) {
      return res.status(400).json({
        message: `You are already part of the team: ${existingPlayer.teamname}.`,
      });
    }

    // Configure nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // Use TLS
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    // Handle accept action
    if (action === "accept") {
      const player = new Player({
        teamId: team._id,
        teamname: team.teamname,
        userId: requestExist.userId._id,
        email: requestExist.email,
        playerNo: requestExist.playerNo,
      });

      await player.save();
      await PlayerRequest.findByIdAndDelete(reqId);

      await transporter.sendMail({
        from: process.env.EMAIL,
        to: team.email,
        subject: "Player Added to Team",
        text: `A new player (Jersey No: ${player.playerNo}) has been added to your team: ${team.teamname}`,
      });

      return res
        .status(200)
        .json({ message: "Player added successfully!", player });
    }

    // Handle reject action
    else if (action === "reject") {
      await PlayerRequest.findByIdAndDelete(reqId);

      await transporter.sendMail({
        from: process.env.EMAIL,
        to: team.email,
        subject: "Player Rejected Team Invitation",
        text: `The player (Jersey No: ${requestExist.playerNo}) has rejected the invitation to join your team: ${team.teamname}.`,
      });

      return res.status(200).json({ message: "Request rejected!" });
    }

    return res.status(400).json({ message: "Invalid action!" });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error!" });
  }
});

//router 3:Fetching all users which are not in any team.Sign in reuired for team owner.
router.get("/usersWithoutTeam", [teamauth], async (req, res) => {
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

//Route 4:Fetching player single player details. Sign in required for user...
router.get("/getPlayerDetails/:Pid", [userauth], async (req, res) => {
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

// Route 5:Fetching signin player matches.
router.get("/signinPlayerMatches", [userauth], async (req, res) => {
  try {
    const userId = req.user.id;

    // Find the player using the user ID
    const player = await Player.findOne({ userId });
    if (!player) {
      return res.status(404).json({ message: "Player not found!" });
    }

    // Find matches where the player's team is either teamA or teamB
    const matches = await Match.find({
      $or: [{ teamA: player.teamId }, { teamB: player.teamId }],
    }).populate("teamA teamB", "teamname teamlogo");

    if (!matches.length) {
      return res
        .status(404)
        .json({ message: "No matches found for your team!" });
    }

    // Formatting the response
    const response = matches.map((match) => ({
      matchId: match._id,
      teamA: {
        id: match.teamA._id,
        name: match.teamA.teamname,
        logo: match.teamA.teamlogo,
      },
      teamB: {
        id: match.teamB._id,
        name: match.teamB.teamname,
        logo: match.teamB.teamlogo,
      },
      score: match.score,
      date: match.match_date,
      time: match.match_time,
      status: match.status,
    }));

    return res.status(200).json({ matches: response });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error", error });
  }
});

module.exports = router;
