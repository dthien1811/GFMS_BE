'use strict';

module.exports = (sequelize, DataTypes) => {
  const Gym = sequelize.define(
    'Gym',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      images: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON array of image URLs',
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: 'active',
        get() {
          const raw = this.getDataValue('status');
          return typeof raw === 'string' ? raw.toLowerCase() : raw;
        },
        set(value) {
          this.setDataValue('status', typeof value === 'string' ? value.toLowerCase() : value);
        },
      },

      ownerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      franchiseRequestId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      operatingHours: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'gym',
      freezeTableName: true,
      timestamps: true,
    }
  );

  Gym.associate = (models) => {
    /**
     * ===== CORE RELATIONS =====
     */
    if (models.User) {
      Gym.belongsTo(models.User, {
        foreignKey: 'ownerId',
        as: 'owner',
      });
    }

    /**
     * ===== FRANCHISE =====
     */
    if (models.FranchiseRequest) {
      Gym.belongsTo(models.FranchiseRequest, {
        foreignKey: 'franchiseRequestId',
      });
    }

    /**
     * ===== BUSINESS MODULES =====
     */
    if (models.Member) {
      Gym.hasMany(models.Member, {
        foreignKey: 'gymId',
      });
    }

    if (models.Package) {
      Gym.hasMany(models.Package, {
        foreignKey: 'gymId',
      });
    }

    if (models.Booking) {
      Gym.hasMany(models.Booking, {
        foreignKey: 'gymId',
      });
    }

    if (models.Transaction) {
      Gym.hasMany(models.Transaction, {
        foreignKey: 'gymId',
      });
    }

    if (models.PurchaseRequest) {
      Gym.hasMany(models.PurchaseRequest, { foreignKey: 'gymId', as: 'purchaseRequests' });
    }

    /**
     * ===== INVENTORY / MAINTENANCE (nếu có) =====
     */
    // NOTE:
    // Equipment is a global catalog entity and does not have gymId column.
    // Stock per gym is tracked via EquipmentStock (gymId, equipmentId).

    if (models.MaintenanceRequest) {
      Gym.hasMany(models.MaintenanceRequest, {
        foreignKey: 'gymId',
      });
    }

    /**
     * ===== PT SHARING POLICY =====
     * để include Policy từ Gym (và ngược lại)
     */
    if (models.Policy) {
      Gym.hasMany(models.Policy, {
        foreignKey: 'gymId',
        as: 'policies',
      });
    }
  };

  return Gym;
};
