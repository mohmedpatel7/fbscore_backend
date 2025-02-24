const mongoose = require("mongoose");

const PlayerRequestSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    teamname: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    playerNo: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PlayerRequest", PlayerRequestSchema);
