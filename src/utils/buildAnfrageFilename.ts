import { sanitizeForFilename } from "./sanitizeForFilename";

/**
 * Generiert einen standardisierten Dateinamen für eine Anfrage-Datei im Turtle-Format (.ttl).
 * Der Dateiname wird aus dem Mieter Namen und der Web-ID zusammengesetzt,
 * wobei die Web-ID Base64-kodiert wird, um die URL-Kompatibilität und Dateisystemsicherheit zu gewährleisten.
 *
 * @param {string} tenantName - Der Anzeigename des Mieters (wird für den Dateinamen bereinigt).
 * @param {string} tenantWebId - Die eindeutige Web-ID des Mieters, die als Base64 kodiert wird.
 * @returns {string} Der formatierte Dateiname (z. B. "anfrage_mieter_YmFzZTY0.ttl").
 */
export function buildAnfrageFilename(
  tenantName: string,
  tenantWebId: string,
): string {
  const tenantWebIdBase64 = Buffer.from(tenantWebId, "utf8")
    .toString("base64")
    .replace(/=+$/g, "");
  return `anfrage_${sanitizeForFilename(tenantName)}_${tenantWebIdBase64}.ttl`;
}
