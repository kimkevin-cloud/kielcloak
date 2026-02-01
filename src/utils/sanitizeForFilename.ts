export function sanitizeForFilename(input: string): string {
  return (
    input
      .trim()
      .replace(/^https?:\/\//, (m) => (m === "https://" ? "https-" : "http-"))
      .replace(/[\s/:?#&]+/g, "-")

      // Wie Umlaute behandeln?
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}
