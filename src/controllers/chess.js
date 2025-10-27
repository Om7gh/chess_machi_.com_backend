const { v4: uuid } = require('uuid');
const send = require('../utils/send');
const { handleMatchmaking, removeFromQueue } = require('./matchMaking');
const { players, rooms } = require('../utils/state');

function chessHandler(connection, req) {
    const clientIP = req.socket.remoteAddress;
    const playerId = uuid();

    players.set(playerId, { connection, roomId: null, ip: clientIP });
    console.log(`New connection [${playerId}] from ${clientIP}`);

    connection.on('message', (rawMsg) => {
        let msg;
        try {
            msg = JSON.parse(rawMsg);
        } catch {
            console.error('❌ Invalid JSON:', rawMsg);
            return send(connection, {
                type: 'error',
                message: 'Invalid JSON format',
            });
        }

        handleMessage(playerId, msg);
    });

    connection.on('close', () => handleDisconnect(playerId));
}

function handleMessage(playerId, msg) {
    const { type } = msg;
    switch (type) {
        case 'matchmaking':
            return handleMatchmaking(
                playerId,
                players.get(playerId).connection
            );
        case 'leaveMatchmaking':
            return removeFromQueue(playerId);
        case 'syncBoard':
            return syncBoard(playerId, msg.board, msg.currentTurn, msg.turns);
        case 'chat':
            return handleChat(playerId, msg.text);
        default:
            console.warn(`Unknown message type: ${type}`);
            const player = players.get(playerId);
            if (player)
                send(player.connection, {
                    type: 'error',
                    message: 'Unknown message type',
                });
    }
}

function syncBoard(playerId, board, currentTurn, turns) {
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
        });
    }
}

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

setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of Object.entries(rooms)) {
        const inactive =
            room.players.length === 0 && now - room.createdAt > 600_000;
        if (inactive) {
            delete rooms[roomId];
            console.log(`🧹 Cleaned up inactive room ${roomId}`);
        }
    }
}, 600_000);

module.exports = { chessHandler };
