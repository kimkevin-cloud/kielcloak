// Datei zur Definition von interfaces, types, functionen, usw.
// Alle Definitionen sollen klar kommentiert werden, damit diese Datei als Referenz für andere Entwickler dient.

/* FYI:  Backend = KielCloak */

/**
 * Handles Login for Backend service
 */
export async function SessionLogin() : Promise<void>

/**
 * Extrahiert Podname aus eine gegebene WebID
 * @param url: WebID
 * 
 * Beispiel url : "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765307371.ttl"
 */
export function extractPodname(url: string): string

/**
 * Erstellt ein Blob mit Podname und Timestamp im Namen (Bsp.: address_podname-ms.ttl), wo die sourceURL der vom Studenten angegebenen Adresse steht.
 * @param sourceURL Quelle, wo die Adresse im Studenten Pod gespeichert wurde
 * @param target Empfänger Mailbox URL
 * @param podname podname, der vor der Timestamp, die schon im Namen enthalten ist, im Dateinamen geschrieben werden soll.
*/
export async function createFile(sourceURL: string,target: string, podname: string) : Promise<string>

/**
 * Schreibt eine .ttl Datei in den gegebenen Pod (targetURL) mit einem Verweis zu sourceUrl, wenn ein Login besteht.
 * @param file Blob mit Verweis zur Adresse im Studenten Pod (z.B. Adresse des Studenten in adress-${ms}.ttl)
 * @param targetUrl Empfänger URL, wo die .ttl Datei geschrieben werden soll.
 * 
 * Test URLs: 
 *  Bank : http://localhost:3000/bank/MailBox
 *  Uni : http://localhost:3000/uni/MailBox
 */
export async function moveData(file : File, targetUrl: string): Promise<void>