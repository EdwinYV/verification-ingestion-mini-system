require('dotenv').config();
require('./observability/otel');
const app = require('./app');
const mongoose = require('mongoose');
const seedData = require('./utils/seeder');
const { connectRedis } = require('./config/redis');
const { connectRabbitMQ } = require('./config/rabbitmq');
const { startWorker } = require('./workers/verification.worker');

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gov-provider';
const MONGO_SERVER_SELECTION_TIMEOUT_MS = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000);
const MONGO_SOCKET_TIMEOUT_MS = Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 5000);
const MONGO_CONNECT_TIMEOUT_MS = Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 5000);

mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', Number(process.env.MONGO_BUFFER_TIMEOUT_MS || 3000));

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
      socketTimeoutMS: MONGO_SOCKET_TIMEOUT_MS,
      connectTimeoutMS: MONGO_CONNECT_TIMEOUT_MS,
    });
    console.log('Connected to MongoDB (Gov Provider)');

    await connectRedis();
    await connectRabbitMQ();

    startWorker();

    await seedData();

    app.listen(PORT, () => {
      console.log(`Gov Provider Service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
};

startServer();
