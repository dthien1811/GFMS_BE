'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const basename = path.basename(__filename);
const rawEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
const env = rawEnv === 'production' ? 'production' : 'development';

const configPath = path.join(__dirname, '..', 'config', 'config.js');
const config = require(configPath)[env];
const db = {};

function resolveCAPath() {
  const candidates = [
    process.env.AIVEN_SSL_CA,
    './ca.pem',
    './src/config/ca.pem',
    path.join(__dirname, '..', 'config', 'ca.pem'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const full = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function buildSequelizeOptions(baseConfig) {
  const options = {
    ...baseConfig,
    dialect: 'mysql',
    logging: false,
    define: {
      ...(baseConfig.define || {}),
      freezeTableName: true,
    },
    pool: {
      max: Number(process.env.DB_POOL_MAX || baseConfig?.pool?.max || 10),
      min: Number(process.env.DB_POOL_MIN || baseConfig?.pool?.min || 0),
      acquire: Number(process.env.DB_POOL_ACQUIRE || baseConfig?.pool?.acquire || 60000),
      idle: Number(process.env.DB_POOL_IDLE || baseConfig?.pool?.idle || 10000),
      evict: Number(process.env.DB_POOL_EVICT || baseConfig?.pool?.evict || 1000),
    },
    dialectOptions: {
      ...(baseConfig.dialectOptions || {}),
      connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || baseConfig?.dialectOptions?.connectTimeout || 60000),
    },
  };

  if (env === 'production') {
    const caPath = resolveCAPath();
    if (caPath) {
      options.dialectOptions.ssl = {
        ca: fs.readFileSync(caPath, 'utf8'),
        rejectUnauthorized: true,
      };
    }
  }

  return options;
}

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  buildSequelizeOptions(config)
);

const readModels = (dir) => {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) return readModels(fullPath);

    if (file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js') {
      const model = require(fullPath)(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
    }
  });
};

readModels(__dirname);

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) db[modelName].associate(db);
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
