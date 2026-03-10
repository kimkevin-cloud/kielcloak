/**
 * Extrahiert Podname aus eine gegebene WebID
 * @param {string} url: WebID aus dem den Podnamen extrahiert werden soll.
 * @returns {string} Podname
 * @example "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765307371.ttl"
 */
export function extractPodname(url: string): string | undefined {
  if (!url || typeof url !== "string") {
    throw new Error("Ungültige URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL ist nicht valide");
  }

  const match = parsed.pathname.match(/^\/([^/]+)\//);
  if (!match) {
    throw new Error("Podname konnte nicht extrahiert werden");
  }

  return match[1];
}
