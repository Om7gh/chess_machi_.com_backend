const rooms = {};
const players = new Map();
// Track last opponent per playerId to enable direct rematch offers after a game
const lastOpponents = new Map(); // playerId -> opponentId
// Optional: track pending rematch offers between pairs (pairKey = a:b)
const pendingRematches = new Map(); // pairKey -> { a, b, requestedBy, ts }

module.exports = { rooms, players, lastOpponents, pendingRematches };
