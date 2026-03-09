const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../../config/database');
const Wallet = require('./wallet.model');

const Transaction = sequelize.define(
  'Transaction',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Wallet,
        key: 'id',
      },
    },
    tenant: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('CREDIT', 'DEBIT'),
      allowNull: false,
    },
    amountMinor: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    balanceBeforeMinor: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    balanceAfterMinor: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PENDING'),
      allowNull: false,
      defaultValue: 'SUCCESS',
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        fields: ['tenant', 'reference'],
      },
    ],
  }
);

Wallet.hasMany(Transaction, { foreignKey: 'walletId' });
Transaction.belongsTo(Wallet, { foreignKey: 'walletId' });

module.exports = Transaction;
