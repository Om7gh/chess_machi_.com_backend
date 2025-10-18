const { v4: uuid } = require('uuid');

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

function createRoom(playerId) {}

module.exports = { chessHandler };
