/**
 * Erstellt ein Blob mit Podname und Timestamp im Namen (Bsp.: address_podname-ms.ttl), wo die sourceURL der vom Studenten angegebenen Adresse steht.
 * @param sourceURL Quelle, wo die Adresse im Studenten Pod gespeichert wurde
 * @param filename Dateiname
 * @param targetURL Empfänger Mailbox URL. Wird im Inhalt der Datei geschrieben
 */
export function createDritteFile( sourceURL: string, filename: string, targetURL: string): Blob {
  if (!filename.endsWith(".ttl"))
    throw new Error("Dateiname muss mit .ttl enden!");

  const content = `
@prefix : <${targetURL}${filename}>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.

:adressdata
  owl:sameAs <${sourceURL}>.
  `.trim();

  const blob = new Blob([content], { type: "text/turtle" });

  return blob;
}