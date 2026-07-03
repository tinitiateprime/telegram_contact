import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function readEncryptionKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY must be a base64url-encoded 32-byte key. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\""
    );
  }
  return key;
}

export class SecretCipher {
  private readonly key: Buffer;

  constructor(encodedKey: string) {
    this.key = readEncryptionKey(encodedKey);
  }

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
  }

  decrypt(payload: string) {
    const [version, ivEncoded, tagEncoded, encryptedEncoded, ...unexpected] = payload.split(".");
    if (version !== "v1" || !ivEncoded || !tagEncoded || !encryptedEncoded || unexpected.length > 0) {
      throw new Error("Encrypted value has an unsupported format.");
    }

    try {
      const decipher = createDecipheriv(algorithm, this.key, Buffer.from(ivEncoded, "base64url"));
      decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedEncoded, "base64url")),
        decipher.final()
      ]).toString("utf8");
    } catch {
      throw new Error("Unable to decrypt protected data. Check SESSION_ENCRYPTION_KEY.");
    }
  }
}
