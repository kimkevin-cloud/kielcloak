
export function landlordMailboxFromWebId(landlordWebId: string): string {
  if (!landlordWebId.includes("/profile/card#me")) {
    throw new Error("Ungültige Vermieter WebID");
  }
  return landlordWebId.replace("/profile/card#me", "/MailBox/");
}