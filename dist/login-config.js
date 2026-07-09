import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
const DEFAULT_LOGIN_USERS = [
    { username: "admin", password: "admin123", displayName: "Administrator" }
];
function asUsers(raw) {
    const source = raw;
    const entries = Array.isArray(raw) ? raw : Array.isArray(source.users) ? source.users : [raw];
    return entries.map((entry, index) => {
        const record = entry;
        if (typeof record.username !== "string" || !record.username.trim()) {
            throw new Error(`Login config user ${index + 1} is missing username.`);
        }
        if (typeof record.password !== "string" || !record.password) {
            throw new Error(`Login config user ${index + 1} is missing password.`);
        }
        return {
            username: record.username.trim(),
            password: record.password,
            displayName: typeof record.displayName === "string" && record.displayName.trim()
                ? record.displayName.trim()
                : record.username.trim()
        };
    });
}
function readLoginFile(filePath) {
    if (!existsSync(filePath))
        return null;
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    const users = asUsers(parsed);
    if (users.length === 0)
        throw new Error("Login config must contain at least one user.");
    return users;
}
function safeEqual(left, right) {
    const leftHash = createHash("sha256").update(left).digest();
    const rightHash = createHash("sha256").update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
}
export function readConfiguredLoginUsers() {
    const configuredPath = process.env.AUTH_CONFIG_PATH?.trim();
    const candidates = [
        ...(configuredPath ? [configuredPath] : []),
        path.join(process.cwd(), "config", "users.json"),
        path.join(process.cwd(), "auth.json")
    ];
    for (const candidate of candidates) {
        const users = readLoginFile(candidate);
        if (users)
            return users;
    }
    return DEFAULT_LOGIN_USERS;
}
export function findConfiguredLoginUser(users, username, password) {
    const normalizedUsername = username.trim().toLowerCase();
    return users.find((user) => (safeEqual(user.username.trim().toLowerCase(), normalizedUsername) && safeEqual(user.password, password))) ?? null;
}
export function configuredLoginId(user) {
    return `json:${user.username.trim().toLowerCase()}`;
}
