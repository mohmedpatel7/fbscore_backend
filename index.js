const express = require("express");
const cors = require("cors");
const connect = require("./database");

const app = express();
const port = process.env.PORT || 5000;

connect();
app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/user"));
app.use("/api/team", require("./routes/team"));
app.use("/api/player", require("./routes/player"));
app.use("/api/match", require("./routes/match"));
app.use("/api/posts", require("./routes/posts"));

app.use((err, req, res, next) => {
  console.error("Error stack:", err.stack);
  console.error("Error message:", err.message);
  res.status(500).send("Something broke!");
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
