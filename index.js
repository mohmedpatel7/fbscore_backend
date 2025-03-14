const express = require("express");
const cors = require("cors");
const connect = require("./database");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

connect();
app.use(cors());
app.use(express.json());

// Serve static files
app.use("/uploads/posts", express.static(path.join(__dirname, "post_dir")));
app.use("/uploads/other", express.static(path.join(__dirname, "uploads")));

// Default route for Vercel
app.get("/", (req, res) => {
  res.send("<h1>Welcome to Mohmed's FBScore Backend API 🚀</h1><p>Backend is running successfully!</p>");
});

app.use("/api/auth", require("./routes/user"));
app.use("/api/team", require("./routes/team"));
app.use("/api/player", require("./routes/player"));
app.use("/api/match", require("./routes/match"));
app.use("/api/posts", require("./routes/posts"));
app.use("/api/admin", require("./routes/admin"));

app.use((err, req, res, next) => {
  console.error("Error stack:", err.stack);
  console.error("Error message:", err.message);
  res.status(500).send("Something broke!");
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
