const send = require('../utils/send');
const { rooms, players } = require('../utils/state');

function handleChat(playerId, text) {
    const player = players.get(playerId);
    if (!player || !player.roomId) return;

    const room = rooms[player.roomId];
    if (!room) return;

    const opponent = room.players.find((p) => p.playerId !== playerId);
    if (opponent) {
        send(opponent.connection, {
            type: 'chatMessage',
            from: playerId,
            text,
            timestamp: Date.now(),
        });
    }
}

module.exports = { handleChat };
