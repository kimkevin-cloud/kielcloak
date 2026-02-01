/**
 * Erstellt eine Datei (als Blob) im Turtle-Format (.ttl), die die Web-ID-Daten
 * eines Mieters gemäß schema.org und FOAF-Vokabular enthält.
 *
 * @param {Object} params - Die Metadaten des Mieters.
 * @param {string} params.tenantWebId - Die eindeutige Web-ID des Mieters.
 * @param {string} params.givenName - Der Vorname des Mieters.
 * @param {string} params.familyName - Der Nachname des Mieters.
 * @param {string} params.fullName - Der vollständige Name des Mieters.
 *
 * @returns {Blob} Eine Datei im Format "text/turtle", die die RDF-Daten enthält.
 */
export function createTenantWebIdFile(params: {
  tenantWebId: string;
  givenName: string;
  familyName: string;
  fullName: string;
}): Blob {
  const esc = (v: string) =>
    v
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");

  const content = `@prefix schema: <https://schema.org/>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

<#tenant>
    a schema:Person;
    foaf:givenName "${esc(params.givenName)}";
    foaf:familyName "${esc(params.familyName)}";
    schema:name "${esc(params.fullName)}";
    schema:identifier "${esc(params.tenantWebId)}".
`;

  return new Blob([content], { type: "text/turtle" });
}
