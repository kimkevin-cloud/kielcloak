/**
 * Extrahiert Podname aus eine gegebene WebID
 * @param url: WebID
 *
 * Beispiel url : "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765307371.ttl"
 */
export function extractPodname(url: string): string {
  const match = url.match(/https?:\/\/[^/]+\/([^/]+)\/profile/);
  return match?.[1]?.toString() ?? "";
}