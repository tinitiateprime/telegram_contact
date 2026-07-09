import { sendTelegramMessage } from "./account-client.ts";
import { readConfig } from "./config.ts";
import { MultiUserStore } from "./store.ts";

function readFlag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? "" : process.argv[index + 1] ?? "";
}

async function main() {
  const token = readFlag("token");
  const accountId = readFlag("account-id");
  const recipient = readFlag("recipient");
  const message = readFlag("message");
  if (!token || !accountId || !recipient || !message) {
    throw new Error(
      'Usage: npm run send -- --token TOKEN --account-id ACCOUNT_ID --recipient @username --message "Hello"'
    );
  }

  const config = readConfig();
  const store = new MultiUserStore(config.dataDir, config.sessionEncryptionKey);
  await store.initialize();
  try {
    const user = await store.findUserByAccessToken(token);
    if (!user) throw new Error("Invalid access token.");
    const account = await store.getAccountWithSession(user.id, accountId);
    if (!account) throw new Error("Telegram account was not found.");
    const sent = await sendTelegramMessage(account.sessionString, { recipient, message });
    const recorded = await store.recordMessage({
      accountId: account.id,
      direction: "outbound",
      recipient: sent.recipient,
      text: message,
      telegramMessageId: sent.messageId
    });
    console.log(JSON.stringify({ ok: true, sent, message: recorded }, null, 2));
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error("Command failed without logging sensitive input.");
  process.exitCode = 1;
});


