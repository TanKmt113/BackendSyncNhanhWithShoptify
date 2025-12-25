import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
// Key phải dài 32 ký tự. Nếu ENV không đủ, ta sẽ padding hoặc hash nó.
// Tốt nhất là set ENCRYPTION_KEY trong .env là một chuỗi random 32 chars hex hoặc base64
const SECRET_KEY = process.env.ENCRYPTION_KEY || "vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3"; // Fallback key (chỉ dùng cho dev)
const IV_LENGTH = 16; // AES block size

export const encrypt = (text: string): string => {
  if (!text) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

export const decrypt = (text: string): string => {
  if (!text) return "";
  const textParts = text.split(":");
  if (textParts.length < 2) return text; // Không đúng format -> trả về gốc
  
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  
  try {
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
  } catch (e) {
      console.error("Decryption failed:", e);
      return text;
  }
};
