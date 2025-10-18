const fp = require('fastify-plugin');
const { chessHandler } = require('../controllers/chess');

const users = ['john', 'ilyass'];

const chessRoutes = async function (fastify) {
    fastify.get('/game/chess', { websocket: true }, chessHandler);
};

module.exports = fp(chessRoutes);
