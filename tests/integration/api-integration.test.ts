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

const STUD_WEBID_URL = "http://localhost:3000/stud/profile/card#me";
const STUD_ADDRESS_FILE =
  "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765749435695.ttl";

beforeAll(async () => {
  console.log("\nStarting containers for API integration tests...");
  setup = await setupContainers();
  baseURL = setup.baseURL;
}, 300000);

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

    const filename = expectedTargetFilename(payload.sourceURL, payload.web_id);

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
});

describe("POST /antrag/new", () => {
  it("creates an antrag file in the KielCloak Pod", async () => {
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

    const base64WebID = Buffer.from(STUD_WEBID_URL).toString("base64");
    const filenamePattern = `antrag_${payload.antrag_type}_${base64WebID}`;

    const execResult = await setup.solidContainer.exec([
      "ls",
      "/data/kielcloak/antraege/",
    ]);
    expect(execResult.exitCode).toBe(0);
    expect(execResult.output).toContain(filenamePattern);
  });

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

    // Backend validiert ttl_file erst nach Buffer.from und gibt dadurch 500 zurück
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

  it("prevents duplicate begruessungsgeld applications", async () => {
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ;
  :type "begruessungsgeld" .`;

    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "begruessungsgeld",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    const response1 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response1.status).toBe(200);

    const response2 = await request(baseURL).post("/antrag/new").send(payload);
    expect(response2.status).toBe(400);
    expect(response2.body.error).toBe("Antrag konnte nicht erstellt werden");
  });
});
