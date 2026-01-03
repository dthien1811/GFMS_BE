'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Gym extends Model {
    static associate(models) {
      Gym.belongsTo(models.User, { foreignKey: 'ownerId', as: 'owner' });
      Gym.hasMany(models.Member, { foreignKey: 'gymId' });
      Gym.hasMany(models.Trainer, { foreignKey: 'gymId' });
      Gym.hasMany(models.Package, { foreignKey: 'gymId' });
      Gym.hasMany(models.Equipment, { foreignKey: 'gymId' });
      Gym.hasMany(models.Booking, { foreignKey: 'gymId' });
      Gym.hasMany(models.Transaction, { foreignKey: 'gymId' });
      Gym.belongsToMany(models.Trainer, { through: 'TrainerGym' })
      Gym.belongsTo(models.FranchiseRequest, { foreignKey: 'franchiseRequestId' });
    }
  };
  Gym.init({
    name: DataTypes.STRING,
    address: DataTypes.STRING,
    phone: DataTypes.STRING,
    email: DataTypes.STRING,
    description: DataTypes.TEXT,
    status: DataTypes.STRING,
    ownerId: DataTypes.INTEGER,
    franchiseRequestId: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Gym',
  });
  return Gym;
};