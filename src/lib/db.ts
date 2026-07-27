/**
 * SQLite 数据层 - 三张表：users / sessions / messages
 * 用原生 better-sqlite3 同步 API，Next.js server 侧使用。
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { UIMessage } from 'ai';

// ---------- 初始化 ----------

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'chat.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// 用 globalThis 缓存，防止 Next.js dev 热重载重复打开
declare global {
    var __chatDb: Database.Database | undefined;
}

const db =
    globalThis.__chatDb ??
    (() => {
        const instance = new Database(DB_PATH);
        instance.pragma('journal_mode = WAL');
        instance.pragma('foreign_keys = ON');

        instance.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id            TEXT PRIMARY KEY CHECK(length(id) > 0),
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at    INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id         TEXT PRIMARY KEY CHECK(length(id) > 0),
                user_id    TEXT NOT NULL CHECK(length(user_id) > 0),
                title      TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
                ON sessions(user_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS messages (
                id         TEXT PRIMARY KEY CHECK(length(id) > 0),
                session_id TEXT NOT NULL CHECK(length(session_id) > 0),
                role       TEXT NOT NULL,
                parts      TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session
                ON messages(session_id, created_at);
        `);

        // ---------- 迁移：给已存在的旧表补上 CHECK(length(id) > 0) ----------
        // SQLite 不支持 ALTER TABLE ADD CONSTRAINT，只能建新表 → 拷贝 → 换名。
        // 用 sqlite_master.sql 中是否含 'CHECK(length(id)' 作为幂等判据。
        migrateAddIdCheck(instance);

        return instance;
    })();

/**
 * 一次性迁移：给旧库的 users/sessions/messages 表补上 id CHECK 约束。
 * 已带约束时直接跳过；不会重复执行。
 */
function migrateAddIdCheck(instance: Database.Database): void {
    const tables: Array<{
        name: string;
        newSql: string;
        columns: string;
    }> = [
        {
            name: 'users',
            newSql: `CREATE TABLE users_new (
                id            TEXT PRIMARY KEY CHECK(length(id) > 0),
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at    INTEGER NOT NULL
            )`,
            columns: 'id, username, password_hash, created_at',
        },
        {
            name: 'sessions',
            newSql: `CREATE TABLE sessions_new (
                id         TEXT PRIMARY KEY CHECK(length(id) > 0),
                user_id    TEXT NOT NULL CHECK(length(user_id) > 0),
                title      TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            columns: 'id, user_id, title, created_at, updated_at',
        },
        {
            name: 'messages',
            newSql: `CREATE TABLE messages_new (
                id         TEXT PRIMARY KEY CHECK(length(id) > 0),
                session_id TEXT NOT NULL CHECK(length(session_id) > 0),
                role       TEXT NOT NULL,
                parts      TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )`,
            columns: 'id, session_id, role, parts, created_at',
        },
    ];

    for (const t of tables) {
        const row = instance
            .prepare(
                `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`
            )
            .get(t.name) as { sql: string } | undefined;

        // 表不存在（首次运行），CREATE TABLE IF NOT EXISTS 已经建好带 CHECK 的表，跳过。
        if (!row) continue;
        // 已含 CHECK(length(id)，说明是新建或已迁移过，跳过。
        if (row.sql.includes('CHECK(length(id)')) continue;

        // 迁移前先清一遍脏数据，避免拷贝时被 CHECK 拒。
        instance.exec(`DELETE FROM ${t.name} WHERE id IS NULL OR length(id) = 0;`);

        const tx = instance.transaction(() => {
            instance.exec(t.newSql);
            instance.exec(
                `INSERT INTO ${t.name}_new (${t.columns}) SELECT ${t.columns} FROM ${t.name};`
            );
            instance.exec(`DROP TABLE ${t.name};`);
            instance.exec(`ALTER TABLE ${t.name}_new RENAME TO ${t.name};`);
        });
        tx();
    }

    // 索引在 DROP TABLE 时会一起消失，重建一遍（IF NOT EXISTS 幂等）。
    instance.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
            ON sessions(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_session
            ON messages(session_id, created_at);
    `);
}

if (process.env.NODE_ENV !== 'production') globalThis.__chatDb = db;

export { db };

// ---------- 类型 ----------

export type DbUser = {
    id: string;
    username: string;
    password_hash: string;
    created_at: number;
};

export type DbSession = {
    id: string;
    user_id: string;
    title: string;
    created_at: number;
    updated_at: number;
};

export type DbMessage = {
    id: string;
    session_id: string;
    role: string;
    parts: string; // JSON
    created_at: number;
};

const genId = (): string => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

// ---------- Users ----------

export const usersRepo = {
    findByUsername(username: string): DbUser | undefined {
        return db
            .prepare('SELECT * FROM users WHERE username = ?')
            .get(username) as DbUser | undefined;
    },

    findById(id: string): DbUser | undefined {
        return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
    },

    create(username: string, passwordHash: string): DbUser {
        const user: DbUser = {
            id: genId(),
            username,
            password_hash: passwordHash,
            created_at: Date.now(),
        };
        db.prepare(
            'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
        ).run(user.id, user.username, user.password_hash, user.created_at);
        return user;
    },
};

// ---------- Sessions ----------

export type SessionSummary = {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
};

export const sessionsRepo = {
    listByUser(userId: string): SessionSummary[] {
        const rows = db
            .prepare(
                'SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM sessions WHERE user_id = ? ORDER BY updated_at DESC'
            )
            .all(userId) as SessionSummary[];
        return rows;
    },

    get(id: string, userId: string): DbSession | undefined {
        return db
            .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
            .get(id, userId) as DbSession | undefined;
    },

    create(userId: string, title = '新对话'): DbSession {
        const now = Date.now();
        const session: DbSession = {
            id: genId(),
            user_id: userId,
            title,
            created_at: now,
            updated_at: now,
        };
        db.prepare(
            'INSERT INTO sessions (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(session.id, session.user_id, session.title, session.created_at, session.updated_at);
        return session;
    },

    updateTitle(id: string, userId: string, title: string): void {
        db.prepare(
            'UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?'
        ).run(title, Date.now(), id, userId);
    },

    touch(id: string): void {
        db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
    },

    remove(id: string, userId: string): void {
        db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(id, userId);
    },
};

// ---------- Messages ----------

export const messagesRepo = {
    listBySession(sessionId: string): UIMessage[] {
        const rows = db
            .prepare(
                'SELECT id, role, parts FROM messages WHERE session_id = ? ORDER BY created_at ASC'
            )
            .all(sessionId) as { id: string; role: string; parts: string }[];

        return rows.map((r) => ({
            id: r.id,
            role: r.role as UIMessage['role'],
            parts: JSON.parse(r.parts),
        })) as UIMessage[];
    },

    upsert(sessionId: string, message: UIMessage): void {
        // 兜底：绝不允许空/未定义的 id 作为主键，否则会互相覆盖。
        const id = message.id && message.id.length > 0 ? message.id : genId();
        db.prepare(
            `INSERT INTO messages (id, session_id, role, parts, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                role = excluded.role,
                parts = excluded.parts`
        ).run(
            id,
            sessionId,
            message.role,
            JSON.stringify(message.parts ?? []),
            Date.now()
        );
    },

    replaceAll(sessionId: string, messages: UIMessage[]): void {
        const tx = db.transaction((msgs: UIMessage[]) => {
            db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
            const stmt = db.prepare(
                'INSERT INTO messages (id, session_id, role, parts, created_at) VALUES (?, ?, ?, ?, ?)'
            );
            let ts = Date.now();
            for (const m of msgs) {
                const id = m.id && m.id.length > 0 ? m.id : genId();
                stmt.run(id, sessionId, m.role, JSON.stringify(m.parts ?? []), ts++);
            }
        });
        tx(messages);
    },
};
