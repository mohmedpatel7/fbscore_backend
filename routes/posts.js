const express = require("express");
const router = express.Router();
const User = require("../schema_models/User");
const Post = require("../schema_models/Post");
const multer = require("multer");
const path = require("path");
const userauth = require("../middleware/userauth");

// Define path to default profile picture
const defaultProfilePath = path.join(__dirname, "../other/defaultprofile.jpg");

// Configure multer for profile picture upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../post_dir")); // Folder for storing uploaded files
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

//Route 1:Upload post.Sign in required for user..
router.post(
  "/uploadPost",
  [userauth],
  [upload.single("image")],
  async (req, res) => {
    try {
      const { description } = req.body;
      const uploadedBy = req.user.id;

      //Validate description..
      if (!description) {
        return res.status(400).json({ error: "Please enter a description." });
      }

      //Handle file upload..
      let imagePath = null;
      if (req.file) {
        imagePath = req.file.path; // save file path
      }

      const newPost = new Post({
        uploadedBy,
        image: imagePath,
        description,
      });

      await newPost.save();
      res.json({ message: "Post uploaded successfully", newPost });
    } catch (error) {
      return res.status(500).json({ message: "Internel server error..!" });
    }
  }
);

//Route 2:Fetching all post.Sign in not required.
router.get("/post", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("uploadedBy", "name pic")
      .populate("comments.userId", "name pic")
      .sort({ date: -1 });
    if (!posts) {
      return res.status(404).json({ message: "No posts found." });
    }

    const response = {
      posts: posts.map((post) => ({
        id: post._id,
        image: post.image,
        description: post.description,
        uploadedBy_name: post.uploadedBy?.name || "Unknown User",
        uploadedBy_pic: post.uploadedBy?.pic || "",
        likes: post.likes.length,
        comment: post.comments.map((comment) => ({
          id: comment._id,
          user_name: comment.userId?.name || "Unknown User",
          user_pic: comment.userId?.pic || "",
          comments: comment.comment,
          date: comment.date,
        })),
        date: post.date,
      })),
    };

    return res.status(200).json({ response });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..." });
  }
});

//Route 3:Fetching post for sign in user...
router.get("/siginUserPost", [userauth], async (req, res) => {
  try {
    const post_id = req.user.id;
    const posts = await Post.find({ uploadedBy: post_id })
      .populate("uploadedBy", "name pic")
      .populate("comments.userId", "name pic")
      .sort({ date: -1 });

    if (!posts) {
      return res.status(404).json({ message: "No posts found." });
    }

    const response = {
      posts: posts.map((post) => ({
        id: post._id,
        image: post.image,
        description: post.description,
        uploadedBy_name: post.uploadedBy?.name || "Unknown User",
        uploadedBy_pic: post.uploadedBy?.pic || "",
        likes: post.likes.length,
        comment: post.comments.map((comment) => ({
          id: comment._id,
          user_name: comment.userId?.name || "Unknown User",
          user_pic: comment.userId?.pic || "",
          comments: comment.comment,
          date: comment.date,
        })),
        date: post.date,
      })),
    };

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..." });
  }
});

// Route 4: Delete post. Sign in required for uploader.
router.delete("/deletePost/:id", [userauth], async (req, res) => {
  try {
    const { id } = req.params;

    // Find the post by ID
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    // Check if the logged-in user is authorized to delete
    if (post.uploadedBy.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this post." });
    }

    // Delete the post
    await Post.findByIdAndDelete(id);

    // Respond with success
    return res.status(200).json({ message: "Post deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error." });
  }
});

//Route 5:like & dislike post.Sign in required for user..
router.post("/likePost/:id", [userauth], async (req, res) => {
  try {
    const { id } = req.params;

    //Find post
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }
    //Check if user already liked post
    const userIndex = post.likes.indexOf(req.user.id);
    if (userIndex !== -1) {
      // User has already liked the post; remove their like (dislike)
      post.likes.splice(userIndex, 1);
      await post.save();
      return res.status(200).json({ message: "Post disliked successfully." });
    }

    post.likes.push(req.user.id);
    await post.save();
    return res
      .status(200)
      .json({ message: "Post liked successfully.", likes: post.likes.length });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error." });
  }
});

//Route 6:Add comments in post.sign in requird for user..
router.post("/addComments/:id", [userauth], async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({ message: "Comment is required." });
    }

    //Find post..
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }
    //Create new comment
    const newComment = {
      userId: req.user.id,
      comment,
    };
    post.comments.push(newComment);
    await post.save();
    return res.status(200).json({ message: "Comment added successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error." });
  }
});

//Route 7:Delete comment.Sigin required for commenter and post owner..
router.delete(
  "/deleteComment/:postId/:commentId",
  [userauth],
  async (req, res) => {
    try {
      const { postId, commentId } = req.params;

      //Finding post...
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found." });
      }

      //Finding comment...
      const comment = await post.comments.id(commentId);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found." });
      }

      //Check if user is post owner or commenter
      if (
        comment.userId.toString() !== req.user.id &&
        post.uploadedBy.toString() !== req.user.id
      ) {
        return res
          .status(403)
          .json({ message: "You are not authorized to delete this comment" });
      }
      //Delete comment
      post.comments.pull(commentId);
      await post.save();
      return res.status(200).json({ message: "Comment deleted successfully." });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error." });
    }
  }
);

module.exports = router;
