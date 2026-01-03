'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Review extends Model {
    static associate(models) {
      Review.belongsTo(models.Member, { foreignKey: 'memberId' });
      Review.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
      Review.belongsTo(models.Booking, { foreignKey: 'bookingId' });
    }
  };
  Review.init({
    memberId: DataTypes.INTEGER,
    trainerId: DataTypes.INTEGER,
    bookingId: DataTypes.INTEGER,
    rating: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
    comment: DataTypes.TEXT,
    status: { 
      type: DataTypes.ENUM('active', 'hidden'), 
      defaultValue: 'active' 
    }
  }, {
    sequelize,
    modelName: 'Review',
  });
  return Review;
};