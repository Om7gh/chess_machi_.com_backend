const fastify = require('fastify');
const cors = require('@fastify/cors');
const fastifyJwt = require('@fastify/jwt');
const env = require('dotenv');
const chessRoutes = require('./routes/chess.routes');
const opt = {
    logger: {
        level: 'debug',
        transport: {
            target: 'pino-pretty',
        },
    },
};

env.configDotenv();

const app = fastify(opt);

app.register(cors, {
    origin: '*',
});

app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
});

app.register(require('@fastify/websocket'));

app.register(chessRoutes);

const start = async () => {
    try {
        const addr = await app.listen({ port: process.env.PORT });
        app.log.info(`🚀 Server is running on ${addr}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
