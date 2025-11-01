const send = require('../utils/send');
const { rooms, players } = require('../utils/state');

function syncBoard(playerId, board, currentTurn, turns, prevMove) {
    const player = players.get(playerId);
    if (!player || !player.roomId) return;

    const room = rooms[player.roomId];
    if (!room) return;

    room.board = board;
    room.currentTurn = currentTurn;
    room.turns = turns;

    const opponent = room.players.find((p) => p.playerId !== playerId);
    if (opponent) {
        send(opponent.connection, {
            type: 'syncBoard',
            board,
            currentTurn,
            turns,
            fromPlayer: playerId,
            prevMove,
        });
    }
}

module.exports = { syncBoard };
