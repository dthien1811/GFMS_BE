'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Review extends Model {
    static associate(models) {
      Review.belongsTo(models.Member, { foreignKey: 'memberId' });
      Review.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      Review.belongsTo(models.Booking, { foreignKey: 'bookingId' });
      if (models.Gym) Review.belongsTo(models.Gym, { foreignKey: 'gymId' });
      if (models.Package) Review.belongsTo(models.Package, { foreignKey: 'packageId' });
      if (models.PackageActivation) Review.belongsTo(models.PackageActivation, { foreignKey: 'packageActivationId' });
    }
  };
  Review.init({
    memberId: DataTypes.INTEGER,
    trainerId: DataTypes.INTEGER,
    bookingId: DataTypes.INTEGER,
    gymId: DataTypes.INTEGER,
    packageId: DataTypes.INTEGER,
    packageActivationId: DataTypes.INTEGER,
    reviewType: { type: DataTypes.ENUM('trainer', 'gym', 'package'), allowNull: false, defaultValue: 'trainer' },
    rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    comment: DataTypes.TEXT,
    status: { 
      type: DataTypes.ENUM('active', 'hidden'), 
      defaultValue: 'active' 
    }
  }, {
    sequelize,
    modelName: 'Review',
    tableName: 'review'
  });
  return Review;
};
