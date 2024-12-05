const express = require("express");
const router = express.Router();
const Team = require("../schema_models/Team");
const Player = require("../schema_models/Players");
const { body, validationResult } = require("express-validator");
const userauth = require("../middleware/userauth");

// Route 1: Add a player to a team. Sign-in required.
router.post(
  "/addPlayer",
  [
    userauth,
    body("teamId").isMongoId().withMessage("Team ID is required..!"),
    body("playerId").isMongoId().withMessage("Player ID is required..!"),
    body("playerNo")
      .isString()
      .withMessage("Player jersey number is required..!"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { teamId, playerId, playerNo } = req.body;

    try {
      // Check if the team exists
      const team = await Team.findById(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found..!" });
      }

      // Verify the team owner
      if (team.createdBy.toString() !== req.user.id) {
        return res
          .status(403)
          .json({ message: "Not authorized to add a player..!" });
      }

      // Check if the player already belongs to a team
      const existingPlayer = await Player.findOne({ userId: playerId });
      if (existingPlayer) {
        return res
          .status(400)
          .json({ message: "Player already belongs to a team..!" });
      }

      // Check if the jersey number is unique within the team
      const playernum = await Player.findOne({ teamId, playerNo });
      if (playernum) {
        return res
          .status(400)
          .json({ message: "Player number already exists in the team..!" });
      }

      // Save the player data to the collection
      const playerAdd = new Player({
        teamId: teamId,
        userId: playerId,
        playerNo: playerNo,
      });
      await playerAdd.save();

      return res
        .status(200)
        .json({ message: "Player added successfully..!", player: playerAdd });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error..!" });
    }
  }
);

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
