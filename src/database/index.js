const fp = require('fastify-plugin');
const Database = require('better-sqlite3');

async function dbPlugin(fastify) {
    const db = new Database('./chess.sqlite');
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            username TEXT,
            avatar TEXT,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT,
            white_player_id TEXT NOT NULL,
            black_player_id TEXT NOT NULL,
            winner_team TEXT CHECK (winner_team IN ('WHITE','BLACK','DRAW')),
            reason TEXT,
            moves INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER,
            ended_at INTEGER,
            duration_ms INTEGER,
            FOREIGN KEY (white_player_id) REFERENCES players(id),
            FOREIGN KEY (black_player_id) REFERENCES players(id)
        );
    `);

    fastify.decorate('db', db);

    fastify.decorate(
        'upsertPlayer',
        function (id, username = null, avatar = null) {
            const existing = db
                .prepare('SELECT id FROM players WHERE id = ?')
                .get(id);
            if (existing) return id;
            db.prepare(
                'INSERT INTO players (id, username, avatar) VALUES (?,?,?)'
            ).run(id, username, avatar);
            return id;
        }
    );

    fastify.decorate('ensureDefaultPlayers', function () {
        try {
            fastify.upsertPlayer('test-white', 'Test White', null);
            fastify.upsertPlayer('test-black', 'Test Black', null);
        } catch (e) {
            fastify.log.error('Failed to ensure default players:', e);
        }
    });

    fastify.decorate(
        'recordGame',
        function ({
            roomId,
            whiteId,
            blackId,
            winnerTeam,
            reason,
            moves = 0,
            startedAt = null,
            endedAt = null,
        }) {
            if (!whiteId || !blackId) {
                throw new Error('recordGame requires both whiteId and blackId');
            }
            fastify.upsertPlayer(whiteId);
            fastify.upsertPlayer(blackId);

            const ended = endedAt ?? Math.floor(Date.now() / 1000);
            const started = startedAt ? Math.floor(startedAt / 1000) : null;
            const durationMs = startedAt ? Date.now() - startedAt : null;

            db.prepare(
                `INSERT INTO games (
                room_id, white_player_id, black_player_id,
                winner_team, reason, moves, started_at, ended_at, duration_ms
            ) VALUES (?,?,?,?,?,?,?,?,?)`
            ).run(
                roomId ?? null,
                whiteId,
                blackId,
                winnerTeam ?? null,
                reason ?? null,
                moves ?? 0,
                started,
                ended,
                durationMs
            );
        }
    );

    fastify.addHook('onClose', (instance, done) => {
        try {
            db.close();
        } catch {}
        done();
    });
}

module.exports = fp(dbPlugin, { name: 'db' });
