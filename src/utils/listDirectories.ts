import { getContainedResourceUrlAll, getResourceInfo, getSolidDataset, isContainer } from "@inrupt/solid-client";
import { session, app, port } from "../index.js";

export async function listDirectories(
  URL: string,
): Promise<Array<{ url: string; isContainer: boolean; contentType?: string }>> {
  // Ohne Login oder WebID kein Zugriff auf den Pod möglich
  if (!session.info.webId) {
    console.warn(
      "Nicht eingeloggt oder WebID fehlt – schreibe keine Testdaten.",
    );
    return [];
  }

  try {
    // Container-Metadaten laden
    const ds = await getSolidDataset(URL, {
      fetch: session.fetch,
    });
    const containedUrls = getContainedResourceUrlAll(ds);

    // Für jeden enthaltenen Resource eine HEAD-Abfrage, um Typ/Container zu ermitteln
    const entries = await Promise.all(
      containedUrls.map(async (url) => {
        try {
          const info = await getResourceInfo(url, {
            fetch: session.fetch,
          });
          const container = Boolean(isContainer(info));
          if (container) {
            return { url, isContainer: true, contentType: "container" };
          }
          const ct = info.internal_resourceInfo.contentType;
          return ct
            ? { url, isContainer: false, contentType: ct }
            : { url, isContainer: false };
        } catch {
          // Fallback: Heuristik über Slash am Ende (Container enden i. d. R. mit '/')
          return { url, isContainer: url.endsWith("/") };
        }
      }),
    );
    return entries;
  } catch (e) {
    console.error("Fehler beim Auflisten des Containers:", e);
    return [];
  }
}