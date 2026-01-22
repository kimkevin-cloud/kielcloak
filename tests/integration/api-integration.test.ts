import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  setupContainers,
  teardownContainers,
  expectedTargetFilename,
  pathInSolidData,
  type TestContainerSetup,
} from "./test-setup";

let setup: TestContainerSetup;
let baseURL: string;

// Test-Daten: WebID und Adressdatei vom Studenten
const STUD_WEBID_URL = "http://localhost:3000/stud/profile/card#me";
const STUD_ADDRESS_FILE =
  "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765749435695.ttl";
const LORD_WEBID_URL = "http://localhost:3000/lord/profile/card#me";

// Starte CSS und Backend in Docker-Containern vor allen Tests
beforeAll(async () => {
  console.log("\nStarting containers for API integration tests...");
  setup = await setupContainers();
  baseURL = setup.baseURL;
}, 300000); // 5 Min Timeout, weil Container-Start dauern kann

afterAll(async () => {
  await teardownContainers(setup);
});

describe("Health & Root", () => {
  it("responds on /", async () => {
    const response = await request(baseURL).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Backend running");
  });
});

describe("POST /send_address", () => {
  // Prüft ob Adressreferenz-Dateien in den Ziel-Mailboxen ankommen
  it("writes an address reference file to every target mailbox", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      sourceURL: STUD_ADDRESS_FILE,
      targets: [
        "http://localhost:3000/uni/MailBox/",
        "http://localhost:3000/bank/MailBox/",
      ],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("OK");

    // Dateiname wird aus sourceURL + Podname zusammengebaut
    const filename = expectedTargetFilename(payload.sourceURL, payload.web_id);

    // Prüfe in jedem Ziel-Pod ob die Datei da ist
    for (const target of payload.targets) {
      const targetPath = pathInSolidData(target, filename);
      const execResult = await setup.solidContainer.exec(["cat", targetPath]);

      expect(execResult.exitCode).toBe(0);
      expect(execResult.output).toContain(payload.sourceURL);
    }
  });

  it("rejects requests with empty targets", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      sourceURL: STUD_ADDRESS_FILE,
      targets: [],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  // Fehlende Parameter müssen abgelehnt werden
  it("rejects requests with missing web_id", async () => {
    const payload = {
      sourceURL: STUD_ADDRESS_FILE,
      targets: ["http://localhost:3000/uni/MailBox/"],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("rejects requests with missing sourceURL", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      targets: ["http://localhost:3000/uni/MailBox/"],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  // WebID muss richtig formatiert sein (mit Podname)
  it("rejects requests with invalid web_id format (no podname)", async () => {
    const payload = {
      web_id: "http://localhost:3000/profile/card#me", // kein /<pod>/profile
      sourceURL: STUD_ADDRESS_FILE,
      targets: ["http://localhost:3000/uni/MailBox/"],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Ungültige WebID");
  });

  // Wenn Ziel-Mailbox nicht beschreibbar ist, sollte 500 zurückkommen
  it("returns 500 if a target mailbox cannot be written", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      sourceURL: STUD_ADDRESS_FILE,
      targets: ["http://localhost:3000/doesnotexist/MailBox/"],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(500);
    expect(response.body.message).toContain("Adresse konnte nicht");
  });
});

describe("POST /antrag/new", () => {
  // Prüft ob Anträge korrekt im KielCloak-Pod gespeichert werden
  it("creates an antrag file in the KielCloak Pod", async () => {
    // TTL-Inhalt muss als base64 codiert werden
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ;
  :applicant <${STUD_WEBID_URL}> ;
  :type "bafoeg" .`;

    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "bafoeg",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("OK");

    // Dateiname: antrag_bafoeg_[base64-WebID]_[timestamp].ttl
    const base64WebID = Buffer.from(STUD_WEBID_URL).toString("base64");
    const filenamePattern = `antrag_${payload.antrag_type}_${base64WebID}`;

    // Prüfe im Container ob die Datei angelegt wurde
    const execResult = await setup.solidContainer.exec([
      "ls",
      "/data/kielcloak/antraege/",
    ]);
    expect(execResult.exitCode).toBe(0);
    expect(execResult.output).toContain(filenamePattern);
  });

  // Solid braucht immer eine .acl Datei für Zugriffsrechte
  it("creates both antrag.ttl and antrag.ttl.acl files", async () => {
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ;
  :type "wohngeld" .`;

    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "wohngeld",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    expect(response.status).toBe(200);

    const base64WebID = Buffer.from(STUD_WEBID_URL).toString("base64");
    const filenamePattern = `antrag_${payload.antrag_type}_${base64WebID}`;

    const execResult = await setup.solidContainer.exec([
      "ls",
      "/data/kielcloak/antraege/",
    ]);
    expect(execResult.exitCode).toBe(0);

    const output = execResult.output;
    const lines = output
      .split("\n")
      .filter((line) => line.includes(filenamePattern));

    // Mindestens 2 Dateien: .ttl und .ttl.acl
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(output).toMatch(new RegExp(`${filenamePattern}.*\\.ttl`));
    expect(output).toMatch(new RegExp(`${filenamePattern}.*\\.ttl\\.acl`));
  });

  it("rejects requests with missing web_id", async () => {
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application.`;

    const payload = {
      antrag_type: "bafoeg",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("rejects requests with missing antrag_type", async () => {
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application.`;

    const payload = {
      web_id: STUD_WEBID_URL,
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("rejects requests with missing ttl_file", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "bafoeg",
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    expect(response.status).toBe(500);
  });

  it("handles various antrag types correctly", async () => {
    const antragTypes = ["kindergeld", "elterngeld"];

    for (const antragType of antragTypes) {
      const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ; :type "${antragType}" .`;

      const payload = {
        web_id: STUD_WEBID_URL,
        antrag_type: antragType,
        ttl_file: Buffer.from(ttlContent).toString("base64"),
      };

      const response = await request(baseURL).post("/antrag/new").send(payload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("OK");
    }
  });

  // Begrüßungsgeld kann nur einmal beantragt werden
  it("prevents duplicate begruessungsgeld applications", async () => {
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ;
  :type "begruessungsgeld" .`;

    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "begruessungsgeld",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    // Erster Antrag sollte klappen
    const response1 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response1.status).toBe(200);

    // Zweiter Antrag sollte abgelehnt werden
    const response2 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response2.status).toBe(400);
    expect(response2.body.error).toBe("Antrag konnte nicht erstellt werden");
  });
});

describe("POST /send_webid", () => {
  // Prüft ob Mieter-Daten in die Vermieter-Mailbox geschrieben werden
  it("sends tenant WebID and data to landlord mailbox", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "Max",
      familyName: "Mustermann",
      fullName: "Max Mustermann",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("OK");
    expect(response.body.target).toBe("http://localhost:3000/lord/MailBox/");
    expect(response.body.filename).toContain("anfrage_Max-Mustermann");

    // Prüfe ob Datei im Vermieter-Pod angelegt wurde
    const targetPath = pathInSolidData(
      String(response.body.target),
      String(response.body.filename),
    );
    const execResult = await setup.solidContainer.exec(["cat", targetPath]);

    expect(execResult.exitCode).toBe(0);
    expect(execResult.output).toContain("Max");
    expect(execResult.output).toContain("Mustermann");
    expect(execResult.output).toContain(STUD_WEBID_URL);
  });

  // TTL-Datei muss richtige Struktur haben
  it("creates valid TTL file with correct schema", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "Anna",
      familyName: "Schmidt",
      fullName: "Anna Schmidt",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(201);

    const targetPath = pathInSolidData(
      String(response.body.target),
      String(response.body.filename),
    );
    const execResult = await setup.solidContainer.exec(["cat", targetPath]);

    const output = execResult.output;
    // Prüfe auf RDF/TTL Struktur
    expect(output).toContain("@prefix schema:");
    expect(output).toContain("@prefix foaf:");
    expect(output).toContain("schema:Person");
    expect(output).toContain('foaf:givenName "Anna"');
    expect(output).toContain('foaf:familyName "Schmidt"');
    expect(output).toContain('schema:name "Anna Schmidt"');
    expect(output).toContain(`schema:identifier "${STUD_WEBID_URL}"`);
  });

  // Fehlende Parameter müssen abgelehnt werden
  it("rejects requests with missing tenantWebId", async () => {
    const payload = {
      givenName: "Max",
      familyName: "Mustermann",
      fullName: "Max Mustermann",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("rejects requests with missing givenName", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      familyName: "Mustermann",
      fullName: "Max Mustermann",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("rejects requests with missing familyName", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "Max",
      fullName: "Max Mustermann",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("rejects requests with missing fullName", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "Max",
      familyName: "Mustermann",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("rejects requests with missing landlordWebId", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "Max",
      familyName: "Mustermann",
      fullName: "Max Mustermann",
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  // Sonderzeichen im Namen müssen richtig escaped werden
  it("handles special characters in names correctly", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "Jürgen",
      familyName: "Müller-Schmidt",
      fullName: "Jürgen Müller-Schmidt",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("OK");

    const targetPath = pathInSolidData(
      String(response.body.target),
      String(response.body.filename),
    );
    const execResult = await setup.solidContainer.exec(["cat", targetPath]);

    // Prüfe ob Umlaute und Namen korrekt im TTL stehen
    expect(execResult.output).toContain('givenName "Jürgen"');
    expect(execResult.output).toContain('familyName "Müller-Schmidt"');
    expect(execResult.exitCode).toBe(0);
  });
});
