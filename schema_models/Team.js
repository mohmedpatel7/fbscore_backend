const mongoose = require("mongoose");

const TeamSchema = new mongoose.Schema(
  {
    teamname: {
      type: String,
      required: true,
      unique: true,
    },
    teamlogo: {
      type: String,
      default: "",
    },
    country: {
      type: String,
      required: true,
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

module.exports = mongoose.model("Team", TeamSchema);
