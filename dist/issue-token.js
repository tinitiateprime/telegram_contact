import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { readConfig } from "./config.js";
function readFlag(name) {
    const args = process.argv.slice(2);
    const index = args.indexOf(`--${name}`);
    if (index !== -1)
        return args[index + 1] ?? "";
    return args.find((arg) => !arg.startsWith("-")) ?? "";
}
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}
async function main() {
    const accountId = readFlag("account-id");
    if (!accountId) {
        throw new Error("Usage: npm run issue-token -- ACCOUNT_ID");
    }
    const config = readConfig();
    const pool = new Pool({ connectionString: config.databaseUrl });
    const accessToken = `tgr_${randomBytes(32).toString("base64url")}`;
    try {
        const result = await pool.query(`UPDATE app_users
       SET token_hash = $1
       WHERE id = (SELECT user_id FROM telegram_accounts WHERE id = $2)
       RETURNING display_name`, [hashToken(accessToken), accountId]);
        const user = result.rows[0];
        if (!user)
            throw new Error("Account id was not found.");
        console.log(`New access token for ${user.display_name}:`);
        console.log(accessToken);
    }
    finally {
        await pool.end();
    }
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Could not issue an access token.");
    process.exitCode = 1;
});
