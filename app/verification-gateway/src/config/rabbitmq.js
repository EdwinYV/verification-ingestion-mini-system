const amqp = require('amqplib');
const env = require('./env');

const RABBITMQ_URL = env.RABBITMQ_URL;


const VERIFICATION_EXCHANGE = 'verification_exchange';
const VERIFICATION_QUEUE = 'verification_queue';
const VERIFICATION_ROUTING_KEY = 'verification.create';


const RETRY_EXCHANGE = 'verification_retry_exchange';
const RETRY_QUEUE = 'verification_retry_queue';
const RETRY_ROUTING_KEY = 'verification.retry';

const DEAD_LETTER_EXCHANGE = 'verification_dlx';
const DEAD_LETTER_QUEUE = 'verification_dlq';
const DEAD_LETTER_ROUTING_KEY = 'verification.dlq';

const SEARCH_INDEX_EXCHANGE = 'search_index_exchange';
const SEARCH_INDEX_QUEUE = 'search_index_queue';
const SEARCH_INDEX_ROUTING_KEY = 'search.index';

const SEARCH_RETRY_EXCHANGE = 'search_retry_exchange';
const SEARCH_RETRY_QUEUE = 'search_retry_queue';
const SEARCH_RETRY_ROUTING_KEY = 'search.retry';

const SEARCH_DEAD_LETTER_EXCHANGE = 'search_dlx';
const SEARCH_DEAD_LETTER_QUEUE = 'search_dlq';
const SEARCH_DEAD_LETTER_ROUTING_KEY = 'search.dlq';

let channel = null;

const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();


    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DEAD_LETTER_ROUTING_KEY);


    await channel.assertExchange(VERIFICATION_EXCHANGE, 'direct', { durable: true });


    try {
      await channel.assertQueue(VERIFICATION_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
          'x-dead-letter-routing-key': DEAD_LETTER_ROUTING_KEY,
        },
      });
    } catch (err) {
      if (err.code === 406) {
        console.warn(`Queue ${VERIFICATION_QUEUE} mismatch. Deleting and recreating...`);
        channel = await connection.createChannel();
        await channel.deleteQueue(VERIFICATION_QUEUE);
        await channel.assertQueue(VERIFICATION_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
            'x-dead-letter-routing-key': DEAD_LETTER_ROUTING_KEY,
          },
        });
      } else {
        throw err;
      }
    }
    await channel.bindQueue(VERIFICATION_QUEUE, VERIFICATION_EXCHANGE, VERIFICATION_ROUTING_KEY);


    await channel.assertExchange(RETRY_EXCHANGE, 'direct', { durable: true });


    try {
    await channel.assertQueue(RETRY_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': VERIFICATION_EXCHANGE,
        'x-dead-letter-routing-key': VERIFICATION_ROUTING_KEY,
      },
    });
    } catch (err) {
      if (err.code === 406) {
        console.warn(`Queue ${RETRY_QUEUE} mismatch. Deleting and recreating...`);
        channel = await connection.createChannel();
        await channel.deleteQueue(RETRY_QUEUE);
        await channel.assertQueue(RETRY_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': VERIFICATION_EXCHANGE,
            'x-dead-letter-routing-key': VERIFICATION_ROUTING_KEY,
          },
        });
      } else {
        throw err;
      }
    }
    await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, RETRY_ROUTING_KEY);

    await channel.assertExchange(SEARCH_DEAD_LETTER_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(SEARCH_DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(SEARCH_DEAD_LETTER_QUEUE, SEARCH_DEAD_LETTER_EXCHANGE, SEARCH_DEAD_LETTER_ROUTING_KEY);

    await channel.assertExchange(SEARCH_INDEX_EXCHANGE, 'direct', { durable: true });

    try {
      await channel.assertQueue(SEARCH_INDEX_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': SEARCH_DEAD_LETTER_EXCHANGE,
          'x-dead-letter-routing-key': SEARCH_DEAD_LETTER_ROUTING_KEY,
        },
      });
    } catch (err) {
      if (err.code === 406) {
        console.warn(`Queue ${SEARCH_INDEX_QUEUE} mismatch. Deleting and recreating...`);
        channel = await connection.createChannel();
        await channel.deleteQueue(SEARCH_INDEX_QUEUE);
        await channel.assertQueue(SEARCH_INDEX_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': SEARCH_DEAD_LETTER_EXCHANGE,
            'x-dead-letter-routing-key': SEARCH_DEAD_LETTER_ROUTING_KEY,
          },
        });
      } else {
        throw err;
      }
    }
    await channel.bindQueue(SEARCH_INDEX_QUEUE, SEARCH_INDEX_EXCHANGE, SEARCH_INDEX_ROUTING_KEY);

    await channel.assertExchange(SEARCH_RETRY_EXCHANGE, 'direct', { durable: true });

    try {
      await channel.assertQueue(SEARCH_RETRY_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': SEARCH_INDEX_EXCHANGE,
          'x-dead-letter-routing-key': SEARCH_INDEX_ROUTING_KEY,
        },
      });
    } catch (err) {
      if (err.code === 406) {
        console.warn(`Queue ${SEARCH_RETRY_QUEUE} mismatch. Deleting and recreating...`);
        channel = await connection.createChannel();
        await channel.deleteQueue(SEARCH_RETRY_QUEUE);
        await channel.assertQueue(SEARCH_RETRY_QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': SEARCH_INDEX_EXCHANGE,
            'x-dead-letter-routing-key': SEARCH_INDEX_ROUTING_KEY,
          },
        });
      } else {
        throw err;
      }
    }
    await channel.bindQueue(SEARCH_RETRY_QUEUE, SEARCH_RETRY_EXCHANGE, SEARCH_RETRY_ROUTING_KEY);

    console.log('Connected to RabbitMQ. Exchanges and Queues configured for Retry/DLQ.');
  } catch (error) {
    console.error('RabbitMQ connection error:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
};

const publishToQueue = (data, options = {}) => {
  if (!channel) {
    console.error('RabbitMQ channel is not available.');
    return;
  }
  
  channel.publish(
    VERIFICATION_EXCHANGE,
    VERIFICATION_ROUTING_KEY,
    Buffer.from(JSON.stringify(data)),
    { persistent: true, headers: options.headers || {} }
  );
};

const publishToRetryQueue = (data, delayMs, options = {}) => {
  if (!channel) {
    console.error('RabbitMQ channel is not available.');
    return;
  }

  channel.publish(
    RETRY_EXCHANGE,
    RETRY_ROUTING_KEY,
    Buffer.from(JSON.stringify(data)),
    { 
      persistent: true,
      expiration: delayMs.toString(),
      headers: options.headers || {},
    }
  );
};

const publishToSearchIndexQueue = (data, options = {}) => {
  if (!channel) {
    console.error('RabbitMQ channel is not available.');
    return;
  }

  channel.publish(
    SEARCH_INDEX_EXCHANGE,
    SEARCH_INDEX_ROUTING_KEY,
    Buffer.from(JSON.stringify(data)),
    { persistent: true, headers: options.headers || {} }
  );
};

const publishToSearchRetryQueue = (data, delayMs, options = {}) => {
  if (!channel) {
    console.error('RabbitMQ channel is not available.');
    return;
  }

  channel.publish(
    SEARCH_RETRY_EXCHANGE,
    SEARCH_RETRY_ROUTING_KEY,
    Buffer.from(JSON.stringify(data)),
    {
      persistent: true,
      expiration: delayMs.toString(),
      headers: options.headers || {},
    }
  );
};

module.exports = {
  connectRabbitMQ,
  publishToQueue,
  publishToRetryQueue,
  publishToSearchIndexQueue,
  publishToSearchRetryQueue,
  getChannel: () => channel,
  VERIFICATION_QUEUE,
  SEARCH_INDEX_QUEUE,
};
