require("dotenv").config();
const fs = require("fs");
const path = require("path");

const sslConfig = {
  ssl: {
    ca: fs.readFileSync(path.join(__dirname, "ca.pem")),
    rejectUnauthorized: true
  }
};

module.exports = {
  development: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    define: { freezeTableName: true },
    logging: false,
    dialectOptions: sslConfig
  },

  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    define: { freezeTableName: true },
    logging: false,
    dialectOptions: sslConfig
  }
};
