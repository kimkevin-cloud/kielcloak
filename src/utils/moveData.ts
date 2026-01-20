import { overwriteFile } from "@inrupt/solid-client";
import { session } from "../index";

/**
 * Schreibt eine .ttl Datei in den gegebenen Pod (targetURL) mit einem Verweis zu sourceUrl, wenn ein Login besteht.
 * @param file Blob mit Verweis zur Adresse im Studenten Pod (z.B. Adresse des Studenten in adress-${ms}.ttl)
 * @param fileName Name der Datei
 * @param targetURL Empfänger URL, wo die .ttl Datei geschrieben werden soll.
 *
 * Test URLs:
 *  Bank : http://localhost:3000/bank/MailBox
 *  Uni : http://localhost:3000/uni/MailBox
 */
export async function moveData(
  file: Blob,
  fileName: string,
  targetURL: string,
) {
  if (!file || !targetURL || !fileName || targetURL === "" || fileName === "") {
    throw new Error("sourceURL, fileName oder targetURL ist nicht definiert!");
  }
  // Ohne Login oder WebID kein Zugriff auf den Pod möglich
  if (!session.info.webId)
    throw new Error("KielCloak nicht eingeloggt oder WebID fehlt.");

  try {
    await overwriteFile(targetURL + fileName, file, {
      contentType: "text/turtle",
      fetch: session.fetch,
    });

    return;
  } catch (error) {
    console.error(`Fehler beim Speichern der Datei in ${targetURL}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Datei konnte nicht in Target ${targetURL} gespeichert werden: ${errorMessage}`,
    );
  }
}
