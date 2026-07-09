import { readConfig } from "./config.ts";
import { MultiUserStore } from "./store.ts";

function readFlag(name: string) {
  const args = process.argv.slice(2);
  const index = args.indexOf(`--${name}`);
  if (index !== -1) return args[index + 1] ?? "";
  return args.find((arg) => !arg.startsWith("-")) ?? "";
}

async function main() {
  const accountId = readFlag("account-id");
  if (!accountId) {
    throw new Error("Usage: npm run issue-token -- ACCOUNT_ID");
  }

  const config = readConfig();
  const store = new MultiUserStore(config.dataDir, config.sessionEncryptionKey);
  await store.initialize();

  try {
    const result = await store.issueAccessTokenForAccount(accountId);
    if (!result) throw new Error("Account id was not found.");

    console.log(`New access token for ${result.user.displayName}:`);
    console.log(result.accessToken);
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not issue an access token.");
  process.exitCode = 1;
});
