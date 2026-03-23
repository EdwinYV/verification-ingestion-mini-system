require('./observability/otel');

const app = require('./app');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { startGrpcServer } = require('./grpc/server');
const env = require('./config/env');

require('./modules/billing/data/models/wallet.model');
require('./modules/billing/data/models/transaction.model');

const HTTP_PORT = env.PORT;

const start = async () => {
  try {
    await connectDB();
    await connectRedis();
    startGrpcServer();

    app.listen(HTTP_PORT, () => {
      console.log(`Billing HTTP server listening on port ${HTTP_PORT}`);
    });
  } catch (error) {
    console.error('Billing service startup error:', error);
    process.exit(1);
  }
};

start();
