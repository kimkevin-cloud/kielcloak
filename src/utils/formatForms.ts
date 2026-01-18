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
export function formatForms(filenames: string[], webId: string): UserForms {
  
  const forms: { antrag_type: string; timestamp: string }[] = [];

  filenames.map((f) => f.replace(/'/g, ""))
    .forEach((f) => {
      const match = f.match(/^antrag_(.+?)_([^_]+)_(\d+)\.ttl$/);
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
