const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN; // JWT secret

const matchofficialauth = (req, res, next) => {
  // Get the token from the header
  const token = req.header("matchofficial-token");

  // Check if no token
  if (!token) {
    console.log("Authorization failed: No token provided");
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SIGN);

    // Extract the correct user ID from `isUser`
    req.user = { id: decoded.isUser?.id };

    // Call the next middleware or route handler
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = matchofficialauth;
