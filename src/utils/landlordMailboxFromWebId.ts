/**
 * Ermittelt die Mailbox-URL eines Vermieters aus dessen Web-ID.
 *
 * @param {string} landlordWebId - Die vollständige Web-ID des Vermieters (muss auf "/profile/card#me" enden).
 * @returns {string} Die URL der Mailbox des Vermieters.
 * @throws {Error} Wirft einen Fehler, wenn die Web-ID nicht dem erwarteten Format entspricht.
 */
export function landlordMailboxFromWebId(landlordWebId: string): string {
  if (!landlordWebId.includes("/profile/card#me")) {
    throw new Error("Ungültige Vermieter WebID");
  }
  return landlordWebId.replace("/profile/card#me", "/MailBox/");
}
