const express = require("express");
const router = express.Router();
const Team = require("../schema_models/Team");
const Player = require("../schema_models/Players");
const User = require("../schema_models/User");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const path = require("path");
const userauth = require("../middleware/userauth");

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

//Route 1:Creating team using /api/team/createTeam. Login required for user..
router.post(
  "/createTeam",
  upload.single("teamlogo"),
  [
    body("teamname").isString().withMessage("Invalid team name..!"),
    body("country").isString().withMessage("Invalid country..!"),
  ],
  [userauth],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { teamname, country, teamlogo } = req.body;

      const team = await Team.findOne({ teamname });
      if (team)
        return res.status(400).json({ message: "Team already exist..!" });

      const teamcreate = new Team({
        teamname,
        teamlogo: req.file ? req.file.path : defaultProfilePath,
        country,
        createdBy: req.user.id,
      });
      const saved = await teamcreate.save();
      return res
        .status(200)
        .json({ message: "Team created successfully..!", saved: saved });
    } catch (error) {
      return res.status(500).json({ message: "Internel server errror...!" });
    }
  }
);

//Route 2:Fetching all details for individuals team..Login required..
router.get("/getTeamDetails/:teamid", [userauth], async (req, res) => {
  const { teamid } = req.params;

  try {
    const team = await Team.findById(teamid).populate(
      "createdBy",
      "name email"
    );
    if (!team) {
      return res.status(404).json({ message: "Team not found..!" });
    }

    const player = await Player.find({ teamId: teamid }).populate(
      "userId",
      "name pic email"
    );

    return res.status(200).json({
      message: "Team details fetched.",
      team: {
        teamname: team.teamname,
        teamlogo: team.teamlogo,
        country: team.country,
        createdBy: team.createdBy.name,
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
});

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

    //retunr response..
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
