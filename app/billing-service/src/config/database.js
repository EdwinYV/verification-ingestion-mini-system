const { Sequelize } = require('sequelize');
const env = require('./env');

const sequelize = new Sequelize(env.BILLING_POSTGRES_URI, {
  dialect: 'postgres',
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: env.PG_POOL_ACQUIRE_TIMEOUT_MS,
    idle: 10000,
  },
  dialectOptions: {
    connectTimeout: env.PG_CONNECT_TIMEOUT_MS,
  },
});

const connectDB = async () => {
  await sequelize.authenticate();
  console.log('Connected to PostgreSQL (billing-service)');
  await sequelize.sync();
  console.log('Billing PostgreSQL schema synchronized');
};

module.exports = { sequelize, connectDB };
