'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class FranchiseRequest extends Model {
    static associate(models) {
      FranchiseRequest.belongsTo(models.User, { foreignKey: 'requesterId', as: 'requester' });
      FranchiseRequest.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
    }
  };
  FranchiseRequest.init({
    requesterId: DataTypes.INTEGER,
    businessName: DataTypes.STRING,
    location: DataTypes.STRING,
    contactPerson: DataTypes.STRING,
    contactPhone: DataTypes.STRING,
    contactEmail: DataTypes.STRING,
    investmentAmount: DataTypes.DECIMAL,
    businessPlan: DataTypes.TEXT,
    status: DataTypes.STRING,
    reviewedBy: DataTypes.INTEGER,
    reviewNotes: DataTypes.TEXT,
    approvedDate: DataTypes.DATE,
    contractSigned: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'FranchiseRequest',
  });
  return FranchiseRequest;
};