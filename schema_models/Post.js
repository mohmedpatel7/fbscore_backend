const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  comment: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const PostSchema = new mongoose.Schema({
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "uploaderType", // Dynamic reference based on uploaderType
    required: true,
  },
  uploaderType: {
    type: String,
    required: true,
    enum: ["User", "Team"], // Can only be either User or Team
    default: "User",
  },
  image: {
    type: String,
  },
  description: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Array to track user IDs who liked the post
    },
  ],
  comments: [commentSchema], // Embedded schema for comments
});

module.exports = mongoose.model("Post", PostSchema);
