const express = require("express");
const router = express.Router();
const User = require("../schema_models/User");
const Post = require("../schema_models/Post");
const multer = require("multer");
const path = require("path");
const userauth = require("../middleware/userauth");
const teamauth = require("../middleware/teamauth");
const dotenv = require("dotenv");

dotenv.config();
const baseUrl = process.env.baseurl;


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
        uploaderType: "User",
        image: imagePath,
        description,
      });

      await newPost.save();
      res.json({ message: "Post uploaded successfully", newPost });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error..!" });
    }
  }
);

//Route 1.1:Upload post.Sign in required for teamowner..
router.post(
  "/uploadTeamPost",
  [teamauth],
  [upload.single("image")],
  async (req, res) => {
    try {
      const { description } = req.body;
      const uploadedBy = req.user.teamId;

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
        uploaderType: "Team",
        image: imagePath,
        description,
      });

      await newPost.save();
      res.json({ message: "Post uploaded successfully", newPost });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error..!" });
    }
  }
);

//Route 2: Fetching all posts (both user and team posts). Sign in not required.
router.get("/post", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate({
        path: "uploadedBy",
        select: "name pic teamname teamlogo", // Include all fields we might need
      })
      .populate("comments.userId", "name pic")
      .sort({ date: -1 });

    if (!posts) {
      return res.status(404).json({ message: "No posts found." });
    }

    const response = {
      posts: await Promise.all(
        posts.map(async (post) => {
          const postDate = new Date(post.date);
          const currentDate = new Date();
          const diffInMilliseconds = currentDate - postDate;
          const daysAgo = Math.floor(
            diffInMilliseconds / (1000 * 60 * 60 * 24)
          );

          let timeAgo;
          if (daysAgo > 0) {
            timeAgo = `${daysAgo} days ago`;
          } else {
            const hoursAgo = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
            timeAgo = hoursAgo > 0 ? `${hoursAgo} hours ago` : "Just now";
          }

          // Check if the post is from a team using the uploaderType field
          const isTeam = post.uploaderType === "Team";

          return {
            id: post._id,
            image: post.image
              ? `${baseUrl}/uploads/posts/${path.basename(post.image)}`
              : null,
            description: post.description,
            // Handle both team and user posts using uploaderType
            uploadedBy_name: isTeam
              ? post.uploadedBy?.teamname || "Unknown Team"
              : post.uploadedBy?.name || "Unknown User",
            uploadedBy_pic: isTeam
              ? post.uploadedBy?.teamlogo
                ? `${baseUrl}/uploads/other/${path.basename(
                    post.uploadedBy.teamlogo
                  )}`
                : null
              : post.uploadedBy?.pic
              ? `${baseUrl}/uploads/other/${path.basename(post.uploadedBy.pic)}`
              : null,
            isTeamPost: isTeam,
            likes: post.likes.length,
            comment: post.comments.map((comment) => ({
              id: comment._id,
              user_name: comment.userId?.name || "Unknown User",
              user_pic: comment.userId?.pic
                ? `${baseUrl}/uploads/other/${path.basename(
                    comment.userId?.pic
                  )}`
                : null,
              comments: comment.comment,
              date: comment.date,
            })),
            date: timeAgo,
          };
        })
      ),
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
    const posts = await Post.find({ uploadedBy: post_id, uploaderType: "User" })
      .populate("uploadedBy", "name pic")
      .populate("comments.userId", "name pic")
      .sort({ date: -1 });

    if (!posts) {
      return res.status(404).json({ message: "No posts found." });
    }

    const response = {
      posts: posts.map((post) => {
        const postDate = new Date(post.date);
        const currentDate = new Date();
        const diffInMilliseconds = currentDate - postDate;
        const daysAgo = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));

        let timeAgo;
        if (daysAgo > 0) {
          timeAgo = `${daysAgo} days ago`;
        } else {
          const hoursAgo = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
          timeAgo = hoursAgo > 0 ? `${hoursAgo} hours ago` : "Just now";
        }
        return {
          id: post._id,
          image: post.image
            ? `${baseUrl}/uploads/posts/${path.basename(post.image)}`
            : null,
          description: post.description,
          uploadedBy_name: post.uploadedBy?.name || "Unknown User",
          uploadedBy_pic: post.uploadedBy?.pic
            ? `${baseUrl}/uploads/other/${path.basename(post.uploadedBy?.pic)}`
            : null,
          likes: post.likes.length,
          comment: post.comments.map((comment) => ({
            id: comment._id,
            user_name: comment.userId?.name || "Unknown User",
            user_pic: comment.userId?.pic
              ? `${baseUrl}/uploads/other/${path.basename(comment.userId?.pic)}`
              : null,
            comments: comment.comment,
            date: comment.date,
          })),
          date: timeAgo,
        };
      }),
    };

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ message: "Internal server error..." });
  }
});

//Route 3.1:Fetching post for sign in teamowner...
router.get("/signInTeamPost", [teamauth], async (req, res) => {
  try {
    const post_id = req.user.teamId;
    const posts = await Post.find({ uploadedBy: post_id, uploaderType: "Team" })
      .populate("uploadedBy", "teamname teamlogo")
      .populate("comments.userId", "name pic")
      .sort({ date: -1 });

    if (!posts) {
      return res.status(404).json({ message: "No posts found." });
    }

    const response = {
      posts: posts.map((post) => {
        const postDate = new Date(post.date);
        const currentDate = new Date();
        const diffInMilliseconds = currentDate - postDate;
        const daysAgo = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));

        let timeAgo;
        if (daysAgo > 0) {
          timeAgo = `${daysAgo} days ago`;
        } else {
          const hoursAgo = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
          timeAgo = hoursAgo > 0 ? `${hoursAgo} hours ago` : "Just now";
        }
        return {
          id: post._id,
          image: post.image
            ? `${baseUrl}/uploads/posts/${path.basename(post.image)}`
            : null,
          description: post.description,
          uploadedBy_name: post.uploadedBy?.teamname || "Unknown Team",
          uploadedBy_pic: post.uploadedBy?.teamlogo
            ? `${baseUrl}/uploads/other/${path.basename(
                post.uploadedBy?.teamlogo
              )}`
            : null,
          likes: post.likes.length,
          comment: post.comments.map((comment) => ({
            id: comment._id,
            user_name: comment.userId?.name || "Unknown User",
            user_pic: comment.userId?.pic
              ? `${baseUrl}/uploads/other/${path.basename(comment.userId?.pic)}`
              : null,
            comments: comment.comment,
            date: comment.date,
          })),
          date: timeAgo,
          isTeamPost: true,
        };
      }),
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

// Route 4: Delete post. Sign in required for uploader.
router.delete("/deleteTeamPost/:id", [teamauth], async (req, res) => {
  try {
    const { id } = req.params;

    // Find the post by ID
    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    // Check if the logged-in user is authorized to delete
    if (post.uploadedBy.toString() !== req.user.teamId) {
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
