const mongoose = require("mongoose");

const PlayerStats = new mongoose.Schema(
  {
    // Player identification...
    player_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    user_id: {
      // New field to reference the User
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Particular match details...
    matches: [
      {
        match_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Match",
          required: true,
        },
        goals: {
          type: Number,
          default: 0,
        },
        assists: {
          type: Number,
          default: 0,
        },
      },
    ],
    // General stats
    totalgoals: {
      type: Number,
      default: 0,
    },
    totalassists: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PlayerStats", PlayerStats);
