const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../../config/database');

const Wallet = sequelize.define(
  'Wallet',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenant: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    organizationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    balanceMinor: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'NGN',
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'SUSPENDED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['tenant', 'organizationId'],
      },
    ],
  }
);

module.exports = Wallet;
