require("dotenv").config();
const fs = require("fs");
const path = require("path");

function buildAivenSSL() {
  // Ưu tiên đọc theo biến môi trường AIVEN_SSL_CA (vd: ./ca.pem)
  const caPath = process.env.AIVEN_SSL_CA
    ? path.resolve(process.cwd(), process.env.AIVEN_SSL_CA)
    : path.join(__dirname, "ca.pem");

  return {
    ssl: {
      ca: fs.readFileSync(caPath),
      rejectUnauthorized: true,
    },
  };
}

module.exports = {
  development: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    define: { freezeTableName: true },
    logging: false,
    // Local thường không cần SSL -> bỏ để tránh lỗi lặt vặt
  },

  production: {
    username: process.env.AIVEN_USER,
    password: process.env.AIVEN_PASSWORD,
    database: process.env.AIVEN_DB,
    host: process.env.AIVEN_HOST,
    port: Number(process.env.AIVEN_PORT),
    dialect: "mysql",
    define: { freezeTableName: true },
    logging: false,
    dialectOptions: buildAivenSSL(),
  },
};
