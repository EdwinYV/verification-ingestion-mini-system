require('./observability/otel');
const app = require('./app');
const mongoose = require('mongoose');
const seedData = require('./utils/seeder');
const env = require('./config/env');
const { connectRedis } = require('./config/redis');
const { connectRabbitMQ } = require('./config/rabbitmq');
const { startWorker } = require('./workers/verification.worker');

const PORT = env.PORT;
const MONGO_URI = env.MONGO_URI;
const MONGO_SERVER_SELECTION_TIMEOUT_MS = env.MONGO_SERVER_SELECTION_TIMEOUT_MS;
const MONGO_SOCKET_TIMEOUT_MS = env.MONGO_SOCKET_TIMEOUT_MS;
const MONGO_CONNECT_TIMEOUT_MS = env.MONGO_CONNECT_TIMEOUT_MS;

mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', env.MONGO_BUFFER_TIMEOUT_MS);

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
