const { v4: uuid } = require('uuid');

const rooms = {};
const players = new Map();

function chessHandler(connection, req) {
    const playerId = uuid();
    players.set(playerId, { connection, roomId: null });

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
                syncBoard(
                    playerId,
                    message.board,
                    message.currentTurn,
                    message.turns
                );
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
    const roomId = generateRoomCode();
    const player = players.get(playerId);

    rooms[roomId] = {
        players: [
            {
                playerId,
                connection: player.connection,
                team: 'WHITE',
            },
        ],
        board: null,
        currentTurn: 'WHITE',
        turns: 0,
        status: 'waiting',
    };

    player.roomId = roomId;

    send(player.connection, {
        type: 'roomCreated',
        roomId,
        yourTeam: 'WHITE',
    });
}

function joinRoom(playerId, roomId) {
    const room = rooms[roomId];
    const player = players.get(playerId);

    if (!room) {
        send(player.connection, {
            type: 'error',
            message: 'Room not found',
        });
        return;
    }

    if (room.players.length >= 2) {
        send(player.connection, {
            type: 'error',
            message: 'Room is full',
        });
        return;
    }

    room.players.push({
        playerId,
        connection: player.connection,
        team: 'BLACK',
    });

    player.roomId = roomId;
    room.status = 'playing';

    console.log(`Player ${playerId} joined room ${roomId}`);

    broadcast(roomId, {
        type: 'gameStart',
        yourTeam: room.players.find((p) => p.playerId === playerId)?.team,
        opponentConnected: true,
    });

    if (room.board) {
        send(player.connection, {
            type: 'syncBoard',
            board: room.board,
            currentTurn: room.currentTurn,
            turns: room.turns,
        });
    }
}

function syncBoard(playerId, newBoard, currentTurn, turns) {
    const player = players.get(playerId);
    if (!player || !player.roomId) return;

    const room = rooms[player.roomId];
    if (!room) return;

    room.board = newBoard;
    room.currentTurn = currentTurn;
    room.turns = turns;

    console.log(`Board synced from player ${playerId}, turn: ${currentTurn}`);

    room.players.forEach((p) => {
        if (p.playerId !== playerId) {
            send(p.connection, {
                type: 'syncBoard',
                board: newBoard,
                currentTurn: currentTurn,
                turns: turns,
                fromPlayer: playerId,
            });
        }
    });
}

function handleChat(playerId, text) {
    const player = players.get(playerId);
    if (!player || !player.roomId) return;

    broadcast(player.roomId, {
        type: 'chatMessage',
        from: playerId,
        text: text,
        timestamp: new Date().toISOString(),
    });
}

function handleDisconnect(playerId) {
    const player = players.get(playerId);
    if (player && player.roomId && rooms[player.roomId]) {
        const room = rooms[player.roomId];
        room.players = room.players.filter((p) => p.playerId !== playerId);

        if (room.players.length > 0) {
            send(room.players[0].connection, {
                type: 'opponentDisconnected',
            });
        } else {
            delete rooms[player.roomId];
        }
    }
    players.delete(playerId);
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function send(connection, data) {
    if (connection.readyState === 1) {
        connection.send(JSON.stringify(data));
    }
}

function broadcast(roomId, data) {
    const room = rooms[roomId];
    if (!room) return;
    room.players.forEach((p) => send(p.connection, data));
}

module.exports = { chessHandler };
