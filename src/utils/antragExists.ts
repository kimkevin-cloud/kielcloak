import {
  getContainedResourceUrlAll,
  getSolidDataset,
} from "@inrupt/solid-client";
import { session } from "../index";

/**
 * Überprüft, ob ein bestimmter Antrag im KielCloak Pod existiert
 * @param fileName Name der Antags-Datei, die im KielCloak Pod gesucht wird
 * @returns Ein Promise, das den Boolean-Wert true zurückgibt, wenn die Datei existiert
 * @throws {Error} Wenn der Dateiname nicht mit .ttl endet oder
 *            KIELCLOAK_POD_URL nicht definiert ist
 */
export async function antragExists(fileName: string): Promise<boolean> {
  const podUrl = process.env.KIELCLOAK_POD_URL;
  if (!podUrl) throw new Error("KIELCLOAK_POD_URL ist nicht definiert!");

  const podUrlParsed = new URL(podUrl).toString();
  const podUrlSanitized = podUrlParsed.endsWith("/")
    ? podUrlParsed
    : podUrlParsed + "/";

  if (!session.info.webId || !session.info.isLoggedIn)
    throw new Error("KielCloak nicht eingeloggt oder WebID fehlt.");

  const containerUrl = new URL(podUrlSanitized + "antraege/").toString();
  if (!fileName.endsWith(".ttl"))
    throw new Error("Dateiname muss mit .ttl enden!");

  try {
    // Container-Metadaten laden
    const antraegeDS = await getSolidDataset(containerUrl, {
      fetch: session.fetch,
    });
    const containedUrls = getContainedResourceUrlAll(antraegeDS);

    // Datei in den Container-URLs suchen -> letztes Element muss dem gesuchten Dateinamen entsprechen
    return containedUrls.some((url) => {
      const foundFile = decodeURIComponent(
        new URL(url).pathname.split("/").pop() || "",
      );
      return foundFile === fileName;
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // console.error("Fehler beim Laden der Container-Metadaten:", errorMessage);
    throw new Error("Container konnte nicht geladen werden: " + errorMessage);
  }
}
