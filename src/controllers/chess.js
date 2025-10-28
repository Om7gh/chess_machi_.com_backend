const { v4: uuid } = require('uuid');
const send = require('../utils/send');
const { handleMatchmaking, removeFromQueue } = require('./matchMaking');
const {
    players,
    rooms,
    lastOpponents,
    pendingRematches,
} = require('../utils/state');

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
        case 'checkmate':
            return handleCheckmate(playerId, msg.winner);
        case 'rematchRequest':
            return handleRematchRequest(playerId);
        case 'rematchAccept':
            return handleRematchAccept(playerId);
        case 'rematchDecline':
            return handleRematchDecline(playerId);
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

        setTimeout(() => {
            const isReconnected = room.players.some(
                (p) => p.playerId === playerId
            );

            if (!isReconnected) {
                send(opponent.connection, {
                    type: 'gameOver',
                    winner: opponent.playerId,
                    message: 'Opponent did not reconnect in time. You win!',
                });

                if (player.connection.readyState === 1) {
                    send(player.connection, {
                        type: 'gameOver',
                        winner: opponent.playerId,
                        message:
                            'You lost because you did not reconnect in time.',
                    });
                }

                delete rooms[roomId];
                console.log(
                    `🗑️ Room ${roomId} deleted (opponent did not reconnect)`
                );
                // Track last opponents for potential rematch
                lastOpponents.set(opponent.playerId, playerId);
                lastOpponents.set(playerId, opponent.playerId);
            }
        }, 15000);
    } else {
        delete rooms[roomId];
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
    }

    console.log(`❌ Player ${playerId} disconnected from room ${roomId}`);
}

function handleCheckmate(playerId, winnerTeam) {
    const player = players.get(playerId);
    if (!player || !player.roomId) return;

    const room = rooms[player.roomId];
    if (!room) return;

    // Validate winnerTeam and map to a consistent value
    const winner =
        winnerTeam === 'WHITE' || winnerTeam === 'BLACK' ? winnerTeam : 'DRAW';

    // Record rematch pairing before notifying/cleanup to avoid race conditions
    if (room.players.length === 2) {
        const a = room.players[0].playerId;
        const b = room.players[1].playerId;
        lastOpponents.set(a, b);
        lastOpponents.set(b, a);
        // also clear their room ids so they can start a fresh match
        const pa = players.get(a);
        const pb = players.get(b);
        if (pa) pa.roomId = null;
        if (pb) pb.roomId = null;
    }

    // Notify both players about game over
    for (const p of room.players) {
        send(p.connection, {
            type: 'gameOver',
            winner,
            message:
                winner === 'DRAW' ? 'Draw by stalemate/checkmate' : 'Checkmate',
        });
    }

    // Cleanup room after game over
    const rid = player.roomId;
    delete rooms[rid];
    console.log(
        `🏁 Room ${rid} ended due to checkmate (${winner}). Cleaned up.`
    );
}

setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of Object.entries(rooms)) {
        // Track last opponents for potential rematch
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

function startRematchBetween(aId, bId, requesterId) {
    const a = players.get(aId);
    const b = players.get(bId);
    if (!a || !b) return;
    const { v4: uuid } = require('uuid');
    const roomId = uuid();
    rooms[roomId] = {
        players: [
            { playerId: aId, connection: a.connection, team: 'WHITE' },
            { playerId: bId, connection: b.connection, team: 'BLACK' },
        ],
        board: null,
        currentTurn: 'WHITE',
        turns: 1,
        createdAt: Date.now(),
    };
    a.roomId = roomId;
    b.roomId = roomId;
    // Notify clients using the same payload shape as gameStart
    send(a.connection, {
        type: 'gameStart',
        yourTeam: 'WHITE',
        opponentConnected: true,
        roomId,
    });
    send(b.connection, {
        type: 'gameStart',
        yourTeam: 'BLACK',
        opponentConnected: true,
        roomId,
    });
}

function pairKeyOf(aId, bId) {
    return [aId, bId].sort().join(':');
}

function handleRematchRequest(playerId) {
    // Determine opponent: prefer lastOpponents mapping
    const opponentId = lastOpponents.get(playerId);
    if (!opponentId) return;
    const opp = players.get(opponentId);
    const me = players.get(playerId);
    if (!opp || !me) return;

    const key = pairKeyOf(playerId, opponentId);
    const existing = pendingRematches.get(key);
    if (existing && existing.requestedBy === opponentId) {
        // Opponent already requested; auto accept and start rematch
        pendingRematches.delete(key);
        startRematchBetween(playerId, opponentId, playerId);
        return;
    }
    // Store pending and notify opponent
    pendingRematches.set(key, {
        a: playerId,
        b: opponentId,
        requestedBy: playerId,
        ts: Date.now(),
    });
    send(opp.connection, { type: 'rematchOffer' });
    send(me.connection, { type: 'rematchPending' });
}

function handleRematchAccept(playerId) {
    const opponentId = lastOpponents.get(playerId);
    if (!opponentId) return;
    const key = pairKeyOf(playerId, opponentId);
    if (!pendingRematches.has(key)) {
        // opponent hasn't offered yet; treat as request
        return handleRematchRequest(playerId);
    }
    pendingRematches.delete(key);
    startRematchBetween(playerId, opponentId, playerId);
}

function handleRematchDecline(playerId) {
    const opponentId = lastOpponents.get(playerId);
    if (!opponentId) return;
    const key = pairKeyOf(playerId, opponentId);
    const opp = players.get(opponentId);
    pendingRematches.delete(key);
    if (opp) send(opp.connection, { type: 'rematchDeclined' });
}
