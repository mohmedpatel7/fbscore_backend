const jwt = require("jsonwebtoken");
require("dotenv").config();

const JWT_SIGN = process.env.JWT_SIGN; // JWT secret

const matchofficialauth = (req, res, next) => {
  // Get the token from the header
  const token = req.header("matchofficial-token");

  // Check if no token
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SIGN);

    // Attach the user to the request object
    req.user = { id: decoded.id }; // Updated to match decoded structure

    // Call the next middleware or route handler
    next();
  } catch (err) {
    // Handle invalid token
    console.error("Token verification failed:", err); // Debugging line
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = matchofficialauth;
