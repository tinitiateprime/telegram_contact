import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readBotConfig, type BotConfig } from "./config.ts";

type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type BotIdentity = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

type BotAnswerRule = {
  keywords: string[];
  answer: string;
};

type RuntimeState = {
  answerRules: BotAnswerRule[];
};

type IncomingBotQuestion = {
  chatId: number;
  messageId: number;
  userId: number;
  username: string;
  displayName: string;
  text: string;
};

let stopping = false;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function publicError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+@\s]/g, " ").replace(/\s+/g, " ").trim();
}

function displayName(user?: TelegramUser) {
  if (!user) return "Telegram user";
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || `user ${user.id}`;
}

function commandFromText(text: string) {
  const match = /^\/([a-z0-9_]+)(?:@\w+)?(?:\s+|$)/i.exec(text.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

function splitTelegramText(text: string) {
  const limit = 4096;
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < limit * 0.6) splitAt = remaining.lastIndexOf(" ", limit);
    if (splitAt < 1) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function readAnswerRules(answerPath: string): BotAnswerRule[] {
  const resolved = path.isAbsolute(answerPath) ? answerPath : path.join(process.cwd(), answerPath);
  if (!existsSync(resolved)) return [];

  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  const rawRules = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) && Array.isArray(parsed.answers)
      ? parsed.answers
      : [];

  return rawRules.flatMap((item): BotAnswerRule[] => {
    if (!isObject(item)) return [];
    const answer = typeof item.answer === "string" ? item.answer.trim() : "";
    const keywords = Array.isArray(item.keywords)
      ? item.keywords.filter((keyword): keyword is string => typeof keyword === "string").map((keyword) => keyword.trim()).filter(Boolean)
      : [];
    return answer && keywords.length ? [{ answer, keywords }] : [];
  });
}

async function callBotApi<T>(config: BotConfig, method: string, body: Record<string, unknown>, timeoutMs = 15_000) {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = (await response.json().catch(() => null)) as TelegramApiResponse<T> | null;
  if (!response.ok || !payload?.ok) {
    const description = payload && !payload.ok ? payload.description : `HTTP ${response.status}`;
    throw new Error(`${method} failed: ${description || "Telegram Bot API rejected the request."}`);
  }
  return payload.result;
}

async function sendReply(config: BotConfig, chatId: number, text: string, replyToMessageId?: number) {
  const chunks = splitTelegramText(text || config.botFallbackReply);
  for (const [index, chunk] of chunks.entries()) {
    await callBotApi(config, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      reply_to_message_id: index === 0 ? replyToMessageId : undefined
    });
  }
}

async function sendTyping(config: BotConfig, chatId: number) {
  try {
    await callBotApi(config, "sendChatAction", { chat_id: chatId, action: "typing" }, 8_000);
  } catch {
    // Typing indicators are best effort only.
  }
}

function findSavedAnswer(rules: BotAnswerRule[], question: string) {
  const normalizedQuestion = normalizeText(question);
  for (const rule of rules) {
    const matched = rule.keywords.some((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      return normalizedKeyword && normalizedQuestion.includes(normalizedKeyword);
    });
    if (matched) return rule.answer;
  }
  return "";
}

async function askResponder(config: BotConfig, question: IncomingBotQuestion) {
  if (!config.botResponderUrl) return "";

  const response = await fetch(config.botResponderUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(question),
    signal: AbortSignal.timeout(config.botResponderTimeoutSeconds * 1000)
  });
  if (!response.ok) throw new Error(`Responder returned HTTP ${response.status}.`);

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!isObject(payload)) return "";
  const reply = typeof payload.reply === "string" ? payload.reply : typeof payload.answer === "string" ? payload.answer : "";
  return reply.trim();
}

async function answerQuestion(config: BotConfig, state: RuntimeState, question: IncomingBotQuestion) {
  try {
    const responderReply = await askResponder(config, question);
    if (responderReply) return responderReply;
  } catch (error) {
    console.error(`Bot responder failed: ${publicError(error)}`);
  }

  const savedAnswer = findSavedAnswer(state.answerRules, question.text);
  return savedAnswer || config.botFallbackReply.replaceAll("{question}", question.text);
}

async function handleMessage(config: BotConfig, state: RuntimeState, message: TelegramMessage) {
  if (message.from?.is_bot) return;

  const chatId = message.chat.id;
  const text = message.text?.trim() || "";
  if (!text) {
    await sendReply(config, chatId, "Send me a text question and I will reply here.", message.message_id);
    return;
  }

  const command = commandFromText(text);
  if (command === "start") {
    await sendReply(
      config,
      chatId,
      "Hi. Send me a question and I will reply using the answers configured for this bot.",
      message.message_id
    );
    return;
  }

  if (command === "help") {
    await sendReply(
      config,
      chatId,
      "Ask a question in plain text. The bot checks saved answers first, then uses the configured responder URL if one is enabled.",
      message.message_id
    );
    return;
  }

  if (command === "ping") {
    await sendReply(config, chatId, "pong", message.message_id);
    return;
  }

  if (command === "reload") {
    state.answerRules = readAnswerRules(config.botAnswersPath);
    await sendReply(config, chatId, `Reloaded ${state.answerRules.length} saved answer rule(s).`, message.message_id);
    return;
  }

  await sendTyping(config, chatId);
  const reply = await answerQuestion(config, state, {
    chatId,
    messageId: message.message_id,
    userId: message.from?.id ?? 0,
    username: message.from?.username ?? "",
    displayName: displayName(message.from),
    text
  });
  await sendReply(config, chatId, reply, message.message_id);
}

async function pollUpdates(config: BotConfig, state: RuntimeState) {
  let offset = 0;
  let failures = 0;

  while (!stopping) {
    try {
      const requestBody: Record<string, unknown> = {
        timeout: config.botPollTimeoutSeconds,
        allowed_updates: ["message"]
      };
      if (offset) requestBody.offset = offset;

      const updates = await callBotApi<TelegramUpdate[]>(
        config,
        "getUpdates",
        requestBody,
        (config.botPollTimeoutSeconds + 10) * 1000
      );
      failures = 0;

      for (const update of updates) {
        offset = update.update_id + 1;
        if (!update.message) continue;
        try {
          await handleMessage(config, state, update.message);
        } catch (error) {
          console.error(`Unable to handle Telegram bot update ${update.update_id}: ${publicError(error)}`);
        }
      }
    } catch (error) {
      failures += 1;
      console.error(`Telegram bot polling failed: ${publicError(error)}`);
      await sleep(Math.min(30_000, 2_000 * failures));
    }
  }
}

async function main() {
  const config = readBotConfig();
  const state: RuntimeState = { answerRules: readAnswerRules(config.botAnswersPath) };

  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  if (config.botClearWebhookOnStart) {
    await callBotApi(config, "deleteWebhook", { drop_pending_updates: false });
  }

  const identity = await callBotApi<BotIdentity>(config, "getMe", {});
  console.log(`Telegram bot ${identity.username ? `@${identity.username}` : identity.first_name} is polling.`);
  console.log(`Loaded ${state.answerRules.length} saved answer rule(s) from ${config.botAnswersPath}.`);
  await pollUpdates(config, state);
}

main().catch((error) => {
  console.error(`Bot startup failed: ${publicError(error)}`);
  process.exitCode = 1;
});