'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';

const configPath = path.join(__dirname, '..', 'config', 'config.js');
const config = require(configPath)[env];

const db = {};
let sequelize;

if (env === 'production') {
  const host = process.env.AIVEN_HOST;
  const port = Number(process.env.AIVEN_PORT || 3306);
  const database = process.env.AIVEN_DB;
  const username = process.env.AIVEN_USER;
  const password = process.env.AIVEN_PASSWORD;
  const caPath = process.env.AIVEN_SSL_CA;

  if (!host || !database || !username || !password) {
    throw new Error(
      'Missing Aiven env vars: AIVEN_HOST, AIVEN_DB, AIVEN_USER, AIVEN_PASSWORD (and optional AIVEN_PORT, AIVEN_SSL_CA)'
    );
  }
  if (!caPath) throw new Error('Missing AIVEN_SSL_CA (path to ca.pem)');

  sequelize = new Sequelize(database, username, password, {
    ...config,
    host,
    port,
    dialect: 'mysql',
    logging: false,
    define: {
      ...(config.define || {}),
      freezeTableName: true,
    },
    dialectOptions: {
      ...(config.dialectOptions || {}),
      ssl: {
        ca: fs.readFileSync(path.resolve(caPath), 'utf8'),
        rejectUnauthorized: true,
      },
    },
  });
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, {
    ...config,
    define: {
      ...(config.define || {}),
      freezeTableName: true,
    },
  });
}

// Load models (recursive)
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

// Associate
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) db[modelName].associate(db);
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
