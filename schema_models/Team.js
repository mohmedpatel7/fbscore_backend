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
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Team", TeamSchema);
