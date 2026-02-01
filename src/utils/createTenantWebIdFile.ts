
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
