const send = require('../utils/send');
const { rooms, players, lastOpponents } = require('../utils/state');
const { removeFromQueue } = require('./matchMaking');

function handleDisconnect(app, playerId) {
    const player = players.get(playerId);
    if (!player) return;

    const { roomId } = player;
    players.delete(playerId);

    removeFromQueue(playerId);

    if (!roomId) return;

    const room = rooms[roomId];
    if (!room) return;

    const whiteIdSnapshot =
        room.players.find((p) => p.team === 'WHITE')?.playerId || null;
    const blackIdSnapshot =
        room.players.find((p) => p.team === 'BLACK')?.playerId || null;

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

                try {
                    const winnerTeam =
                        whiteIdSnapshot && whiteIdSnapshot === opponent.playerId
                            ? 'WHITE'
                            : 'BLACK';
                    if (!whiteIdSnapshot || !blackIdSnapshot) {
                        console.warn(
                            'Skipping recordGame: missing player ids',
                            { whiteIdSnapshot, blackIdSnapshot }
                        );
                    } else {
                        app.recordGame({
                            roomId,
                            whiteId: whiteIdSnapshot,
                            blackId: blackIdSnapshot,
                            winnerTeam,
                            reason: 'disconnect',
                            moves: room.turns ?? 0,
                            startedAt: room.createdAt ?? null,
                            endedAt: Math.floor(Date.now() / 1000),
                        });
                    }
                } catch (e) {
                    console.error('Failed to record game (disconnect):', e);
                }

                delete rooms[roomId];
                console.log(
                    `🗑️ Room ${roomId} deleted (opponent did not reconnect)`
                );
                if (whiteIdSnapshot && blackIdSnapshot) {
                    lastOpponents.set(whiteIdSnapshot, blackIdSnapshot);
                    lastOpponents.set(blackIdSnapshot, whiteIdSnapshot);
                } else {
                    lastOpponents.set(opponent.playerId, playerId);
                    lastOpponents.set(playerId, opponent.playerId);
                }
            }
        }, 15000);
    } else {
        delete rooms[roomId];
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
    }

    console.log(`❌ Player ${playerId} disconnected from room ${roomId}`);
}

module.exports = { handleDisconnect };
