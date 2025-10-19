const { v4: uuid } = require('uuid');
const send = require('../utils/send');

const rooms = {};
const players = new Map();

function chessHandler(connection, req) {
    const clientIP = req.socket.remoteAddress;
    console.log(`New connection from: ${clientIP}`);

    const playerId = uuid();
    players.set(playerId, { connection, roomId: null, ip: clientIP });

    console.log(`New connection: ${playerId}`);
    connection.on('message', (msg) => {
        let message;
        try {
            message = JSON.parse(msg);
        } catch (err) {
            console.error('Invalid JSON message:', msg);
            return;
        }

        switch (message.type) {
            case 'create':
                createRoom(playerId);
                break;
            case 'join':
                joinRoom(playerId, message.roomId);
                break;
            case 'syncBoard':
                syncBoard(playerId, message.board, currentTurn, turns);
                break;
            case 'chat':
                handleChat(playerId, message.text);
                break;
        }
    });

    connection.on('close', () => {
        handleDisconnect(playerId);
    });
}

function createRoom(playerId) {
    const player = players.get(playerId);
    if (!player) {
        console.error('createRoom: player not found');
        return;
    }
    const roomId = uuid();
    rooms[roomId] = {
        players: [{ playerId, connection: player.connection }],
        board: null,
        createdAt: Date.now(),
    };
    player.roomId = roomId;
    console.log(`Room created: ${roomId} by player ${playerId}`);

    send(player.connection, {
        type: 'roomCreated',
        roomId,
        message:
            'Room successfully created. Share this ID to invite another player.',
    });
}

function joinRoom(playerId, roomId) {
    const player = players.get(playerId);
    if (!player) {
        console.error('joinRoom: player not found');
        return;
    }

    const room = rooms[roomId];
    if (!room) {
        send(player.connection, { type: 'error', message: 'Room not found.' });
        return;
    }

    if (room.players.length >= 2) {
        send(player.connection, { type: 'error', message: 'Room is full.' });
        return;
    }

    const opponent = room.players[0];
    room.players.push({
        playerId,
        connection: player.connection,
        team: 'BLACK',
    });
    player.roomId = roomId;

    console.log(`Player ${playerId} joined room ${roomId}`);

    send(player.connection, {
        type: 'gameStart',
        yourTeam: 'BLACK',
        opponentConnected: true,
    });

    send(opponent.connection, {
        type: 'gameStart',
        yourTeam: 'WHITE',
        opponentConnected: true,
    });
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

function handleChat(playerId, text) {}

function handleDisconnect(playerId) {}

module.exports = { chessHandler };
