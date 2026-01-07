'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Gym extends Model {
    static associate(models) {
      Gym.belongsTo(models.User, { foreignKey: 'ownerId', as: 'owner' });

      // Giữ các quan hệ bạn có (nếu tồn tại model)
      if (models.Member) Gym.hasMany(models.Member, { foreignKey: 'gymId' });
      if (models.Trainer) Gym.hasMany(models.Trainer, { foreignKey: 'gymId' });
      if (models.Package) Gym.hasMany(models.Package, { foreignKey: 'gymId' });
      if (models.Booking) Gym.hasMany(models.Booking, { foreignKey: 'gymId' });
      if (models.Transaction) Gym.hasMany(models.Transaction, { foreignKey: 'gymId' });

      if (models.Trainer && models.TrainerGym) {
        Gym.belongsToMany(models.Trainer, { through: 'TrainerGym', foreignKey: 'gymId', otherKey: 'trainerId' });
      }

      if (models.FranchiseRequest) {
        Gym.belongsTo(models.FranchiseRequest, { foreignKey: 'franchiseRequestId' });
      }

      // ✅ ĐÚNG với DB kho:
      if (models.EquipmentStock) Gym.hasMany(models.EquipmentStock, { foreignKey: 'gymId' });
      if (models.Receipt) Gym.hasMany(models.Receipt, { foreignKey: 'gymId' });
      if (models.Inventory) Gym.hasMany(models.Inventory, { foreignKey: 'gymId' });

      // ❌ KHÔNG GIỮ: Gym.hasMany(models.Equipment, { foreignKey: 'gymId' })
      // Vì bảng equipment (ảnh của bạn) không có gymId -> include sẽ lỗi.
      // Quan hệ gym-equipment đúng là đi qua EquipmentStock.
    }
  }

  Gym.init(
    {
      name: DataTypes.STRING,
      address: DataTypes.STRING,
      phone: DataTypes.STRING,
      email: DataTypes.STRING,
      description: DataTypes.TEXT,
      status: DataTypes.STRING,
      ownerId: DataTypes.INTEGER,
      franchiseRequestId: DataTypes.INTEGER,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Gym',
      tableName: 'gym',
      timestamps: true,
    }
  );

  return Gym;
};
