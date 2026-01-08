// src/config/connectDB.js
import db from "../models";

const connection = async () => {
  try {
    await db.sequelize.authenticate();
    console.log("✅ DB connected (using db.sequelize from models/index.js)");
  } catch (error) {
    console.error("❌ Unable to connect to DB:", error);
  }
};

export default connection;
