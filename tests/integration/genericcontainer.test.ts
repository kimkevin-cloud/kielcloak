import { beforeAll, afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import fs from "fs";

let backendContainer: StartedTestContainer;
let solidContainer: StartedTestContainer;
// let forwardServer: net.Server | null = null;
let baseURL: string;
// const SOLID_BASE_URL = "http://localhost:3000";

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

    solidContainer = await new GenericContainer("armsolid")
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
      // .withPlatform("linux/amd64")
      .start();

    const solidHost = solidContainer.getHost();
    const solidPort = solidContainer.getMappedPort(3000);
    console.log(`CSS container started at ${solidHost}:${solidPort}`);

    // Starte Backend in Docker-Container
    const context = path.resolve(process.cwd());
    const built = await GenericContainer.fromDockerfile(context).build();
    backendContainer = await built
      .withEnvironment({
        CLIENT_ID: envVars.CLIENT_ID,
        CLIENT_SECRET: envVars.CLIENT_SECRET,
        OIDC_ISSUER: envVars.OIDC_ISSUER,
      })
      .withNetworkMode(`container:${solidContainer.getId()}`)
      // .withWaitStrategy(Wait.forHttp("/"))
      .start();

    // Im Host-Modus ist der Port direkt 8080
    const port = solidContainer.getMappedPort(8080);
    const host = solidContainer.getHost();
    baseURL = `http://${host}:${port}`;

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

describe("both containers start", () => {
  it("builds and starts successfully", async () => {
    expect(solidContainer).toBeDefined();
    expect(solidContainer.getId()).toBeTruthy();

    expect(backendContainer).toBeDefined();
    expect(backendContainer.getId()).toBeTruthy();

    // GET root to check if api is alive
    while (true) {
      try {
        const response = await fetch(baseURL);
        if (response.ok) {
          break;
        }
      } catch (e) {
        console.log("Waiting for container to be ready...");
        if (e instanceof Error) {
          console.log(e);
        }
        // Errors are expected if the container is not yet ready, so we ignore them.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});
