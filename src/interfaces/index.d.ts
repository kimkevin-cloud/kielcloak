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