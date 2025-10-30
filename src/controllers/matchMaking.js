const { v4: uuid } = require('uuid');
const send = require('../utils/send');
const { players, rooms } = require('../utils/state');

const matchmakingQueue = []; // {playerId, player socket}

function handleMatchmaking(playerId, connection) {
    if (matchmakingQueue.some((p) => p.playerId === playerId)) {
        console.log(`Player ${playerId} is already in the matchmaking queue.`);
        return;
    }

    matchmakingQueue.push({ playerId, connection });

    send(connection, {
        type: 'enterMatchmaking',
        gameOver: false,
    });

    if (matchmakingQueue.length >= 2) {
        const player1 = matchmakingQueue.shift();
        const player2 = matchmakingQueue.shift();

        createMatch(player1, player2);
    }
}

function createMatch(player1, player2) {
    const roomId = uuid();
    rooms[roomId] = {
        players: [
            {
                playerId: player1.playerId,
                connection: player1.connection,
                team: 'WHITE',
            },
            {
                playerId: player2.playerId,
                connection: player2.connection,
                team: 'BLACK',
            },
        ],
        board: null,
        currentTurn: 'WHITE',
        turns: 1,
        createdAt: Date.now(),
    };

    players.set(player1.playerId, { connection: player1.connection, roomId });
    players.set(player2.playerId, { connection: player2.connection, roomId });

    send(player1.connection, {
        type: 'gameStart',
        yourTeam: 'WHITE',
        opponentConnected: true,
        roomId,
    });

    send(player2.connection, {
        type: 'gameStart',
        yourTeam: 'BLACK',
        opponentConnected: true,
        roomId,
    });
}

function removeFromQueue(playerId) {
    const index = matchmakingQueue.findIndex((p) => p.playerId === playerId);
    if (index !== -1) matchmakingQueue.splice(index, 1);
}

module.exports = { handleMatchmaking, removeFromQueue };
