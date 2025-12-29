import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SessionLogin,
  antragExists,
  createAntragACL,
  createDritteFile,
  moveData,
  session,
} from "../src/index";
import * as solidClient from "@inrupt/solid-client";

vi.mock("@inrupt/solid-client-authn-node", () => {
  // Define the mock class INSIDE the factory so it's available when hoisted
  const mockSessionClass = vi.fn().mockImplementation(function () {
    const login = vi.fn();
    const logout = vi.fn();
    const fetch = vi.fn();
    const info = {
      isLoggedIn: false,
      webId: null,
      sessionId: "12345",
    };
    return {
      login,
      logout,
      fetch,
      info,
    };
  });

  return {
    getSessionFromStorage: vi.fn(),
    Session: mockSessionClass,
  };
});

// Mock sessionStorage
global.sessionStorage = {
  getItem: vi.fn((key) => (key === "sessionId" ? "12345" : null)),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

// Mock fs promises
vi.mock("fs", () => ({
  promises: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
  },
}));

// Mock solid-client functions
vi.mock("@inrupt/solid-client", () => ({
  deleteFile: vi.fn(),
  overwriteFile: vi.fn(),
  getSolidDataset: vi.fn(),
  getContainedResourceUrlAll: vi.fn(),
  mockSolidDatasetFrom: vi.fn((url: string) => ({ url })),
}));

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));

// Mock process.env
const originalEnv = process.env;
beforeEach(() => {
  vi.resetModules();

  process.env = {
    ...originalEnv,
    CLIENT_ID: "test-client-id",
    CLIENT_SECRET: "test-client-secret",
    OIDC_ISSUER: "https://test-issuer.com",
    KIELCLOAK_POD_URL: "https://test-pod.com/",
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.clearAllMocks();
  vi.resetModules();
});

describe("SessionLogin", () => {
  it("should login successfully with valid env vars", async () => {
    // Mock the session.login method to prevent network calls
    session.login = vi.fn().mockResolvedValue(undefined);
    session.info.isLoggedIn = true;
    session.info.webId = "https://test-user.com/profile/card#me";
    session.fetch = vi.fn().mockResolvedValue(new Response());

    await SessionLogin();

    expect(session.login).toHaveBeenCalledWith({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      oidcIssuer: "https://test-issuer.com/",
      tokenType: "DPoP",
    });
  });

  it("should throw error if env vars are missing", async () => {
    process.env.CLIENT_ID = undefined;

    await expect(SessionLogin()).rejects.toThrow(
      "Missing environment variables CLIENT_ID, CLIENT_SECRET, or OIDC_ISSUER",
    );
  });
});

describe("createDritteFile", () => {
  it("should create a TTL file with correct content", () => {
    const sourceURL = "https://example.com/data";
    const filename = "test.ttl";
    const targetURL = "https://pod.example.com/MailBox/";

    const result = createDritteFile(sourceURL, filename, targetURL);

    const content = `
@prefix : <${targetURL}${filename}>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.

:adressdata
  owl:sameAs <${sourceURL}>.
  `.trim();

    const blob = new Blob([content], { type: "text/turtle" });

    expect(result).not.toBeNull();
    expect(result).toEqual(blob);
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("text/turtle");
  });
});

describe("createAntragACL", () => {
  it("should create an ACL file with correct content", () => {
    // session WebID mocken
    session.info.webId = "https://kielcloak/profile/card#me";

    const webID = "https://test-user.com/profile/card#me";
    const fileName = "test.ttl";
    const podUrlParsed = new URL(process.env.KIELCLOAK_POD_URL!).toString();

    const result = createAntragACL(webID, fileName);

    const content = `
@prefix acl: <https://www.w3.org/ns/auth/acl#>.

<#owner>
  a acl:Authorization;
  acl:agent <${session.info.webId}>;
  acl:accessTo <${podUrlParsed}antraege/${fileName}>;
  acl:default <./>;
  acl:mode 
    acl:Write, acl:Control, acl:Read.

<#${webID}>
  a acl:Authorization;
  acl:agent <${webID}>;
  acl:accessTo <${podUrlParsed}antraege/${fileName}>;
  acl:mode acl:Read.
`.trim();

    const blob = new Blob([content], { type: "text/turtle" });

    expect(result).not.toBeNull();
    expect(result).toEqual(blob);
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("text/turtle");
  });
});

describe("moveData", () => {
  it("should move data successfully", async () => {
    session.info.webId = "https://kielcloak/profile/card#me";
    session.fetch = vi.fn();

    // vi.mock("@inrupt/solid-client", () => ({
    //   overwriteFile: vi.fn(),
    // }));

    const sourceURL = "https://example.com/data";
    const filename = "test.ttl";
    const targetURL = "https://pod.example.com/MailBox/";

    const file = createDritteFile(sourceURL, filename, targetURL);

    expect(file).toBeInstanceOf(Blob);
    await moveData(file, filename, targetURL);

    expect(solidClient.overwriteFile).toHaveBeenCalledWith(
      targetURL + filename,
      file,
      {
        contentType: "text/turtle",
        fetch: session.fetch,
      },
    );
  });

  it("should throw error if file or targetURL is missing", async () => {
    const file = createDritteFile(
      "https://example.com/data",
      "test.ttl",
      "https://pod.example.com/MailBox/",
    );
    await expect(
      // simulate missing file by passing undefined
      moveData(
        undefined as unknown as Blob,
        "test.ttl",
        "https://pod.example.com/MailBox/",
      ),
    ).rejects.toThrow(
      "sourceURL, fileName oder targetURL ist nicht definiert!",
    );
    await expect(moveData(file, "", "")).rejects.toThrow(
      "sourceURL, fileName oder targetURL ist nicht definiert!",
    );
  });

  it("should throw error if file doesn't end with .ttl", () => {
    expect(() =>
      createDritteFile(
        "https://example.com/data",
        "test.txt",
        "https://pod.example.com/MailBox/",
      ),
    ).toThrow("Dateiname muss mit .ttl enden!");
  });

  it("should throw error if not logged in", async () => {
    session.info.webId = "";
    const file = createDritteFile(
      "https://example.com/data",
      "test.ttl",
      "https://pod.example.com/MailBox/",
    );

    await expect(
      moveData(file, "test.ttl", "https://pod.example.com/MailBox/"),
    ).rejects.toThrow("KielCloak nicht eingeloggt oder WebID fehlt.");
  });
});

describe("antragExists", () => {
  it("should return true if antrag exists", async () => {
    session.info.webId = "https://kielcloak/profile/card#me";
    session.info.isLoggedIn = true;

    const fileName = "test.ttl";
    const podUrlParsed = new URL(process.env.KIELCLOAK_POD_URL!);

    vi.mocked(solidClient.getSolidDataset).mockResolvedValue(
      solidClient.mockSolidDatasetFrom("https://example.com"),
    );

    vi.mocked(solidClient.getContainedResourceUrlAll).mockReturnValue([
      `${podUrlParsed}antraege/${fileName}`,
    ]);

    const result = await antragExists(fileName);

    expect(result).toBe(true);
  });

  it("should return false if antrag does not exist", async () => {
    session.info.webId = "https://kielcloak/profile/card#me";
    session.info.isLoggedIn = true;

    const fileName = "test.ttl";
    const podUrlParsed = new URL(process.env.KIELCLOAK_POD_URL!);

    vi.mocked(solidClient.getSolidDataset).mockResolvedValue(
      solidClient.mockSolidDatasetFrom("https://example.com"),
    );

    vi.mocked(solidClient.getContainedResourceUrlAll).mockReturnValue([
      `${podUrlParsed}antraege/andere_datei.txt`,
    ]);

    const result = await antragExists(fileName);

    expect(result).toBe(false);
  });

  it("should throw error if not logged in", async () => {
    session.info.webId = "";
    session.info.isLoggedIn = false;

    // const webID = "https://test-user.com/profile/card#me";
    const fileName = "test.ttl";

    await expect(antragExists(fileName)).rejects.toThrow(
      "KielCloak nicht eingeloggt oder WebID fehlt.",
    );
  });

  it("should throw error if KIELCLOAK_POD_URL is not defined", async () => {
    session.info.webId = "https://kielcloak/profile/card#me";
    session.info.isLoggedIn = true;
    process.env.KIELCLOAK_POD_URL = undefined;

    const fileName = "test.ttl";

    await expect(antragExists(fileName)).rejects.toThrow(
      "KIELCLOAK_POD_URL ist nicht definiert!",
    );
  });

  it("should throw error if fileName does not end with .ttl", async () => {
    session.info.webId = "https://kielcloak/profile/card#me";
    session.info.isLoggedIn = true;

    const fileName = "test.txt";

    await expect(antragExists(fileName)).rejects.toThrow(
      "Dateiname muss mit .ttl enden!",
    );
  });

  it("should throw error if there was a problem loading the container metadata", async () => {
    session.info.webId = "https://kielcloak/profile/card#me";
    session.info.isLoggedIn = true;

    const fileName = "test.ttl";

    vi.mocked(solidClient.getSolidDataset).mockRejectedValue(new Error("test"));

    await expect(antragExists(fileName)).rejects.toThrow(
      "Container konnte nicht geladen werden: test",
    );
  });
});
