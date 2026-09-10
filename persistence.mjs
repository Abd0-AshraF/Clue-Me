import { Pool } from "./postgres-driver.mjs";

function entriesOf(value) {
  return value instanceof Map ? [...value.entries()] : [];
}

function safeEntries(value) {
  return Array.isArray(value) ? value : [];
}

export function capturePersistentState(roomStore, gameStore, authStore, adminStore) {
  return {
    version: 1,
    auth: {
      users: entriesOf(authStore.users),
      sessions: entriesOf(authStore.sessions),
      adminSeeded: Boolean(authStore.adminSeeded)
    },
    admin: {
      reports: adminStore.reports,
      audit: adminStore.audit,
      reportId: adminStore.reportId,
      auditId: adminStore.auditId,
      addedWords: adminStore.addedWords,
      disabledLibrary: [...adminStore.disabledLibrary],
      disabledCustom: [...adminStore.disabledCustom],
      mutedAccounts: [...adminStore.mutedAccounts],
      bannedAccounts: [...adminStore.bannedAccounts]
    },
    rooms: {
      rooms: entriesOf(roomStore.rooms),
      accountIds: entriesOf(roomStore.accountIds),
      activityRooms: entriesOf(roomStore.activityRooms),
      restrictions: entriesOf(roomStore.restrictions)
    },
    games: {
      games: entriesOf(gameStore.games),
      pointers: entriesOf(gameStore.pointers).map(([code, playerPointers]) => [code, entriesOf(playerPointers)]),
      events: entriesOf(gameStore.events),
      eventSeq: entriesOf(gameStore.eventSeq),
      chats: entriesOf(gameStore.chats),
      chatIds: entriesOf(gameStore.chatIds)
    }
  };
}

export function restorePersistentState(state, roomStore, gameStore, authStore, adminStore) {
  if (!state || state.version !== 1) return false;
  const auth = state.auth ?? {};
  authStore.users = new Map(safeEntries(auth.users));
  authStore.sessions = new Map(safeEntries(auth.sessions));
  authStore.adminSeeded = Boolean(auth.adminSeeded);
  if (typeof authStore.sweepSessions === "function") {
    authStore.sweepSessions();
  }

  const admin = state.admin ?? {};
  adminStore.reports = Array.isArray(admin.reports) ? admin.reports : [];
  adminStore.audit = Array.isArray(admin.audit) ? admin.audit : [];
  adminStore.reportId = Number.isInteger(admin.reportId) ? admin.reportId : adminStore.reports.length;
  adminStore.auditId = Number.isInteger(admin.auditId) ? admin.auditId : adminStore.audit.length;
  adminStore.addedWords = Array.isArray(admin.addedWords) ? admin.addedWords : [];
  adminStore.disabledLibrary = new Set(Array.isArray(admin.disabledLibrary) ? admin.disabledLibrary : []);
  adminStore.disabledCustom = new Set(Array.isArray(admin.disabledCustom) ? admin.disabledCustom : []);
  adminStore.mutedAccounts = new Set(Array.isArray(admin.mutedAccounts) ? admin.mutedAccounts : []);
  adminStore.bannedAccounts = new Set(Array.isArray(admin.bannedAccounts) ? admin.bannedAccounts : []);

  const rooms = state.rooms ?? {};
  roomStore.rooms = new Map(safeEntries(rooms.rooms));
  roomStore.accountIds = new Map(safeEntries(rooms.accountIds));
  roomStore.activityRooms = new Map(safeEntries(rooms.activityRooms));
  roomStore.restrictions = new Map(safeEntries(rooms.restrictions));
  if (typeof roomStore.sweep === "function") {
    roomStore.sweep();
  }

  const games = state.games ?? {};
  gameStore.games = new Map(safeEntries(games.games));
  gameStore.pointers = new Map(
    safeEntries(games.pointers).map(([code, playerPointers]) => [code, new Map(safeEntries(playerPointers))])
  );
  gameStore.events = new Map(safeEntries(games.events));
  gameStore.eventSeq = new Map(safeEntries(games.eventSeq));
  gameStore.chats = new Map(safeEntries(games.chats));
  gameStore.chatIds = new Map(safeEntries(games.chatIds));
  return true;
}

export async function createPostgresPersistence(databaseUrl) {
  const sslEnabled = process.env.DATABASE_SSL !== "false";
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    max: 4,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });

  pool.on("error", (err) => console.error("[database] idle client error:", err));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clue_me_state (
      state_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let lastJson = null;
  let writeQueue = Promise.resolve();

  return {
    async load() {
      const result = await pool.query("SELECT payload FROM clue_me_state WHERE state_key = $1", ["main"]);
      const state = result.rows[0]?.payload ?? null;
      if (state) lastJson = JSON.stringify(state);
      return state;
    },
    save(state, force = false) {
      const json = JSON.stringify(state);
      if (!force && json === lastJson) return writeQueue;
      lastJson = json;
      writeQueue = writeQueue.then(async () => {
        try {
          await pool.query(
            `INSERT INTO clue_me_state (state_key, payload, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (state_key)
             DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
            ["main", json]
          );
        } catch (err) {
          lastJson = null;
          console.error("[database] save failed:", err);
        }
      });
      return writeQueue;
    },
    async close() {
      await writeQueue;
      await pool.end();
    }
  };
}
