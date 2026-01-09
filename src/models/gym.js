'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Gym extends Model {
    static associate(models) {
      // owner
      if (models.User) {
        Gym.belongsTo(models.User, { foreignKey: 'ownerId', as: 'owner' });
      }

      // members
      if (models.Member) Gym.hasMany(models.Member, { foreignKey: 'gymId' });

      // trainers (CHỈ giữ nếu Trainer có gymId thật trong DB)
      // Nếu Trainer không có gymId thì comment dòng dưới để tránh include sai logic.
      if (models.Trainer) Gym.hasMany(models.Trainer, { foreignKey: 'gymId' });

      // packages
      if (models.Package) Gym.hasMany(models.Package, { foreignKey: 'gymId' });

      // equipments (nếu Equipment không có gymId thì bạn comment dòng này)
      if (models.Equipment) Gym.hasMany(models.Equipment, { foreignKey: 'gymId' });

      // bookings
      if (models.Booking) Gym.hasMany(models.Booking, { foreignKey: 'gymId' });

      // transactions
      if (models.Transaction) Gym.hasMany(models.Transaction, { foreignKey: 'gymId' });

      // franchise request
      if (models.FranchiseRequest) {
        Gym.belongsTo(models.FranchiseRequest, { foreignKey: 'franchiseRequestId' });
      }

      // ✅ đúng với DB kho (theo bạn mô tả)
      if (models.EquipmentStock) Gym.hasMany(models.EquipmentStock, { foreignKey: 'gymId' });
      if (models.Receipt) Gym.hasMany(models.Receipt, { foreignKey: 'gymId' });
      if (models.Inventory) Gym.hasMany(models.Inventory, { foreignKey: 'gymId' });

      /**
       * IMPORTANT:
       * - DB hiện tại KHÔNG có TrainerGym
       * - Trainer cũng có thể KHÔNG có gymId
       * => Không tạo quan hệ Gym <-> Trainer bằng belongsToMany ở đây.
       *
       * Trainer làm việc tại gym có thể xác định bằng TrainerShare (toGymId/fromGymId).
       */
      if (models.TrainerShare) {
        Gym.hasMany(models.TrainerShare, { foreignKey: 'toGymId', as: 'incomingTrainerShares' });
        Gym.hasMany(models.TrainerShare, { foreignKey: 'fromGymId', as: 'outgoingTrainerShares' });
      }
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

      // Optional fields (nếu DB có cột thì ok, nếu không có mà bạn insert/update sẽ lỗi)
      operatingHours: DataTypes.TEXT,
      images: DataTypes.TEXT,

      // Nếu DB có timestamps chuẩn thì giữ; Sequelize sẽ tự set nếu timestamps: true
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Gym',
      tableName: 'gym', // ✅ khớp bảng trong DB
      timestamps: true,
    }
  );

  return Gym;
};
