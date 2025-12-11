import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionLogin, createFile, moveData, session } from "../src/index";
import { overwriteFile } from "@inrupt/solid-client";

// Mock dependencies
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

vi.mock("@inrupt/solid-client-authn-node", () => ({
  getSessionFromStorage: vi.fn(),
  Session: mockSessionClass,
}));

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
}));

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));

// Mock process.env
const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    CLIENT_ID: "test-client-id",
    CLIENT_SECRET: "test-client-secret",
    OIDC_ISSUER: "https://test-issuer.com",
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.clearAllMocks();
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
      oidcIssuer: "https://test-issuer.com",
      tokenType: "client_secret",
    });
  });

  it("should throw error if env vars are missing", async () => {
    process.env.CLIENT_ID = undefined;

    await expect(SessionLogin()).rejects.toThrow(
      "Missing environment variables CLIENT_ID, CLIENT_SECRET, or OIDC_ISSUER",
    );
  });
});

describe("createFile", () => {
  it("should create a TTL file with correct content", async () => {
    const sourceURL = "https://example.com/data";
    const filename = "test.ttl";
    const targetURL = "https://pod.example.com/MailBox/";

    const result = await createFile(sourceURL, filename, targetURL);

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("text/turtle");
  });
});

describe("moveData", () => {
  it("should move data successfully", async () => {
    session.info.webId = "https://test-user.com/profile/card#me";
    session.fetch = vi.fn();

    vi.mock("@inrupt/solid-client", () => ({
      overwriteFile: vi.fn(),
    }));

    const sourceURL = "https://example.com/data";
    const filename = "test.ttl";
    const targetURL = "https://pod.example.com/MailBox/";

    const file = await createFile(sourceURL, filename, targetURL);

    expect(file).toBeInstanceOf(Blob);
    await moveData(file, filename, targetURL);

    expect(overwriteFile).toHaveBeenCalledWith(targetURL + filename, file, {
      contentType: "text/turtle",
      fetch: session.fetch,
    });
  });

  it("should throw error if file or targetURL is missing", async () => {
    const file = await createFile(
      "https://example.com/data",
      "test.ttl",
      "https://pod.example.com/MailBox/",
    );
    await expect(
      moveData(null as any, "test.ttl", "https://pod.example.com/MailBox/"),
    ).rejects.toThrow(
      "sourceURL, fileName oder targetURL ist nicht definiert!",
    );
    await expect(moveData(file, "", "")).rejects.toThrow(
      "sourceURL, fileName oder targetURL ist nicht definiert!",
    );
  });

  it("should throw error if file doesn't end with .ttl", async () => {
    await expect(
      createFile(
        "https://example.com/data",
        "test.txt",
        "https://pod.example.com/MailBox/",
      ),
    ).rejects.toThrow("Dateiname muss mit .ttl enden!");
  });

  it("should throw error if not logged in", async () => {
    session.info.webId = null;
    const file = await createFile(
      "https://example.com/data",
      "test.ttl",
      "https://pod.example.com/MailBox/",
    );

    await expect(
      moveData(file, "test.ttl", "https://pod.example.com/MailBox/"),
    ).rejects.toThrow("KielCloak nicht eingeloggt oder WebID fehlt.");
  });
});
