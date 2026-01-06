'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Supplier extends Model {
    static associate(models) {
      // Đợt 1: không bắt buộc liên kết Supplier -> Equipment
      // vì DB của bạn đang mismatch nhiều cột
    }
  };

  Supplier.init(
    {
      name: DataTypes.STRING,
      code: DataTypes.STRING,

      // dùng phone/email nếu DB có; service sẽ tự map nếu DB dùng contactPhone/contactEmail
      phone: DataTypes.STRING,
      email: DataTypes.STRING,

      address: DataTypes.STRING,
      taxCode: DataTypes.STRING,
      notes: DataTypes.TEXT,

      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Supplier',
      tableName: 'Supplier',
      timestamps: true,
    }
  );

  return Supplier;
};
