/**
 * Extrahiert Podname aus eine gegebene WebID
 * @param url: WebID
 *
 * Beispiel url : "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765307371.ttl"
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
