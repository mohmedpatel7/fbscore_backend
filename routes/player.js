const express = require("express");
const router = express.Router();
const Team = require("../schema_models/Team");
const User = require("../schema_models/User");
const PlayerRequest = require("../schema_models/PlayerRequest");
const Player = require("../schema_models/Players");
const { body, validationResult } = require("express-validator");
const userauth = require("../middleware/userauth");

// Route 1: Fetching team requests for signed-in user
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

//Route 2:Fetching player single player details. Login required...
router.get("/getPlayerDetails/:Pid", [userauth], async (req, res) => {
  const { Pid } = req.params;

  try {
    // Fetch the player details and populate associated team and user info
    const player = await Player.findById(Pid)
      .populate("teamId", "teamname teamlogo country")
      .populate("userId", "name pic");

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
          teamlogo: player.teamId.teamlogo,
          country: player.teamId.country,
        },
        user: {
          userId: player.userId._id,
          name: player.userId.name,
          pic: player.userId.pic,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..!" });
  }
});

//Route3:Removing single player from team.Login required for team owner.
router.delete("/removePlayer/:playerid", [userauth], async (req, res) => {
  const { playerid } = req.params;
  try {
    // Find the player to be removed and check if it exists
    const player = await Player.findById(playerid);
    if (!player)
      return res.status(404).josn({ message: "Player not found..!" });

    const team = await Team.findById(player.teamId);
    if (!team) return res.status(404).json({ message: "Team not found..!" });

    if (team.createdBy.toString() !== req.user.id)
      return res
        .status(403)
        .json({ message: "You are not authorized to remove this player" });

    await Player.findByIdAndDelete(playerid);
    return res.status(200).json({ message: "Player removed successfully!" });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..!" });
  }
});

module.exports = router;
