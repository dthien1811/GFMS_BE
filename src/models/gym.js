'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Gym extends Model {
    static associate(models) {
<<<<<<< HEAD
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

=======
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
>>>>>>> c86319c7c179f1fea81778fab0c9e77f715ca7e1
      if (models.FranchiseRequest) {
        Gym.belongsTo(models.FranchiseRequest, { foreignKey: 'franchiseRequestId' });
      }

<<<<<<< HEAD
      // ✅ ĐÚNG với DB kho:
      if (models.EquipmentStock) Gym.hasMany(models.EquipmentStock, { foreignKey: 'gymId' });
      if (models.Receipt) Gym.hasMany(models.Receipt, { foreignKey: 'gymId' });
      if (models.Inventory) Gym.hasMany(models.Inventory, { foreignKey: 'gymId' });

      // ❌ KHÔNG GIỮ: Gym.hasMany(models.Equipment, { foreignKey: 'gymId' })
      // Vì bảng equipment (ảnh của bạn) không có gymId -> include sẽ lỗi.
      // Quan hệ gym-equipment đúng là đi qua EquipmentStock.
=======
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
>>>>>>> c86319c7c179f1fea81778fab0c9e77f715ca7e1
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
<<<<<<< HEAD
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
=======
      operatingHours: DataTypes.TEXT,
      images: DataTypes.TEXT
>>>>>>> c86319c7c179f1fea81778fab0c9e77f715ca7e1
    },
    {
      sequelize,
      modelName: 'Gym',
<<<<<<< HEAD
      tableName: 'gym',
      timestamps: true,
=======
      tableName: 'gym', // ✅ khớp bảng trong DB
>>>>>>> c86319c7c179f1fea81778fab0c9e77f715ca7e1
    }
  );

  return Gym;
};
