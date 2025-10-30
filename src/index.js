const fastify = require('fastify');
const cors = require('@fastify/cors');
const fastifyJwt = require('@fastify/jwt');
const env = require('dotenv');
const chessRoutes = require('./routes/chess.routes');
const os = require('os');
const dbPlugin = require('./database');
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

// Register database plugin to decorate app with db and helpers
app.register(dbPlugin);
app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
});

app.register(require('@fastify/websocket'));

app.register(chessRoutes);

const start = async () => {
    try {
        await app.ready();
        app.ensureDefaultPlayers();
        const port = Number(process.env.PORT) || 9000;
        const host = process.env.HOST || '0.0.0.0';
        const addr = await app.listen({ port, host });
        app.log.info(`🚀 Server is running on ${addr}`);
        const nets = os.networkInterfaces();
        const urls = [];
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) {
                    urls.push(`ws://${net.address}:${port}/game/chess`);
                }
            }
        }
        if (urls.length) {
            app.log.info('🌐 LAN WebSocket endpoints:');
            urls.forEach((u) => app.log.info(`   → ${u}`));
        }
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();

module.exports = app;
