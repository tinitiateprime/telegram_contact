import { listenForAccount } from "./account-client.ts";
import { readConfig } from "./config.ts";
import { MultiUserStore } from "./store.ts";

async function main() {
  const config = readConfig();
  const store = new MultiUserStore(config.dataDir, config.sessionEncryptionKey);
  await store.initialize();
  const accounts = await store.getAllAccountsWithSessions();
  const clients = await Promise.all(
    accounts.map(async (account) => {
      const client = await listenForAccount(account.sessionString, async (message) => {
        await store.recordMessage({
          accountId: account.id,
          direction: "inbound",
          recipient: message.isPrivate
            ? message.senderRef || message.senderId || message.chatId
            : message.chatRef || message.chatId || message.senderRef,
          text: message.text,
          telegramMessageId: message.messageId,
          createdAt: message.createdAt
        });
      });
      console.log(`Listening for ${account.displayName} (${account.id}).`);
      return client;
    })
  );

  if (clients.length === 0) console.log("No connected Telegram accounts to listen for.");

  const shutdown = async () => {
    console.log("Stopping Telegram listeners.");
    await Promise.all(clients.map((client) => client.disconnect()));
    await store.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await new Promise<void>(() => undefined);
}

main().catch((error) => {
  console.error("Command failed without logging sensitive input.");
  process.exitCode = 1;
});

