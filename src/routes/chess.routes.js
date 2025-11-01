const fp = require('fastify-plugin');
const { chessHandler } = require('../controllers/chess');
const { gameHistory } = require('../controllers/gameHistory');

const chessRoutes = async function (fastify) {
    fastify.get('/game/chess', { websocket: true }, chessHandler);
    fastify.get('/game/chess/history', gameHistory);
};

module.exports = fp(chessRoutes);
