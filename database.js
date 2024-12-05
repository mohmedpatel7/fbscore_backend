const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const uri = process.env.uri;

const connect = async () => {
  try {
    await mongoose.connect(uri); //connecting to db..
    console.log("Connect to db successfully...");
  } catch (error) {
    console.log("Error in connection to db", error.message);
    process.exit(1);
  }
};

module.exports = connect;
