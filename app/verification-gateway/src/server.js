require('dotenv').config();
require('./observability/otel');
const app = require('./app');
const mongoose = require('mongoose');
const { connectRedis } = require('./config/redis');
const { connectRabbitMQ } = require('./config/rabbitmq');
const { startWorker } = require('./workers/verification.worker');
const { startSearchIndexWorker } = require('./workers/search-index.worker');
const { connectElasticsearch, ensureVerificationLogIndex } = require('./config/elasticsearch');
const seedData = require('./utils/seeder');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verification-gateway';

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB (Verification Gateway)');

    await connectRedis();
    await connectRabbitMQ();

    await connectElasticsearch();
    await ensureVerificationLogIndex();

    startWorker();
    startSearchIndexWorker();

    await seedData();

    app.listen(PORT, () => {
      console.log(`Verification Gateway running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Gateway Startup error:', err);
    process.exit(1);
  }
};

startServer();
