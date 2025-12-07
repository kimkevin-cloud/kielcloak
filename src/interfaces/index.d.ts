// Datei zur Definition von interfaces, types, functionen, usw.
// Alle Definitionen sollen klar kommentiert werden, damit diese Datei als Referenz für andere Entwickler dient.

/* FYI:  Backend = KielCloak */

/**
 * Handles Login for Backend service
 */
async function SessionLogin() : Promise<void>

/**
 * Handles Logout for Backend Service
 */
async function SessionLogout() : Promise<void>


/**
 * Function in charge of handling the writing to a third party (e.g. Uni / Bank)
 * @param sourceURL URL to where the information is located
 * @param destinationURL URL to where the information should be written (extern)
 */
async function WriteToThirdParty(sourceURL : string, destinationURL : string) : void


/**
 * Erstellt eine .ttl file mit Timestamp im Namen, wo die sourceURL der vom Studenten angegebenen Adresse steht.
 * @param sourceURL Quelle, wo die Adresse im Studenten Pod gespeichert wurde
 */
async function createTTL(sourceURL: string) : Promise<string>

/**
 * Schreibt eine .ttl Datei in den gegebenen Pod (targetURL) mit einem Verweis zu sourceUrl, wenn ein Login besteht.
 * @param sourceUrl Verweis Datenquelle (z.B. Adresse des Studenten in adress.ttl)
 * @param targetUrl Empfänger URL, wo die .ttl Datei geschrieben werden soll.
 * 
 * Test URLs: 
 *  Bank : http://localhost:3000/bank/MailBox
 *  Uni : http://localhost:3000/uni/MailBox
 */
async function moveData(sourceUrl: string, targetUrl: string): Promise<void>