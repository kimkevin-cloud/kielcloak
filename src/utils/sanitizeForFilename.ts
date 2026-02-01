/**
 * Bereinigt einen String, damit dieser sicher als Dateiname verwendet werden kann.
 * Die Funktion entfernt Protokoll-Präfixe, ersetzt Sonderzeichen durch Bindestriche
 * und verhindert doppelte oder führende/folgende Bindestriche.
 *
 * @param {string} input - Der rohe Eingabestring (z. B. "Müller & Co. https://test.de").
 * @returns {string} Der bereinigte, dateisystemfreundliche String.
 */
export function sanitizeForFilename(input: string): string {
  return (
    input
      .trim()
      .replace(/^https?:\/\//, (m) => (m === "https://" ? "https-" : "http-"))
      .replace(/[\s/:?#&]+/g, "-")

      // Wie Umlaute behandeln?
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}
