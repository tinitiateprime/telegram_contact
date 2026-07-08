import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { SecretCipher } from "./crypto.js";

export type AppUser = { id: string; displayName: string };

export type TelegramAccount = {
  id: string;
  telegramUserId: string;
  displayName: string;
  username: string;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAccountWithSession = TelegramAccount & { sessionString: string };

export type LoginChallenge = {
  id: string;
  phone: string;
  phoneCodeHash: string;
  sessionString: string;
  status: "code_sent" | "password_required";
  expiresAt: string;
};

export type MessageRecord = {
  id: string;
  accountId: string;
  direction: "inbound" | "outbound";
  recipient: string;
  text: string;
  telegramMessageId: string;
  createdAt: string;
};

type MessageRecordInput = Omit<MessageRecord, "id" | "createdAt"> & { createdAt?: Date | string };

type MessageRow = {
  id: string;
  account_id: string;
  direction: "inbound" | "outbound";
  recipient_ciphertext: string;
  text_ciphertext: string;
  telegram_message_id: string;
  created_at: Date;
};

type AccountRow = {
  id: string;
  telegram_user_id: string;
  display_name: string;
  username: string | null;
  session_ciphertext: string;
  created_at: Date;
  updated_at: Date;
};

type ChallengeRow = {
  id: string;
  phone_ciphertext: string;
  phone_code_hash_ciphertext: string;
  session_ciphertext: string;
  status: "code_sent" | "password_required";
  expires_at: Date;
};

export class AccountAlreadyLinkedError extends Error {}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const asIso = (value: Date) => value.toISOString();

export class MultiUserStore {
  private readonly pool: Pool;
  private readonly cipher: SecretCipher;

  constructor(databaseUrl: string, sessionEncryptionKey: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.cipher = new SecretCipher(sessionEncryptionKey);
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY,
        display_name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        configured_login TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS configured_login TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS app_users_configured_login_idx ON app_users(configured_login);
      CREATE TABLE IF NOT EXISTS app_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id);
      CREATE INDEX IF NOT EXISTS app_sessions_expires_at_idx ON app_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS telegram_accounts (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        telegram_user_id TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        username TEXT,
        session_ciphertext TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS telegram_accounts_user_id_idx ON telegram_accounts(user_id);
      CREATE TABLE IF NOT EXISTS telegram_login_challenges (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        phone_ciphertext TEXT NOT NULL,
        phone_code_hash_ciphertext TEXT NOT NULL,
        session_ciphertext TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('code_sent', 'password_required')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS telegram_login_challenges_user_id_idx ON telegram_login_challenges(user_id);
      CREATE TABLE IF NOT EXISTS telegram_messages (
        id UUID PRIMARY KEY,
        account_id UUID NOT NULL REFERENCES telegram_accounts(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        recipient_ciphertext TEXT NOT NULL,
        text_ciphertext TEXT NOT NULL,
        telegram_message_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS telegram_messages_account_id_created_at_idx
        ON telegram_messages(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS telegram_messages_account_id_direction_message_id_idx
        ON telegram_messages(account_id, direction, telegram_message_id);
    `);
  }

  async close() {
    await this.pool.end();
  }

  async createUser(displayName: string) {
    const id = randomUUID();
    const accessToken = `tgr_${randomBytes(32).toString("base64url")}`;
    const user: AppUser = { id, displayName };
    await this.pool.query(
      "INSERT INTO app_users (id, display_name, token_hash) VALUES ($1, $2, $3)",
      [id, displayName, hashToken(accessToken)]
    );
    return { user, accessToken };
  }

  async findOrCreateConfiguredUser(loginId: string, displayName: string): Promise<AppUser> {
    const result = await this.pool.query<{ id: string; display_name: string }>(
      `INSERT INTO app_users (id, display_name, token_hash, configured_login)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (configured_login) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id, display_name`,
      [
        randomUUID(),
        displayName,
        hashToken(`configured-login:${randomBytes(32).toString("base64url")}`),
        loginId
      ]
    );
    const row = result.rows[0];
    return { id: row.id, displayName: row.display_name };
  }
  async findUserByAccessToken(accessToken: string): Promise<AppUser | null> {
    const result = await this.pool.query<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM app_users WHERE token_hash = $1",
      [hashToken(accessToken)]
    );
    const row = result.rows[0];
    return row ? { id: row.id, displayName: row.display_name } : null;
  }

  async createBrowserSession(accessToken: string, ttlHours: number) {
    const user = await this.findUserByAccessToken(accessToken);
    if (!user) return null;
    return this.createBrowserSessionForUser(user, ttlHours);
  }

  async createBrowserSessionForUser(user: AppUser, ttlHours: number) {
    const id = randomUUID();
    const sessionToken = `tgs_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60_000);
    await this.pool.query("DELETE FROM app_sessions WHERE expires_at <= NOW()");
    await this.pool.query(
      "INSERT INTO app_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
      [id, user.id, hashToken(sessionToken), expiresAt]
    );
    return { user, sessionToken, expiresAt: asIso(expiresAt) };
  }
  async findUserByBrowserSession(sessionToken: string): Promise<AppUser | null> {
    const result = await this.pool.query<{ id: string; display_name: string }>(
      `SELECT users.id, users.display_name
       FROM app_sessions AS sessions
       JOIN app_users AS users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
      [hashToken(sessionToken)]
    );
    const row = result.rows[0];
    return row ? { id: row.id, displayName: row.display_name } : null;
  }

  async deleteBrowserSession(sessionToken: string) {
    await this.pool.query("DELETE FROM app_sessions WHERE token_hash = $1", [hashToken(sessionToken)]);
  }
  async createLoginChallenge(
    userId: string,
    phone: string,
    phoneCodeHash: string,
    sessionString: string,
    ttlMinutes: number
  ) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    await this.pool.query("DELETE FROM telegram_login_challenges WHERE expires_at <= NOW() OR user_id = $1", [userId]);
    await this.pool.query(
      `INSERT INTO telegram_login_challenges
        (id, user_id, phone_ciphertext, phone_code_hash_ciphertext, session_ciphertext, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'code_sent', $6)`,
      [id, userId, this.cipher.encrypt(phone), this.cipher.encrypt(phoneCodeHash), this.cipher.encrypt(sessionString), expiresAt]
    );
    return { id, expiresAt: asIso(expiresAt) };
  }

  async getLoginChallenge(userId: string, challengeId: string): Promise<LoginChallenge | null> {
    const result = await this.pool.query<ChallengeRow>(
      `SELECT id, phone_ciphertext, phone_code_hash_ciphertext, session_ciphertext, status, expires_at
       FROM telegram_login_challenges WHERE id = $1 AND user_id = $2`,
      [challengeId, userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.expires_at.getTime() <= Date.now()) {
      await this.pool.query("DELETE FROM telegram_login_challenges WHERE id = $1", [challengeId]);
      return null;
    }
    return {
      id: row.id,
      phone: this.cipher.decrypt(row.phone_ciphertext),
      phoneCodeHash: this.cipher.decrypt(row.phone_code_hash_ciphertext),
      sessionString: this.cipher.decrypt(row.session_ciphertext),
      status: row.status,
      expiresAt: asIso(row.expires_at)
    };
  }

  async markPasswordRequired(userId: string, challengeId: string, sessionString: string) {
    await this.pool.query(
      `UPDATE telegram_login_challenges SET status = 'password_required', session_ciphertext = $1
       WHERE id = $2 AND user_id = $3`,
      [this.cipher.encrypt(sessionString), challengeId, userId]
    );
  }

  async deleteLoginChallenge(userId: string, challengeId: string) {
    await this.pool.query("DELETE FROM telegram_login_challenges WHERE id = $1 AND user_id = $2", [challengeId, userId]);
  }

  async saveTelegramAccount(
    userId: string,
    input: { telegramUserId: string; displayName: string; username: string; sessionString: string }
  ): Promise<TelegramAccount> {
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO telegram_accounts
        (id, user_id, telegram_user_id, display_name, username, session_ciphertext)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name, username = EXCLUDED.username,
         session_ciphertext = EXCLUDED.session_ciphertext, updated_at = NOW()
       WHERE telegram_accounts.user_id = EXCLUDED.user_id
       RETURNING id, telegram_user_id, display_name, username, session_ciphertext, created_at, updated_at`,
      [randomUUID(), userId, input.telegramUserId, input.displayName, input.username || null, this.cipher.encrypt(input.sessionString)]
    );
    const row = result.rows[0];
    if (!row) {
      throw new AccountAlreadyLinkedError("This Telegram account is already linked to another app user.");
    }
    return this.toAccount(row);
  }
  async listAccounts(userId: string): Promise<TelegramAccount[]> {
    const result = await this.pool.query<AccountRow>(
      `SELECT id, telegram_user_id, display_name, username, session_ciphertext, created_at, updated_at
       FROM telegram_accounts WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return result.rows.map((row) => this.toAccount(row));
  }

  async getAccountWithSession(userId: string, accountId: string): Promise<TelegramAccountWithSession | null> {
    const result = await this.pool.query<AccountRow>(
      `SELECT id, telegram_user_id, display_name, username, session_ciphertext, created_at, updated_at
       FROM telegram_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId]
    );
    return result.rows[0] ? this.toAccountWithSession(result.rows[0]) : null;
  }

  async getAllAccountsWithSessions(): Promise<TelegramAccountWithSession[]> {
    const result = await this.pool.query<AccountRow>(
      `SELECT id, telegram_user_id, display_name, username, session_ciphertext, created_at, updated_at
       FROM telegram_accounts ORDER BY created_at ASC`
    );
    return result.rows.map((row) => this.toAccountWithSession(row));
  }

  async deleteAccount(userId: string, accountId: string) {
    const account = await this.getAccountWithSession(userId, accountId);
    if (!account) return null;
    await this.pool.query("DELETE FROM telegram_accounts WHERE id = $1 AND user_id = $2", [accountId, userId]);
    return account;
  }

  async recordMessage(input: MessageRecordInput): Promise<MessageRecord> {
    const existing = await this.pool.query<MessageRow>(
      `SELECT id, account_id, direction, recipient_ciphertext, text_ciphertext, telegram_message_id, created_at
       FROM telegram_messages
       WHERE account_id = $1 AND direction = $2 AND telegram_message_id = $3
       ORDER BY created_at ASC LIMIT 25`,
      [input.accountId, input.direction, input.telegramMessageId]
    );
    const duplicate = existing.rows.find((row) => this.cipher.decrypt(row.recipient_ciphertext) === input.recipient);
    if (duplicate) return this.toMessageRecord(duplicate);

    const id = randomUUID();
    const createdAt = input.createdAt ? new Date(input.createdAt) : null;
    const createdAtParam = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : null;
    const result = await this.pool.query<MessageRow>(
      `INSERT INTO telegram_messages
        (id, account_id, direction, recipient_ciphertext, text_ciphertext, telegram_message_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
       RETURNING id, account_id, direction, recipient_ciphertext, text_ciphertext, telegram_message_id, created_at`,
      [
        id,
        input.accountId,
        input.direction,
        this.cipher.encrypt(input.recipient),
        this.cipher.encrypt(input.text),
        input.telegramMessageId,
        createdAtParam
      ]
    );
    return this.toMessageRecord(result.rows[0]);
  }
  async listMessages(userId: string, accountId: string, limit = 50): Promise<MessageRecord[]> {
    const result = await this.pool.query<MessageRow>(
      `SELECT messages.id, messages.account_id, messages.direction, messages.recipient_ciphertext,
              messages.text_ciphertext, messages.telegram_message_id, messages.created_at
       FROM telegram_messages AS messages
       JOIN telegram_accounts AS accounts ON accounts.id = messages.account_id
       WHERE messages.account_id = $1 AND accounts.user_id = $2
       ORDER BY messages.created_at DESC LIMIT $3`,
      [accountId, userId, Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows.map((row) => this.toMessageRecord(row));
  }
  private toAccount(row: AccountRow): TelegramAccount {
    return {
      id: row.id, telegramUserId: row.telegram_user_id, displayName: row.display_name,
      username: row.username ?? "", createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at)
    };
  }

  private toAccountWithSession(row: AccountRow): TelegramAccountWithSession {
    return { ...this.toAccount(row), sessionString: this.cipher.decrypt(row.session_ciphertext) };
  }

  private toMessageRecord(row: MessageRow): MessageRecord {
    return {
      id: row.id,
      accountId: row.account_id,
      direction: row.direction,
      recipient: this.cipher.decrypt(row.recipient_ciphertext),
      text: this.cipher.decrypt(row.text_ciphertext),
      telegramMessageId: row.telegram_message_id,
      createdAt: asIso(row.created_at)
    };
  }
}
