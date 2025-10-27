const { players, rooms } = require('../utils/state');

function handleDisconnect(playerId) {
    const player = players.get(playerId);
    if (!player) return;

    const { roomId } = player;
    players.delete(playerId);

    removeFromQueue(playerId);

    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    room.players = room.players.filter((p) => p.playerId !== playerId);

    const opponent = room.players[0];
    if (opponent) {
        send(opponent.connection, { type: 'opponentDisconnected' });
    } else {
        delete rooms[roomId];
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
    }

    console.log(`❌ Player ${playerId} disconnected from room ${roomId}`);
}

module.exports = { handleDisconnect };
