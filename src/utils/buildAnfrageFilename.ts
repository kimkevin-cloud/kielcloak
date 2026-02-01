import { sanitizeForFilename } from "./sanitizeForFilename";

export function buildAnfrageFilename(
  tenantName: string,
  tenantWebId: string,
): string {
  const tenantWebIdBase64 = Buffer.from(tenantWebId, "utf8")
    .toString("base64")
    .replace(/=+$/g, "");
  return `anfrage_${sanitizeForFilename(tenantName)}_${tenantWebIdBase64}.ttl`;
}
