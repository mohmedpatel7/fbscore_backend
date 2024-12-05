const mongoose = require("mongoose");

const Match = new mongoose.Schema(
  {
    teamA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    teamB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    score: {
      teamA: { type: Number, default: 0 },
      teamB: { type: Number, default: 0 },
    },
    goals: [
      {
        scorer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Player",
          required: true,
        },
        assist: { type: mongoose.Schema.Types.ObjectId, ref: "Player" },
        team: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Team",
          required: true,
        },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    match_date: {
      type: String, // Example: "2024-11-26"
      required: true,
    },
    match_time: {
      type: String, // Example: "15:30" (24-hour format) or "03:30 PM"
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["Upcoming", "Live", "Half Time", "Full Time", "Delayed"], // Predefined statuses
      default: "Upcoming", // Default value
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Match", Match);
