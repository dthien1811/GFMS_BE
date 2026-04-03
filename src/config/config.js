require("dotenv").config();
const fs = require("fs");
const path = require("path");

function resolveCAPath() {
  const candidates = [
    process.env.AIVEN_SSL_CA,
    "./ca.pem",
    "./src/config/ca.pem",
    path.join(__dirname, "ca.pem"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const full = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function buildPool() {
  return {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: Number(process.env.DB_POOL_MIN || 0),
    acquire: Number(process.env.DB_POOL_ACQUIRE || 60000),
    idle: Number(process.env.DB_POOL_IDLE || 10000),
    evict: Number(process.env.DB_POOL_EVICT || 1000),
  };
}

function buildAivenConfig() {
  const caPath = resolveCAPath();
  const dialectOptions = {
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 60000),
  };

  if (caPath) {
    dialectOptions.ssl = {
      ca: fs.readFileSync(caPath),
      rejectUnauthorized: true,
    };
  }

  return {
    username: process.env.AIVEN_USER,
    password: process.env.AIVEN_PASSWORD,
    database: process.env.AIVEN_DB,
    host: process.env.AIVEN_HOST,
    port: Number(process.env.AIVEN_PORT || 3306),
    dialect: "mysql",
    define: { freezeTableName: true },
    logging: false,
    dialectOptions,
    pool: buildPool(),
  };
}

function buildLocalConfig() {
  return {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    define: { freezeTableName: true },
    logging: false,
    dialectOptions: {
      connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 60000),
    },
    pool: buildPool(),
  };
}

module.exports = {
  development: buildLocalConfig(),
  production: buildAivenConfig(),
};
