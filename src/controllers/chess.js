const { v4: uuid } = require('uuid');
const { URL } = require('url');
const send = require('../utils/send');
const { handleMatchmaking, removeFromQueue } = require('./matchMaking');
const {
    players,
    rooms,
    lastOpponents,
    pendingRematches,
} = require('../utils/state');
const { syncBoard } = require('./syncBoard');
const { handleChat } = require('./chat');
const { handleDisconnect } = require('./handleDisconnection');
const { handleCheckmate } = require('./checkmate');
const {
    handleRematchRequest,
    handleRematchAccept,
    handleRematchDecline,
} = require('./rematch');

function chessHandler(connection, req) {
    const app = req.server;
    const clientIP = req.socket.remoteAddress;
    let desiredId = null;
    try {
        const u = new URL(req.url, 'http://localhost');
        desiredId = u.searchParams.get('playerId');
    } catch {}

    let playerId =
        desiredId && typeof desiredId === 'string' && desiredId.length <= 64
            ? desiredId
            : uuid();
    if (players.has(playerId)) {
        playerId = `${playerId}-dup-${uuid().slice(0, 8)}`;
    }

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

        handleMessage(app, playerId, msg);
    });

    connection.on('close', () => handleDisconnect(app, playerId));
}

function handleMessage(app, playerId, msg) {
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
        case 'checkmate':
            return handleCheckmate(app, playerId, msg.winner);
        case 'rematchRequest':
            return handleRematchRequest(playerId);
        case 'rematchAccept':
            return handleRematchAccept(playerId);
        case 'rematchDecline':
            return handleRematchDecline(playerId);
        default:
            console.log(`Unknown message type: ${type}`);
            const player = players.get(playerId);
            if (player)
                send(player.connection, {
                    type: 'error',
                    message: 'Unknown message type',
                });
    }
}

setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of Object.entries(rooms)) {
        if (room.players.length === 2) {
            const a = room.players[0].playerId;
            const b = room.players[1].playerId;
            lastOpponents.set(a, b);
            lastOpponents.set(b, a);
        }

        const inactive =
            room.players.length === 0 && now - room.createdAt > 600_000;
        if (inactive) {
            delete rooms[roomId];
            console.log(`🧹 Cleaned up inactive room ${roomId}`);
        }
    }
}, 600_000);

module.exports = { chessHandler };
