'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ActivationMaterial extends Model {
    static associate(models) {
      ActivationMaterial.belongsTo(models.PackageActivation, { foreignKey: 'packageActivationId' });
      ActivationMaterial.belongsTo(models.Trainer, { foreignKey: 'trainerId' });
    }
  }
  ActivationMaterial.init(
    {
      packageActivationId: DataTypes.INTEGER,
      trainerId: DataTypes.INTEGER,
      materialKind: DataTypes.ENUM('demo_video', 'training_plan'),
      sourceItemId: DataTypes.STRING(128),
      title: DataTypes.STRING(512),
      fileUrl: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: 'ActivationMaterial',
      tableName: 'activationmaterial',
    }
  );
  return ActivationMaterial;
};
