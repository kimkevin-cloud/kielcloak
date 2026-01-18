import { beforeAll, afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import fs from "fs";
import request from "supertest";

let backendContainer: StartedTestContainer;
let solidContainer: StartedTestContainer;
// let forwardServer: net.Server | null = null;
let baseURL: string;
// const SOLID_BASE_URL = "http://localhost:3000";
// Spiegelt die Frontend-E2E-Defaults, damit wir dieselben CSS-Daten und Anmeldedaten verwenden
const SOLID_BASE_URL = "http://localhost:3000";
const STUD_PROFILE_URL = `${SOLID_BASE_URL}/stud/meinKiel/profile.ttl`;
const LORD_ADDRESS_URL = `${SOLID_BASE_URL}/lord/addresses/musterstrasse1.ttl`;
const STUD_WEBID_URL = `${SOLID_BASE_URL}/stud/profile/card.ttl`;

beforeAll(async () => {
  console.log("\nStarting backend container via Testcontainers...");

  const projectRoot = process.cwd();

  // Lade Umgebungsvariablen aus .env falls vorhanden
  const envVars = {
    CLIENT_ID: "_e867d54b-cb84-4896-9bee-55541dfd755d",
    CLIENT_SECRET:
      "7e2cd0903f1d235906140f0c0d6f59362ee11a79e9d64b31acd608e08fb04342824ddf4b413eea566d47d85d022507e00a4678112d0fc41cea54def2ace23800",
    OIDC_ISSUER: process.env.OIDC_ISSUER || "http://localhost:3000",
    NODE_ENV: "test",
  };

  try {
    // Starte SOLID CSS Container
    console.log(
      "Starting Community Solid Server (CSS) for SOLID Pod testing...",
    );

    const solidDataCandidates = [
      // Bevorzuge backend-lokale Fixtures (unter src/tests/solid-data)
      path.resolve(projectRoot, "tests", "integration", "solid-data"),
    ];

    const solidDataDir = solidDataCandidates.find(fs.existsSync);
    if (!solidDataDir) {
      throw new Error(
        `No solid-data directory found. Checked: ${solidDataCandidates.join(", ")}`,
      );
    }

    console.log(`Using solid-data from: ${solidDataDir}`);

    solidContainer = await new GenericContainer(
      "solidproject/community-server:latest",
    )
      .withCommand([
        "-c",
        "config/file.json",
        "-f",
        "/data",
        "-l",
        "info",
        "-b",
        envVars.OIDC_ISSUER,
      ])
      .withCopyDirectoriesToContainer([
        { source: solidDataDir, target: "/data" },
      ])
      .withExposedPorts(3000)
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/", 3000))
      .withStartupTimeout(120_000)
      .withPlatform("linux/amd64")
      .start();

    const solidHost = solidContainer.getHost();
    const solidPort = solidContainer.getMappedPort(3000);
    console.log(`CSS container started at ${solidHost}:${solidPort}`);

    // Starte Backend in Docker-Container
    try {
      const context = path.resolve(process.cwd());
      const built = await GenericContainer.fromDockerfile(context).build();
      backendContainer = await built
        .withEnvironment({
          CLIENT_ID: envVars.CLIENT_ID,
          CLIENT_SECRET: envVars.CLIENT_SECRET,
          OIDC_ISSUER: envVars.OIDC_ISSUER,
          PUBLIC_SOLID_URL: SOLID_BASE_URL,
          KIELCLOAK_POD_URL: SOLID_BASE_URL,
        })
        .withNetworkMode(`container:${solidContainer.getId()}`)
        .start();
    } catch (buildError) {
      console.warn(
        "Failed to build image from Dockerfile, attempting alternative approach",
        buildError,
      );

      const projectRoot = process.cwd();
      backendContainer = await new GenericContainer("node:22")
        .withBindMounts([
          {
            source: projectRoot,
            target: "/app",
            mode: "rw",
          },
        ])
        .withCommand([
          "sh",
          "-c",
          "cd /app && npm install 2>&1 && npm run dev 2>&1",
        ])
        .withEnvironment({
          CLIENT_ID: envVars.CLIENT_ID,
          CLIENT_SECRET: envVars.CLIENT_SECRET,
          OIDC_ISSUER: envVars.OIDC_ISSUER,
          PUBLIC_SOLID_URL: SOLID_BASE_URL,
          KIELCLOAK_POD_URL: SOLID_BASE_URL,
          NODE_ENV: "development",
        })
        .withNetworkMode(`container:${solidContainer.getId()}`)
        .start();
    }

    const port = solidContainer.getMappedPort(8080);
    const host = solidContainer.getHost();
    baseURL = `http://${host}:${port}`;

    // Workaround: backendContainer waitStrategy geht nicht da es das solidContainer netzwerk nutzt,
    // aber der Solid Container kann nur auf den eigenen Port warten (da das Backend erst danach gestartet wird)
    // daher hier manuell auf den backendContainer Port 8080 (über den solidContainer) warten
    while (true) {
      try {
        const response = await fetch(baseURL);
        if (response.ok) {
          break;
        }
      } catch {
        // Fehler ist zu erwarten (kielcloak muss erst starten), ignorieren
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`Backend container started at ${baseURL}`);
  } catch (error) {
    console.error("Failed to start backend container:", error);
    throw error;
  }
}, 300000);

afterAll(async () => {
  if (backendContainer) {
    await backendContainer.stop();
  }
  if (solidContainer) {
    await solidContainer.stop();
  }
});

describe("Kielcloak API is healthy", () => {
  it("has authenticated with CSS and responds with status 200", async () => {
    expect(solidContainer).toBeDefined();
    expect(solidContainer.getId()).toBeTruthy();

    expect(backendContainer).toBeDefined();
    expect(backendContainer.getId()).toBeTruthy();

    const response = await fetch(baseURL);
    expect(response.status).toBe(200);
  });
});

describe("GET /", () => {
  it("should return OK from running backend", async () => {
    const response = await request(baseURL)
      .get("/")
      .set("User-Agent", "Integration-Test");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Backend running");
  });
});

describe("POST /send_address - Integration Tests", () => {
  it("should reject requests with empty destinations array", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      sourceURL: STUD_PROFILE_URL,
      targets: [],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("should reject requests with missing web_id", async () => {
    const payload = {
      sourceURL: STUD_PROFILE_URL,
      targets: ["http://localhost:3000/uni/MailBox"],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("should reject requests with missing sourceURL", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      targets: ["http://localhost:3000/uni/MailBox"],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("should not respond unauthorized for valid address submission", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      sourceURL: STUD_PROFILE_URL,
      targets: [
        "http://localhost:3000/uni/MailBox",
        "http://localhost:3000/bank/MailBox",
      ],
    };

    const response = await request(baseURL).post("/send_address").send(payload);

    // Mit echter Anmeldung darf kein Unauthorized zurückkommen
    expect(response.status).not.toBe(401);
  });
});

describe("POST /antrag/new - Antrag Creation Tests", () => {
  it("should reject requests with missing web_id", async () => {
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

  it("should reject requests with missing antrag_type", async () => {
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

  it("should reject requests with missing ttl_file", async () => {
    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "bafoeg",
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing or invalid parameters");
  });

  it("should not respond unauthorized for valid antrag creation", async () => {
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ;
  :applicant <http://example.org/student> ;
  :type "bafoeg" .`;
    const payload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "bafoeg",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    const response = await request(baseURL).post("/antrag/new").send(payload);

    // Mit echter Anmeldung darf kein Unauthorized zurückkommen
    expect(response.status).not.toBe(401);
  });

  it("should handle various antrag types without validation errors", async () => {
    const antragTypes = ["bafoeg", "wohngeld", "kindergeld", "elterngeld"];

    for (const antragType of antragTypes) {
      const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ; :type "${antragType}" .`;
      const payload = {
        web_id: STUD_WEBID_URL,
        antrag_type: antragType,
        ttl_file: Buffer.from(ttlContent).toString("base64"),
      };

      const response = await request(baseURL).post("/antrag/new").send(payload);

      // Sollte nicht wegen fehlender Auth scheitern
      expect(response.status).not.toBe(401);
    }
  });
});

describe("Error Handling", () => {
  it("should handle malformed JSON gracefully", async () => {
    const response = await request(baseURL)
      .post("/send_address")
      .set("Content-Type", "application/json")
      .send("{ invalid json }");

    expect(response.status).toBe(400);
  });

  it("should handle malformed JSON for antrag endpoint", async () => {
    const response = await request(baseURL)
      .post("/antrag/new")
      .set("Content-Type", "application/json")
      .send("{ invalid json }");

    expect(response.status).toBe(400);
  });
});

describe("Happy Path - Valid Request Structures", () => {
  it("should structure valid payloads correctly for both endpoints", async () => {
    // Teste Struktur für send_address
    const addressPayload = {
      web_id: STUD_WEBID_URL,
      sourceURL: STUD_PROFILE_URL,
      targets: ["http://localhost:3000/uni/MailBox"],
    };

    const addressResponse = await request(baseURL)
      .post("/send_address")
      .send(addressPayload);

    expect(addressResponse.status).not.toBe(401);

    // Teste Struktur für antrag/new
    const ttlContent = `@prefix : <http://example.org/antrag/>.
:antrag a :Application ;
  :applicant <http://example.org/student> ;
  :type "bafoeg" .`;

    const antragPayload = {
      web_id: STUD_WEBID_URL,
      antrag_type: "bafoeg",
      ttl_file: Buffer.from(ttlContent).toString("base64"),
    };

    const antragResponse = await request(baseURL)
      .post("/antrag/new")
      .send(antragPayload);

    expect(antragResponse.status).not.toBe(401);
  });
});
