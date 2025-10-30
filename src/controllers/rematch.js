const send = require('../utils/send');
const { players, rooms, lastOpponents } = require('../utils/state');

function startRematchBetween(aId, bId, requesterId) {
    const a = players.get(aId);
    const b = players.get(bId);
    if (!a || !b) return;
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
    const opponentId = lastOpponents.get(playerId);
    if (!opponentId) return;
    const opp = players.get(opponentId);
    const me = players.get(playerId);
    if (!opp || !me) return;

    const key = pairKeyOf(playerId, opponentId);
    const existing = pendingRematches.get(key);
    if (existing && existing.requestedBy === opponentId) {
        pendingRematches.delete(key);
        startRematchBetween(playerId, opponentId, playerId);
        return;
    }
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

module.exports = {
    handleRematchAccept,
    handleRematchDecline,
    handleRematchRequest,
};
