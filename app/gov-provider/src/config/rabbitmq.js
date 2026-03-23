const amqp = require('amqplib');
const env = require('./env');

const RABBITMQ_URL = env.RABBITMQ_URL;

const GOV_EXCHANGE = 'gov_verification_exchange';
const GOV_QUEUE = 'gov_verification_queue';
const GOV_ROUTING_KEY = 'gov.verify';

const GOV_RETRY_EXCHANGE = 'gov_retry_exchange';
const GOV_RETRY_QUEUE = 'gov_retry_queue';
const GOV_RETRY_ROUTING_KEY = 'gov.retry';

const GOV_DLX = 'gov_dlx';
const GOV_DLQ = 'gov_dlq';
const GOV_DLQ_ROUTING_KEY = 'gov.dlq';

let channel = null;

const connectRabbitMQ = async () => {
  try {
    console.log('[DEBUG] Connecting to RabbitMQ...');
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log('[DEBUG] RabbitMQ Channel created.');

    await channel.assertExchange(GOV_DLX, 'direct', { durable: true });
    await channel.assertQueue(GOV_DLQ, { durable: true });
    await channel.bindQueue(GOV_DLQ, GOV_DLX, GOV_DLQ_ROUTING_KEY);

    await channel.assertExchange(GOV_EXCHANGE, 'direct', { durable: true });

    try {
      await channel.assertQueue(GOV_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': GOV_DLX,
          'x-dead-letter-routing-key': GOV_DLQ_ROUTING_KEY,
        },
      });
    } catch (err) {
      if (err.code === 406) {
        console.warn(`Queue ${GOV_QUEUE} mismatch. Deleting and recreating...`);
        channel = await connection.createChannel();
        await channel.deleteQueue(GOV_QUEUE);
        await channel.assertQueue(GOV_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': GOV_DLX,
            'x-dead-letter-routing-key': GOV_DLQ_ROUTING_KEY,
          },
        });
      } else {
        throw err;
      }
    }
    await channel.bindQueue(GOV_QUEUE, GOV_EXCHANGE, GOV_ROUTING_KEY);

    await channel.assertExchange(GOV_RETRY_EXCHANGE, 'direct', { durable: true });

    try {
      await channel.assertQueue(GOV_RETRY_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': GOV_EXCHANGE,
          'x-dead-letter-routing-key': GOV_ROUTING_KEY,
        },
      });
    } catch (err) {
      if (err.code === 406) {
        console.warn(`Queue ${GOV_RETRY_QUEUE} mismatch. Deleting and recreating...`);
        channel = await connection.createChannel();
        await channel.deleteQueue(GOV_RETRY_QUEUE);
        await channel.assertQueue(GOV_RETRY_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': GOV_EXCHANGE,
            'x-dead-letter-routing-key': GOV_ROUTING_KEY,
          },
        });
      } else {
        throw err;
      }
    }
    await channel.bindQueue(GOV_RETRY_QUEUE, GOV_RETRY_EXCHANGE, GOV_RETRY_ROUTING_KEY);

    console.log('Connected to RabbitMQ (Gov Provider) with full Retry/DLQ setup.');
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
};

const publishToQueue = (data) => {
  if (!channel) {
    console.error('RabbitMQ channel is not available.');
    return;
  }
  console.log('[DEBUG] Publishing to exchange...');
  const result = channel.publish(
    GOV_EXCHANGE,
    GOV_ROUTING_KEY,
    Buffer.from(JSON.stringify(data)),
    { persistent: true }
  );
  console.log(`[DEBUG] Published to exchange. Result: ${result}`);
};

const publishToRetryQueue = (data, delayMs) => {
  if (!channel) {
    console.error('RabbitMQ channel is not available.');
    return;
  }
  channel.publish(
    GOV_RETRY_EXCHANGE,
    GOV_RETRY_ROUTING_KEY,
    Buffer.from(JSON.stringify(data)),
    { persistent: true, expiration: delayMs.toString() }
  );
};

module.exports = {
  connectRabbitMQ,
  publishToQueue,
  publishToRetryQueue,
  getChannel: () => channel,
  GOV_QUEUE,
};
