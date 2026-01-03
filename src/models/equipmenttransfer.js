// models/equipmenttransfer.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class EquipmentTransfer extends Model {
    static associate(models) {
      EquipmentTransfer.belongsTo(models.Equipment, { foreignKey: 'equipmentId' });
      EquipmentTransfer.belongsTo(models.Gym, { foreignKey: 'fromGymId', as: 'fromGym' });
      EquipmentTransfer.belongsTo(models.Gym, { foreignKey: 'toGymId', as: 'toGym' });
      EquipmentTransfer.belongsTo(models.User, { foreignKey: 'requestedBy', as: 'requester' });
      EquipmentTransfer.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
      EquipmentTransfer.belongsTo(models.User, { foreignKey: 'receivedBy', as: 'receiver' });
    }
  };
  EquipmentTransfer.init({
    transferNumber: { 
      type: DataTypes.STRING,
      unique: true 
    },
    equipmentId: DataTypes.INTEGER,
    fromGymId: DataTypes.INTEGER,
    toGymId: DataTypes.INTEGER,
    quantity: DataTypes.INTEGER,
    transferDate: DataTypes.DATE,
    expectedDeliveryDate: DataTypes.DATE,
    actualDeliveryDate: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('requested', 'approved', 'in_transit', 'delivered', 'cancelled', 'rejected'),
      defaultValue: 'requested'
    },
    reason: DataTypes.TEXT,
    transportDetails: DataTypes.TEXT,
    notes: DataTypes.TEXT,
    requestedBy: DataTypes.INTEGER,
    approvedBy: DataTypes.INTEGER,
    approvedAt: DataTypes.DATE,
    receivedBy: DataTypes.INTEGER,
    receivedAt: DataTypes.DATE,
    conditionCheck: DataTypes.JSON,
    documents: DataTypes.JSON // Array of document URLs
  }, {
    sequelize,
    modelName: 'EquipmentTransfer',
  });
  return EquipmentTransfer;
};