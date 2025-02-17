const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN; // JWT secret

const CommonMiddleware = (req, res, next) => {
  let token = null;
  let role = null;

  // Check for admin, team, or user token in headers
  if (req.header("admin-token")) {
    token = req.header("admin-token");
    role = "admin";
  } else if (req.header("team-token")) {
    token = req.header("team-token");
    role = "team";
  } else if (req.header("auth-token")) {
    token = req.header("auth-token");
    role = "user";
  }

  // If no token is found, return an error
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SIGN);

    // Attach user ID based on role
    if (role === "team") {
      req.user = { teamId: decoded.teamOwner?.id };
    } else {
      req.user = { id: decoded.id };
    }

    req.user.role = role; // Store role for reference

    // Proceed to the next middleware
    next();
  } catch (err) {
    console.error(`Token verification failed for ${role}:`, err);
    res.status(401).json({ message: `Token is not valid for ${role}` });
  }
};

module.exports = CommonMiddleware;
