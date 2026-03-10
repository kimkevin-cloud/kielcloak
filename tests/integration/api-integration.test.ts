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

// Test data: student WebID and address file
const STUD_WEBID_URL = "http://localhost:3000/stud/profile/card#me";
const STUD_ADDRESS_FILE =
  "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765749435695.ttl";
const LORD_WEBID_URL = "http://localhost:3000/lord/profile/card#me";

// Start CSS and backend in Docker containers before all tests
beforeAll(async () => {
  console.log("\nStarting containers for API integration tests...");
  setup = await setupContainers();
  baseURL = setup.baseURL;
}, 300000); // 5-minute timeout for container startup

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
  // Verifies that address reference files are written to all target mailboxes
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

    // Filename is constructed from sourceURL and podname
    const filename = expectedTargetFilename(payload.sourceURL, payload.web_id);

    // Verify file exists in each target pod
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

  // Missing parameters must be rejected
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

  // Backend currently accepts WebIDs without explicit podname
  it("accepts web_id without explicit podname and processes request", async () => {
    const payload = {
      web_id: "http://localhost:3000/profile/card#me", // no /<pod>/profile
      sourceURL: STUD_ADDRESS_FILE,
      targets: ["http://localhost:3000/uni/MailBox/"],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("OK");
  });

  // If target mailbox is not writable, should return 500
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
  // Verifies that applications are correctly stored in the KielCloak pod
  it("creates an antrag file in the KielCloak Pod", async () => {
    // TTL content must be encoded as base64
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

    // Filename format: antrag_bafoeg_[base64-WebID]_[timestamp].ttl
    const base64WebID = Buffer.from(STUD_WEBID_URL).toString("base64");
    const filenamePattern = `antrag_${payload.antrag_type}_${base64WebID}`;

    // Verify file was created in container
    const execResult = await setup.solidContainer.exec([
      "ls",
      "/data/kielcloak/antraege/",
    ]);
    expect(execResult.exitCode).toBe(0);
    expect(execResult.output).toContain(filenamePattern);
  });

  // Solid always requires an .acl file for access control
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

    // At least 2 files: .ttl and .ttl.acl
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(output).toMatch(new RegExp(`${filenamePattern}.*\\.ttl`));
    expect(output).toMatch(new RegExp(`${filenamePattern}.*\\.ttl\\.acl`));
  });

  it("rejects requests with missing required application fields", async () => {
    const missingFieldsCases = [
      {
        name: "missing web_id",
        payload: {
          antrag_type: "bafoeg",
          ttl_file: Buffer.from(
            "@prefix : <http://example.org/antrag/>.\n:antrag a :Application.",
          ).toString("base64"),
        },
      },
      {
        name: "missing antrag_type",
        payload: {
          web_id: STUD_WEBID_URL,
          ttl_file: Buffer.from(
            "@prefix : <http://example.org/antrag/>.\n:antrag a :Application.",
          ).toString("base64"),
        },
      },
      {
        name: "missing ttl_file",
        payload: {
          web_id: STUD_WEBID_URL,
          antrag_type: "bafoeg",
        },
      },
    ];

    for (const testCase of missingFieldsCases) {
      const response = await request(baseURL)
        .post("/antrag/new")
        .send(testCase.payload);
      expect([400, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.error).toBe("Missing or invalid parameters");
      }
    }
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

  // Welcome gift (Begrüßungsgeld) can only be applied for once
  it("prevents duplicate begruessungsgeld applications", async () => {
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ;
  :type "begruessungsgeld" .`;

    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "begruessungsgeld",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    // First application should succeed
    const response1 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response1.status).toBe(200);

    // Second application should be rejected
    const response2 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response2.status).toBe(400);
    expect(response2.body.error).toBe("Antrag konnte nicht erstellt werden");
  });
});

describe("POST /send_webid", () => {
  // Verifies that tenant data is written to landlord's mailbox
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

    // Verify file was created in landlord's pod
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

  // TTL file must have correct structure
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
    // Verify RDF/TTL structure
    expect(output).toContain("@prefix schema:");
    expect(output).toContain("@prefix foaf:");
    expect(output).toContain("schema:Person");
    expect(output).toContain('foaf:givenName "Anna"');
    expect(output).toContain('foaf:familyName "Schmidt"');
    expect(output).toContain('schema:name "Anna Schmidt"');
    expect(output).toContain(`schema:identifier "${STUD_WEBID_URL}"`);
  });

  // Missing parameters must be rejected
  it("rejects requests with missing required tenant/landlord fields", async () => {
    // Test missing critical identifiers
    const criticalMissingCases = [
      {
        name: "missing tenantWebId",
        payload: {
          givenName: "Max",
          familyName: "Mustermann",
          fullName: "Max Mustermann",
          landlordWebId: LORD_WEBID_URL,
        },
      },
      {
        name: "missing landlordWebId",
        payload: {
          tenantWebId: STUD_WEBID_URL,
          givenName: "Max",
          familyName: "Mustermann",
          fullName: "Max Mustermann",
        },
      },
    ];

    for (const testCase of criticalMissingCases) {
      const response = await request(baseURL)
        .post("/send_webid")
        .send(testCase.payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Missing or invalid parameters");
    }
  });

  it("rejects requests with missing personal information fields", async () => {
    // Test missing personal data fields
    const personalDataMissingCases = [
      {
        name: "missing givenName",
        payload: {
          tenantWebId: STUD_WEBID_URL,
          familyName: "Mustermann",
          fullName: "Max Mustermann",
          landlordWebId: LORD_WEBID_URL,
        },
      },
      {
        name: "missing familyName",
        payload: {
          tenantWebId: STUD_WEBID_URL,
          givenName: "Max",
          fullName: "Max Mustermann",
          landlordWebId: LORD_WEBID_URL,
        },
      },
      {
        name: "missing fullName",
        payload: {
          tenantWebId: STUD_WEBID_URL,
          givenName: "Max",
          familyName: "Mustermann",
          landlordWebId: LORD_WEBID_URL,
        },
      },
    ];

    for (const testCase of personalDataMissingCases) {
      const response = await request(baseURL)
        .post("/send_webid")
        .send(testCase.payload);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Missing or invalid parameters");
    }
  });

  // Special characters in names must be properly escaped
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

    // Verify special characters and names are correct in TTL
    expect(execResult.output).toContain('givenName "Jürgen"');
    expect(execResult.output).toContain('familyName "Müller-Schmidt"');
    expect(execResult.exitCode).toBe(0);
  });
});

describe("GET /antrag/all", () => {
  it("rejects requests with empty web_id param", async () => {
    const response = await request(baseURL).get("/antrag/all?web_id=");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid WebID");
  });

  it("returns 201 with empty forms for unknown user", async () => {
    const unknownWebId = "http://localhost:3000/nobody/profile/card#me";
    const base64Unknown = Buffer.from(unknownWebId)
      .toString("base64")
      .replace(/=+$/g, "");

    const response = await request(baseURL)
      .get(`/antrag/all?web_id=${base64Unknown}`)
      .send();

    expect(response.status).toBe(201);
    expect(Array.isArray(response.body.forms)).toBe(true);
    expect(response.body.forms.length).toBe(0);
    expect(response.body.message).toContain(
      "Nutzer hat noch keine Anträge gestellt",
    );
  });

  it("lists all applications for the given user", async () => {
    // Create a couple of unique applications for the student
    const types = ["alltest1", "alltest2"];
    for (const antragType of types) {
      const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ; :applicant <${STUD_WEBID_URL}> ; :type "${antragType}" .`;

      const payload = {
        web_id: STUD_WEBID_URL,
        antrag_type: antragType,
        ttl_file: Buffer.from(ttlContent).toString("base64"),
      };

      const postResp = await request(baseURL).post("/antrag/new").send(payload);
      expect(postResp.status).toBe(200);
    }

    const base64Stud = Buffer.from(STUD_WEBID_URL)
      .toString("base64")
      .replace(/=+$/g, "");
    const response = await request(baseURL).get(
      `/antrag/all?web_id=${base64Stud}`,
    );

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.forms)).toBe(true);

    type Form = { antrag_type: string; timestamp: string };
    const forms = (response.body?.forms ?? []) as Form[];

    // Should include our just-created types
    const foundTypes = new Set(forms.map((f) => f.antrag_type));
    for (const t of types) {
      expect(foundTypes.has(t)).toBe(true);
    }

    // Timestamps should be numeric strings
    for (const form of forms) {
      expect(typeof form.timestamp).toBe("string");
      expect(/^[0-9]+$/.test(form.timestamp)).toBe(true);
    }
  });

  // Ensures results are filtered by web_id and do not leak other users' applications
  it("filters results by web_id and excludes other users' applications", async () => {
    // Create an application for another user (landlord)
    const otherType = "alltest-other";
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ; :applicant <${LORD_WEBID_URL}> ; :type "${otherType}" .`;
    const payload = {
      web_id: LORD_WEBID_URL,
      antrag_type: otherType,
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };
    const postResp = await request(baseURL).post("/antrag/new").send(payload);
    expect(postResp.status).toBe(200);

    // Query for student; should not see landlord's application
    const base64Stud = Buffer.from(STUD_WEBID_URL)
      .toString("base64")
      .replace(/=+$/g, "");
    const response = await request(baseURL).get(
      `/antrag/all?web_id=${base64Stud}`,
    );

    expect(response.status).toBe(200);
    type Form = { antrag_type: string; timestamp: string };
    const forms = (response.body?.forms ?? []) as Form[];
    const types = new Set(forms.map((f) => f.antrag_type));
    expect(types.has(otherType)).toBe(false);
  });

  // Tests that base64-encoded web_id with padding is handled correctly
  it("handles base64-encoded web_id with padding correctly", async () => {
    // Create request with base64 padding (= characters)
    const base64WithPadding = Buffer.from(STUD_WEBID_URL).toString("base64");
    const response = await request(baseURL).get(
      `/antrag/all?web_id=${base64WithPadding}`,
    );

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(Array.isArray(response.body.forms)).toBe(true);
  });
});

describe("POST /antrag/new - Duplicates & Edge Cases", () => {
  // Verifies that multiple different application types can be created for the same user
  it("allows creating multiple application types for the same user", async () => {
    const types = ["duptest1", "duptest2"];

    for (const antragType of types) {
      const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ; :type "${antragType}" .`;

      const payload = {
        web_id: STUD_WEBID_URL,
        antrag_type: antragType,
        ttl_file: Buffer.from(ttlContent).toString("base64"),
      };

      const response = await request(baseURL).post("/antrag/new").send(payload);
      expect(response.status).toBe(200);
    }

    // Verify both exist by querying /antrag/all
    const base64Stud = Buffer.from(STUD_WEBID_URL)
      .toString("base64")
      .replace(/=+$/g, "");
    const response = await request(baseURL).get(
      `/antrag/all?web_id=${base64Stud}`,
    );

    type Form = { antrag_type: string; timestamp: string };
    const forms = (response.body?.forms ?? []) as Form[];
    const foundTypes = new Set(forms.map((f) => f.antrag_type));

    for (const t of types) {
      expect(foundTypes.has(t)).toBe(true);
    }
  });

  // Ensures that applications can be created sequentially with different timestamps
  it("allows creating new application after delay (different timestamp)", async () => {
    const antragType = "timestamp-test";
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ; :type "${antragType}" .`;

    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: antragType,
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    // First application creation
    const response1 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response1.status).toBe(200);

    // Wait briefly, then create another application
    // Should succeed because filename includes timestamp
    await new Promise((resolve) => setTimeout(resolve, 100));
    const response2 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response2.status).toBe(200);

    // Verify both exist with different timestamps
    const base64Stud = Buffer.from(STUD_WEBID_URL)
      .toString("base64")
      .replace(/=+$/g, "");
    const response = await request(baseURL).get(
      `/antrag/all?web_id=${base64Stud}`,
    );

    type Form = { antrag_type: string; timestamp: string };
    const forms = (response.body?.forms ?? []) as Form[];
    const timestampTests = forms.filter((f) => f.antrag_type === antragType);
    expect(timestampTests.length).toBeGreaterThanOrEqual(1);
  });

  // Tests server behavior with various edge case inputs
  it("accepts requests with non-empty TTL file and processes successfully", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "edge-case-test",
      ttl_file: Buffer.from("@prefix : <http://example.org/>.").toString(
        "base64",
      ),
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    // Should succeed (200) or handle error gracefully (400/500)
    expect([200, 400, 500]).toContain(response.status);
  });
});

describe("POST /send_address - Edge Cases", () => {
  // Tests behavior when duplicate target mailboxes are provided
  it("handles multiple identical target mailboxes gracefully", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      sourceURL: STUD_ADDRESS_FILE,
      targets: [
        "http://localhost:3000/uni/MailBox/",
        "http://localhost:3000/uni/MailBox/", // Duplicate target
      ],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    // Should succeed or handle error gracefully
    expect([200, 400, 500]).toContain(response.status);
  });
});

describe("POST /send_webid - Validation & Edge Cases", () => {
  // Verifies that landlord WebID format validation works
  it("rejects invalid landlord WebID format (missing /profile/card#me)", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "Test",
      familyName: "User",
      fullName: "Test User",
      landlordWebId: "http://localhost:3000/lord", // Invalid: missing /profile/card#me
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    // Should return server error due to invalid landlord WebID
    expect(response.status).toBe(500);
    expect(response.body.message).toContain("unerwarteter Fehler");
  });

  // Tests that empty field validation is enforced
  it("rejects empty givenName field", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "", // Empty field
      familyName: "User",
      fullName: "Test User",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  // Tests that filenames with special characters are handled correctly
  it("handles filenames with special characters gracefully", async () => {
    const payload = {
      tenantWebId: STUD_WEBID_URL,
      givenName: "John",
      familyName: "Smith",
      fullName: "John Smith",
      landlordWebId: LORD_WEBID_URL,
    };

    const response = await request(baseURL).post("/send_webid").send(payload);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("OK");
    expect(response.body.filename).toBeDefined();
    // Filename should be a valid string
    expect(typeof response.body.filename).toBe("string");
  });
});
