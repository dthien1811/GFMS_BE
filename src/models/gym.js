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
      if (models.Member) {
        Gym.hasMany(models.Member, { foreignKey: 'gymId' });
      }

      // packages
      if (models.Package) {
        Gym.hasMany(models.Package, { foreignKey: 'gymId' });
      }

      // equipments
      if (models.Equipment) {
        Gym.hasMany(models.Equipment, { foreignKey: 'gymId' });
      }

      // bookings
      if (models.Booking) {
        Gym.hasMany(models.Booking, { foreignKey: 'gymId' });
      }

      // transactions
      if (models.Transaction) {
        Gym.hasMany(models.Transaction, { foreignKey: 'gymId' });
      }

      // franchise request
      if (models.FranchiseRequest) {
        Gym.belongsTo(models.FranchiseRequest, { foreignKey: 'franchiseRequestId' });
      }

      /**
       * IMPORTANT:
       * - DB hiện tại KHÔNG có TrainerGym
       * - Trainer cũng KHÔNG có gymId
       * => Không tạo quan hệ Gym <-> Trainer ở đây.
       *
       * Trainer làm việc tại gym sẽ được xác định bằng TrainerShare (toGymId)
       * hoặc sau này nếu bạn tạo TrainerGym thật thì mới bật lại belongsToMany.
       */
      if (models.TrainerShare) {
        // PT được share vào gym này
        Gym.hasMany(models.TrainerShare, { foreignKey: 'toGymId', as: 'incomingTrainerShares' });
        // PT share ra từ gym này
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
      operatingHours: DataTypes.TEXT,
      images: DataTypes.TEXT
    },
    {
      sequelize,
      modelName: 'Gym',
      tableName: 'gym', // ✅ khớp bảng trong DB
    }
  );

  return Gym;
};
