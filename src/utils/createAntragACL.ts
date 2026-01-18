import { session } from "../index.js";

/**
 * Erstellt ein ACL (Access Control List) Blob zum Antrag, mit den Berechtigungen für Kielcloak und Nutzer.
 * @param webID WebID des Nutzers, der den Antrag erstellt hat
 * @param fileName Dateiname des Antrags
 * @returns Ein Blob mit dem Inhalt der ACL
 * @throws {Error} Wenn der Dateiname nicht mit .ttl endet oder
 *            KIELCLOAK_POD_URL nicht definiert ist
 */
export function createAntragACL(webID: string, fileName: string): Blob {
  if (!fileName.endsWith(".ttl"))
    throw new Error("Dateiname muss mit .ttl enden!");

  const podUrl = process.env.KIELCLOAK_POD_URL;
  if (!podUrl) throw new Error("KIELCLOAK_POD_URL ist nicht definiert!");

  const podUrlParsed = new URL(podUrl).toString();
  const podUrlSanitized = podUrlParsed.endsWith("/")
    ? podUrlParsed
    : podUrlParsed + "/";

  // ACL Inhalt erstellen
  // Nutzer kann lesen, Kielcloak kann lesen und schreiben
  const content = `
@prefix acl: <https://www.w3.org/ns/auth/acl#>.

<#owner>
  a acl:Authorization;
  acl:agent <${session.info.webId}>;
  acl:accessTo <${podUrlSanitized}antraege/${fileName}>;
  acl:default <./>;
  acl:mode 
    acl:Write, acl:Control, acl:Read.

<#${webID}>
  a acl:Authorization;
  acl:agent <${webID}>;
  acl:accessTo <${podUrlSanitized}antraege/${fileName}>;
  acl:mode acl:Read.
`.trim();

  const blob = new Blob([content], { type: "text/turtle" });
  return blob;
}
