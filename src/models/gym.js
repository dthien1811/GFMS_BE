'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Gym extends Model {
    static associate(models) {
      Gym.belongsTo(models.User, { foreignKey: 'ownerId', as: 'owner' });

      Gym.hasMany(models.Member, { foreignKey: 'gymId' });
      Gym.hasMany(models.Package, { foreignKey: 'gymId' });
      Gym.hasMany(models.Booking, { foreignKey: 'gymId' });
      Gym.hasMany(models.Transaction, { foreignKey: 'gymId' });

      // Chỉ bật nếu DB thật có gymId trong Trainer/Equipment
      if (models.Trainer) Gym.hasMany(models.Trainer, { foreignKey: 'gymId' });
      if (models.Equipment) Gym.hasMany(models.Equipment, { foreignKey: 'gymId' });

      // FranchiseRequest FK
      Gym.belongsTo(models.FranchiseRequest, { foreignKey: 'franchiseRequestId' });

      // Kho
      if (models.EquipmentStock) Gym.hasMany(models.EquipmentStock, { foreignKey: 'gymId' });
      if (models.Receipt) Gym.hasMany(models.Receipt, { foreignKey: 'gymId' });
      if (models.Inventory) Gym.hasMany(models.Inventory, { foreignKey: 'gymId' });

      // TrainerShare
      if (models.TrainerShare) {
        Gym.hasMany(models.TrainerShare, { foreignKey: 'toGymId', as: 'incomingTrainerShares' });
        Gym.hasMany(models.TrainerShare, { foreignKey: 'fromGymId', as: 'outgoingTrainerShares' });
      }
    }
  }

  Gym.init(
    {
      name: { type: DataTypes.STRING, allowNull: false },
      address: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: true },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isEmail: true },
      },
      description: { type: DataTypes.TEXT, allowNull: true },

      status: {
        type: DataTypes.ENUM('active', 'inactive', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },

      ownerId: { type: DataTypes.INTEGER, allowNull: false },
      franchiseRequestId: { type: DataTypes.INTEGER, allowNull: true },

      operatingHours: { type: DataTypes.TEXT, allowNull: true },
      images: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Gym',
      tableName: 'gym',
      freezeTableName: true,
      timestamps: true,
      indexes: [{ fields: ['ownerId'] }, { fields: ['franchiseRequestId'] }],
    }
  );

  return Gym;
};
