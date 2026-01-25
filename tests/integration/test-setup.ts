import path from "node:path";
import fs from "fs";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

export interface TestContainerSetup {
  backendContainer: StartedTestContainer;
  solidContainer: StartedTestContainer;
  baseURL: string;
  solidBaseURL: string;
}

export async function setupContainers(): Promise<TestContainerSetup> {
  const projectRoot = process.cwd();

  const SOLID_BASE_URL = "http://localhost:3000";
  const KIELCLOAK_POD_URL = `${SOLID_BASE_URL}/kielcloak/`;

  const envVars = {
    CLIENT_ID: "_e867d54b-cb84-4896-9bee-55541dfd755d",
    CLIENT_SECRET:
      "7e2cd0903f1d235906140f0c0d6f59362ee11a79e9d64b31acd608e08fb04342824ddf4b413eea566d47d85d022507e00a4678112d0fc41cea54def2ace23800",
    OIDC_ISSUER: process.env.OIDC_ISSUER || "http://localhost:3000",
    NODE_ENV: "test",
  };

  // Find solid-data directory
  const solidDataCandidates = [
    path.resolve(projectRoot, "tests", "integration", "solid-data"),
  ];
  const solidDataDir = solidDataCandidates.find(fs.existsSync);
  if (!solidDataDir) {
    throw new Error(
      `No solid-data directory found. Checked: ${solidDataCandidates.join(", ")}`,
    );
  }

  console.log(`Using solid-data from: ${solidDataDir}`);

  // Start Community Solid Server
  const solidContainer = await new GenericContainer(
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
    .withCopyDirectoriesToContainer([{ source: solidDataDir, target: "/data" }])
    .withExposedPorts(3000)
    .withExposedPorts(8080)
    .withWaitStrategy(Wait.forHttp("/", 3000))
    .withStartupTimeout(120_000)
    .withPlatform("linux/amd64")
    .start();

  console.log(
    `CSS container started at ${solidContainer.getHost()}:${solidContainer.getMappedPort(3000)}`,
  );

  let backendContainer: StartedTestContainer;

  // Start backend container
  try {
    const context = path.resolve(process.cwd());
    const built = await GenericContainer.fromDockerfile(context).build();
    backendContainer = await built
      .withEnvironment({
        CLIENT_ID: envVars.CLIENT_ID,
        CLIENT_SECRET: envVars.CLIENT_SECRET,
        OIDC_ISSUER: envVars.OIDC_ISSUER,
        PUBLIC_SOLID_URL: SOLID_BASE_URL,
        KIELCLOAK_POD_URL: KIELCLOAK_POD_URL,
      })
      .withNetworkMode(`container:${solidContainer.getId()}`)
      .start();
  } catch (buildError) {
    console.warn(
      "Failed to build backend image, falling back to node:22 runner",
      buildError,
    );

    backendContainer = await new GenericContainer("node:22")
      .withBindMounts([
        {
          source: path.resolve(process.cwd()),
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
        KIELCLOAK_POD_URL: KIELCLOAK_POD_URL,
        NODE_ENV: "development",
      })
      .withNetworkMode(`container:${solidContainer.getId()}`)
      .start();
  }

  const port = solidContainer.getMappedPort(8080);
  const host = solidContainer.getHost();
  const baseURL = `http://${host}:${port}`;

  // Wait for backend to respond
  while (true) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) break;
    } catch {
      // Backend not ready yet, retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`Backend container started at ${baseURL}`);

  return {
    backendContainer,
    solidContainer,
    baseURL,
    solidBaseURL: SOLID_BASE_URL,
  };
}

export async function teardownContainers(
  setup: TestContainerSetup | undefined,
): Promise<void> {
  if (!setup) return;

  try {
    if (setup.backendContainer) {
      await setup.backendContainer.stop();
    }
  } catch (e) {
    console.warn("Failed to stop backend container:", e);
  }

  try {
    if (setup.solidContainer) {
      await setup.solidContainer.stop();
    }
  } catch (e) {
    console.warn("Failed to stop solid container:", e);
  }
}

/**
 * Extracts podname from a WebID
 * @param webId WebID (e.g., "http://localhost:3000/stud/profile/card#me")
 * @returns Podname (e.g., "stud")
 */
export function extractPodname(webId: string): string {
  const match = webId.match(/https?:\/\/[^/]+\/([^/]+)\/profile/);
  return match?.[1] ?? "";
}

/**
 * Computes expected filename for address reference
 * @param sourceURL Original address file URL
 * @param webId WebID of the student
 * @returns Transformed filename with podname
 */
export function expectedTargetFilename(
  sourceURL: string,
  webId: string,
): string {
  const raw = sourceURL.split("/").pop() || "";
  const podname = extractPodname(webId);
  return raw.replace(/^([^-]+)-/, `$1_${podname}-`);
}

/**
 * Computes path in solid-data test fixture
 * @param targetUrl Target URL (e.g., "http://localhost:3000/uni/MailBox/")
 * @param filename Filename to append
 * @returns Path in /data fixture directory
 */
export function pathInSolidData(targetUrl: string, filename: string): string {
  const url = new URL(targetUrl);
  const basePath = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  return `/data${basePath}${filename}`;
}
