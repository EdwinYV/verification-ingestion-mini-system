const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.BILLING_POSTGRES_URI || process.env.POSTGRES_URI, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: Number(process.env.PG_POOL_ACQUIRE_TIMEOUT_MS || 5000),
    idle: 10000,
  },
  dialectOptions: {
    connectTimeout: Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
  },
});

const connectDB = async () => {
  await sequelize.authenticate();
  console.log('Connected to PostgreSQL (billing-service)');
  await sequelize.sync();
  console.log('Billing PostgreSQL schema synchronized');
};

module.exports = { sequelize, connectDB };
