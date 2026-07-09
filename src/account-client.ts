import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { StringSession } from "telegram/sessions/index.js";
import { CustomFile } from "telegram/client/uploads.js";
import { readConfig } from "./config.ts";

export type TelegramProfile = {
  telegramUserId: string;
  displayName: string;
  username: string;
};

export type LoginStartResult = {
  sessionString: string;
  phoneCodeHash: string;
  codeDelivery: "telegram_app" | "sms";
};

export type LoginCodeResult =
  | { kind: "authorized"; sessionString: string; profile: TelegramProfile }
  | { kind: "password_required"; sessionString: string };

export type SendMessageInput = {
  recipient: string;
  message: string;
  mediaUrl?: string;
  mediaType?: string;
  firstName?: string;
  lastName?: string;
};

export type SentMessage = {
  recipient: string;
  messageId: string;
  sentAt: string;
};

export type IncomingTelegramMessage = {
  chatId: string;
  chatRef: string;
  senderId: string;
  senderRef: string;
  isPrivate: boolean;
  messageId: string;
  text: string;
  createdAt: string;
};

export type SyncedTelegramMessage = {
  direction: "inbound" | "outbound";
  recipient: string;
  messageId: string;
  text: string;
  createdAt: string;
};

export function normalizePhone(phone: string) {
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!normalized.startsWith("+") || normalized.length < 8) {
    throw new Error("Phone number must include country code, for example +919876543210.");
  }
  return normalized;
}

function createClient(sessionString = "") {
  const config = readConfig();
  return new TelegramClient(new StringSession(sessionString), config.telegramApiId, config.telegramApiHash, {
    connectionRetries: 5
  });
}

function saveSession(client: TelegramClient) {
  return client.session.save() as unknown as string;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "errorMessage" in error) {
    return String((error as { errorMessage: unknown }).errorMessage);
  }
  return error instanceof Error ? error.message : String(error);
}

function profileFromUser(user: Api.User): TelegramProfile {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    telegramUserId: user.id.toString(),
    displayName: displayName || user.username || "Telegram account",
    username: user.username ?? ""
  };
}

export async function beginTelegramLogin(phoneInput: string): Promise<LoginStartResult> {
  const phone = normalizePhone(phoneInput);
  const config = readConfig();
  const client = createClient();

  try {
    await client.connect();
    const result = await client.sendCode(
      { apiId: config.telegramApiId, apiHash: config.telegramApiHash },
      phone
    );
    return {
      sessionString: saveSession(client),
      phoneCodeHash: result.phoneCodeHash,
      codeDelivery: result.isCodeViaApp ? "telegram_app" : "sms"
    };
  } finally {
    await client.disconnect();
  }
}

export async function completeTelegramLoginWithCode(input: {
  sessionString: string;
  phone: string;
  phoneCodeHash: string;
  code: string;
}): Promise<LoginCodeResult> {
  const client = createClient(input.sessionString);

  try {
    await client.connect();
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: input.phone,
        phoneCodeHash: input.phoneCodeHash,
        phoneCode: input.code
      })
    );
    return { kind: "authorized", sessionString: saveSession(client), profile: profileFromUser(await client.getMe()) };
  } catch (error) {
    if (errorMessage(error).includes("SESSION_PASSWORD_NEEDED")) {
      return { kind: "password_required", sessionString: saveSession(client) };
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

export async function completeTelegramLoginWithPassword(sessionString: string, password: string) {
  const config = readConfig();
  const client = createClient(sessionString);

  try {
    await client.connect();
    await client.signInWithPassword(
      { apiId: config.telegramApiId, apiHash: config.telegramApiHash },
      {
        password: async () => password,
        onError: async (error) => {
          throw error;
        }
      }
    );
    return { sessionString: saveSession(client), profile: profileFromUser(await client.getMe()) };
  } finally {
    await client.disconnect();
  }
}

const TELEGRAM_TEXT_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;

function splitTelegramMessage(message: string) {
  const chunks: string[] = [];
  let remaining = message.trim();
  while (remaining.length > TELEGRAM_TEXT_LIMIT) {
    let splitAt = remaining.lastIndexOf("\n", TELEGRAM_TEXT_LIMIT);
    if (splitAt < TELEGRAM_TEXT_LIMIT * 0.6) splitAt = remaining.lastIndexOf(" ", TELEGRAM_TEXT_LIMIT);
    if (splitAt < 1) splitAt = TELEGRAM_TEXT_LIMIT;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitCaptionAndText(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return { caption: "", remaining: "" };
  if (trimmed.length <= TELEGRAM_CAPTION_LIMIT) return { caption: trimmed, remaining: "" };
  let splitAt = trimmed.lastIndexOf("\n", TELEGRAM_CAPTION_LIMIT);
  if (splitAt < TELEGRAM_CAPTION_LIMIT * 0.6) splitAt = trimmed.lastIndexOf(" ", TELEGRAM_CAPTION_LIMIT);
  if (splitAt < 1) splitAt = TELEGRAM_CAPTION_LIMIT;
  return {
    caption: trimmed.slice(0, splitAt).trim(),
    remaining: trimmed.slice(splitAt).trim()
  };
}

function extensionForMime(mimeType: string, mediaType = "") {
  const clean = mimeType.toLowerCase().split(";")[0].trim();
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "application/pdf": "pdf"
  };
  return known[clean] || (mediaType === "video" ? "mp4" : mediaType === "image" ? "jpg" : "bin");
}

function mediaFileFromUrl(mediaUrl: string, mediaType = "") {
  const trimmed = mediaUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const dataUrl = /^data:([^;,]+);base64,(.+)$/i.exec(trimmed);
  if (!dataUrl) {
    throw new Error("Media URL must be a direct http(s) URL or a base64 data URL.");
  }
  const mimeType = dataUrl[1];
  const buffer = Buffer.from(dataUrl[2], "base64");
  if (!buffer.length) throw new Error("Media data is empty.");
  return new CustomFile(`telegram-post.${extensionForMime(mimeType, mediaType)}`, buffer.length, "", buffer);
}

function shouldForceDocument(mediaType = "") {
  return ["document", "audio", "voice", "forwarded"].includes(mediaType);
}
function floodWaitSeconds(error: unknown) {
  if (error && typeof error === "object" && "seconds" in error) {
    const seconds = Number((error as { seconds: unknown }).seconds);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  const match = errorMessage(error).match(/wait of (\d+) seconds|FLOOD_WAIT_(\d+)/i);
  const seconds = Number(match?.[1] || match?.[2] || 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

async function inputEntityFromUser(client: TelegramClient, user: Api.User) {
  return client.getInputEntity(user);
}

async function resolveExistingPhoneContact(client: TelegramClient, phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  const lookups = [phone, phone.slice(1)];

  for (const lookup of lookups) {
    try {
      return await client.getInputEntity(lookup);
    } catch {
      // Try the next non-importing lookup before falling back to ResolvePhone.
    }
  }

  const resolved = await client.invoke(new Api.contacts.ResolvePhone({ phone: phone.slice(1) }));
  const users = "users" in resolved ? resolved.users : [];
  const user = users.find((item): item is Api.User => item instanceof Api.User);
  if (!user) throw new Error("Telegram could not resolve this phone number from existing contacts.");
  return inputEntityFromUser(client, user);
}

async function importPhoneContact(client: TelegramClient, input: SendMessageInput) {
  const phone = normalizePhone(input.recipient);
  const clientId = bigInt(Date.now()).multiply(1000).add(Math.floor(Math.random() * 1000));
  let result;
  try {
    result = await client.invoke(
      new Api.contacts.ImportContacts({
        contacts: [
          new Api.InputPhoneContact({
            clientId,
            phone: phone.slice(1),
            firstName: input.firstName?.trim() || "Telegram",
            lastName: input.lastName?.trim() || "Contact"
          })
        ]
      })
    );
  } catch (error) {
    const seconds = floodWaitSeconds(error);
    if (seconds) {
      throw new Error(`Telegram asked to wait ${seconds} seconds before importing this phone contact. Use the contact's @username if available, or try again after ${seconds} seconds.`);
    }
    throw error;
  }
  const imported = "imported" in result ? result.imported : [];
  const users = "users" in result ? result.users : [];
  const userId = imported[0]?.userId?.toString();
  const user = users.find(
    (item): item is Api.User => item instanceof Api.User && (!userId || item.id.toString() === userId)
  );

  if (!user) {
    throw new Error("Telegram could not resolve this phone number. It may be incorrect, private, or not on Telegram.");
  }

  return inputEntityFromUser(client, user);
}

async function resolveMessagePeer(client: TelegramClient, input: SendMessageInput, allowImport: boolean) {
  const recipient = input.recipient.trim();
  if (!recipient.startsWith("+")) {
    return client.getInputEntity(recipient.startsWith("@") ? recipient.slice(1) : recipient);
  }

  try {
    return await resolveExistingPhoneContact(client, recipient);
  } catch (error) {
    if (!allowImport) throw error;
  }

  return importPhoneContact(client, input);
}

export async function sendTelegramMessage(sessionString: string, input: SendMessageInput): Promise<SentMessage> {
  const recipient = input.recipient.trim();
  const message = input.message.trim();
  const mediaFile = mediaFileFromUrl(input.mediaUrl || "", input.mediaType || "");
  if (!recipient) throw new Error("Recipient is required.");
  if (!message && !mediaFile) throw new Error("Message or media is required.");

  const client = createClient(sessionString);
  try {
    await client.connect();
    await client.getMe();
    const peer = await resolveMessagePeer(client, input, true);
    const sentIds: string[] = [];
    const textChunks = mediaFile ? [] : splitTelegramMessage(message);
    if (mediaFile) {
      const { caption, remaining } = splitCaptionAndText(message);
      const sent = await client.sendFile(peer, {
        file: mediaFile,
        caption,
        forceDocument: shouldForceDocument(input.mediaType),
        supportsStreaming: input.mediaType === "video"
      });
      if (sent.id) sentIds.push(sent.id.toString());
      textChunks.push(...splitTelegramMessage(remaining));
    }
    for (const chunk of textChunks) {
      const sent = await client.sendMessage(peer, { message: chunk });
      if (sent.id) sentIds.push(sent.id.toString());
    }
    return { recipient, messageId: sentIds.join(","), sentAt: new Date().toISOString() };
  } finally {
    await client.disconnect();
  }
}

export async function revokeTelegramSession(sessionString: string) {
  const client = createClient(sessionString);
  try {
    await client.connect();
    await client.invoke(new Api.auth.LogOut());
  } finally {
    await client.disconnect();
  }
}

function userReferences(user: Api.User) {
  return [
    user.phone ? (user.phone.startsWith("+") ? user.phone : `+${user.phone}`) : "",
    user.username ? `@${user.username}` : "",
    user.id.toString()
  ].filter(Boolean);
}

function senderReference(sender: unknown) {
  return sender instanceof Api.User ? userReferences(sender).join(" ") : "";
}

function peerReference(peer: unknown) {
  if (peer instanceof Api.User) return senderReference(peer);
  if (peer instanceof Api.Channel) return [peer.username ? `@${peer.username}` : "", peer.id.toString()].filter(Boolean).join(" ");
  if (peer instanceof Api.Chat) return peer.id.toString();
  return "";
}

function telegramMessageDate(message: Api.Message) {
  const value = message.date;
  return typeof value === "number" ? new Date(value * 1000).toISOString() : new Date().toISOString();
}

function telegramMessageText(message: Api.Message) {
  return (message.message ?? "").trim();
}

export async function listenForAccount(
  sessionString: string,
  onIncomingMessage: (input: IncomingTelegramMessage) => Promise<void>
) {
  const client = createClient(sessionString);
  await client.connect();
  await client.getMe();
  client.addEventHandler(async (event: unknown) => {
    const message = (event as { message?: Api.Message }).message;
    if (!message || message.out) return;
    try {
      const sender = await message.getSender();
      const chat = await message.getChat().catch(() => null);
      const isPrivate = (message as { isPrivate?: boolean }).isPrivate !== false;
      await onIncomingMessage({
        chatId: message.chatId?.toString() ?? "",
        chatRef: peerReference(chat),
        senderId: sender instanceof Api.User ? sender.id.toString() : "",
        senderRef: senderReference(sender),
        isPrivate,
        messageId: message.id?.toString() ?? "",
        text: telegramMessageText(message),
        createdAt: telegramMessageDate(message)
      });
    } catch (error) {
      console.error(`Unable to save an incoming Telegram message: ${errorMessage(error)}`);
    }
  }, new NewMessage({ incoming: true }));
  return client;
}
async function resolveUserMessagePeer(client: TelegramClient, recipient: string) {
  const target = recipient.trim();
  if (!target) return null;
  try {
    if (target.startsWith("+")) {
      const peer = await resolveMessagePeer(client, { recipient: target, message: "sync" }, false);
      const entity = await client.getEntity(peer);
      return entity instanceof Api.User ? { peer, references: [target, ...userReferences(entity)] } : null;
    }

    const lookup = target.startsWith("@") ? target.slice(1) : target;
    const entity = await client.getEntity(lookup);
    if (!(entity instanceof Api.User)) return null;
    return { peer: await client.getInputEntity(entity), references: [target, ...userReferences(entity)] };
  } catch {
    return null;
  }
}

export async function fetchRecentTelegramMessages(sessionString: string, limit = 100, recipients: string[] = []): Promise<SyncedTelegramMessage[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const targets = [...new Set(recipients.map((recipient) => recipient.trim()).filter(Boolean))];
  if (!targets.length) return [];
  const perTargetLimit = Math.min(50, Math.max(10, Math.ceil(safeLimit / Math.max(targets.length, 1))));
  const client = createClient(sessionString);

  try {
    await client.connect();
    await client.getMe();
    const messages: SyncedTelegramMessage[] = [];

    for (const target of targets) {
      const resolved = await resolveUserMessagePeer(client, target);
      if (!resolved) continue;
      const recipientRef = [...new Set(resolved.references)].join(" ");
      const history = await client.getMessages(resolved.peer, { limit: perTargetLimit });
      for (const item of history) {
        if (!(item instanceof Api.Message)) continue;
        const text = telegramMessageText(item);
        if (!text) continue;
        const messageId = item.id?.toString() ?? "";
        if (!messageId) continue;
        messages.push({
          direction: item.out ? "outbound" : "inbound",
          recipient: recipientRef,
          messageId,
          text,
          createdAt: telegramMessageDate(item)
        });
      }
    }

    return messages
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, safeLimit);
  } finally {
    await client.disconnect();
  }
}
