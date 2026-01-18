import { UserForms } from "../types.js";

/**
 * Nimmt URLs und gibt einen neuen JSON Objekt zurück mit antrag_type und timestamp
 * @param urls Liste alles URLs, die man transformieren muss.
 * @returns JSON Objekt der Art
 * {
 *  forms {
 *    "antrag_type": string,
 *     "timestamp": string
 *  }[]
 * }
 */
export function formatForms(urls: string[], webId: string): UserForms {
  const forms: { antrag_type: string; timestamp: string }[] = [];

  urls
    .map((url) => {
      // Extraer el nombre de archivo de la URL
      const filename = url.split("/").pop() || "";
      // Limpiar caracteres especiales
      return filename.replace(/'/g, "");
    })
    .forEach((filename) => {
      const match = filename.match(/^antrag_(.+?)_([^_]+)_(\d+)\.ttl$/);
      if (match && match[2] === webId) {
        const form = {
          antrag_type: match[1]!,
          timestamp: match[3]!,
        };
        console.log("Gefunden:", form);
        forms.push(form);
      }
    });

  return { forms };
}
