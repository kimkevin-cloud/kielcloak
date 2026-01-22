import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  landlordMailboxFromWebId,
  createTenantWebIdFile,
  sanitizeForFilename,
  buildAnfrageFilename,
} from "../src/index.js";
import { extractPodname } from "../src/utils/extractPodname.js";
import { createDritteFile } from "../src/utils/createDritteFile.js";
import { moveData } from "../src/utils/moveData.js";
import { antragExists } from "../src/utils/antragExists.js";
import { createAntragACL } from "../src/utils/createAntragACL.js";
import { formatForms } from "../src/utils/formatForms.js";
import { SessionLogin } from "../src/utils/Login.js";
import { session } from "../src/index.js";
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

describe("landlordMailboxFromWebId", () => {
  it("should return the mailbox URL derived from the landlord WebID", () => {
    const landlordWebId = "https://example.com/profile/card#me";
    const expectedMailbox = "https://example.com/MailBox/";

    expect(landlordMailboxFromWebId(landlordWebId)).toBe(expectedMailbox);
  });

  it("should throw an error if the WebID format is invalid", () => {
    const invalidWebId = "https://example.com/some/trashy/path";

    expect(() => landlordMailboxFromWebId(invalidWebId)).toThrowError(
      "Ungültige Vermieter WebID",
    );
  });
});

describe("createTenantWebIdFile", () => {
  it("should create a Blob with valid Turtle content", async () => {
    const params = {
      tenantWebId: "https://tenant.example.com/profile/card#me",
      givenName: "Max",
      familyName: "Mustermann",
      fullName:
        "Max Michael Herbert Mustermann IV von Musterstadt mit der Gnade Gottes und gepriesen von Ihm Klaus Meier dem König von Deutschland und Verteidiger des Glaubens und aller Menschen unseres Musterlandes unter dem Musterhimmel bei den sieben Seen",
    };

    const blob = createTenantWebIdFile(params);
    const content = await blob.text();

    expect(blob.type).toBe("text/turtle");
    expect(content).toContain('foaf:givenName "Max";');
    expect(content).toContain('foaf:familyName "Mustermann";');
    expect(content).toContain(
      'schema:name "Max Michael Herbert Mustermann IV von Musterstadt mit der Gnade Gottes und gepriesen von Ihm Klaus Meier dem König von Deutschland und Verteidiger des Glaubens und aller Menschen unseres Musterlandes unter dem Musterhimmel bei den sieben Seen";',
    );
    expect(content).toContain(
      'schema:identifier "https://tenant.example.com/profile/card#me"',
    );
  });

  it("should escape special characters in the content", async () => {
    const params = {
      tenantWebId: 'https://tenant.example.com/"profile"/card#me',
      givenName: 'Ma"x',
      familyName: "Muster\\mann",
      fullName:
        "Max Michael Herbert Mustermann IV\nvon Musterstadt mit der Gnade Gottes und gepriesen von Ihm Klaus Meier\ndem König von Deutschland und Verteidiger des Glaubens und aller Menschen unseres Musterlandes\nunter dem Musterhimmel bei den sieben Seen",
    };

    const blob = createTenantWebIdFile(params);
    const content = await blob.text();

    // Check for escaped characters
    expect(content).toContain('foaf:givenName "Ma\\"x";');
    expect(content).toContain('foaf:familyName "Muster\\\\mann";');
    expect(content).toContain(
      'schema:name "Max Michael Herbert Mustermann IV\\nvon Musterstadt mit der Gnade Gottes und gepriesen von Ihm Klaus Meier\\ndem König von Deutschland und Verteidiger des Glaubens und aller Menschen unseres Musterlandes\\nunter dem Musterhimmel bei den sieben Seen";',
    );
    expect(content).toContain(
      'schema:identifier "https://tenant.example.com/\\"profile\\"/card#me"',
    );
  });
});

describe("sanitizeForFilename", () => {
  it("should replace https:// with https-", () => {
    expect(sanitizeForFilename("https://example.com")).toBe(
      "https-example.com",
    );
  });

  it("should replace http:// with http-", () => {
    expect(sanitizeForFilename("http://example.com")).toBe("http-example.com");
  });

  it("should replace special characters with dashes", () => {
    expect(sanitizeForFilename("file name with spaces")).toBe(
      "file-name-with-spaces",
    );
    expect(sanitizeForFilename("file/name:foo")).toBe("file-name-foo");
  });

  it("should remove leading and trailing dashes", () => {
    expect(sanitizeForFilename("-file-name-")).toBe("file-name");
  });

  it("should handle multiple dashes", () => {
    expect(sanitizeForFilename("file--name")).toBe("file-name");
  });
});

describe("buildAnfrageFilename", () => {
  it("should build a valid filename with base64 encoded WebID", () => {
    const tenantName = "Max Mustermann";
    const tenantWebId = "https://tenant.example.com/webid";

    const expectedBase64 = Buffer.from(tenantWebId, "utf8")
      .toString("base64")
      .replace(/=+$/g, "");
    const expectedFilename = `anfrage_Max-Mustermann_${expectedBase64}.ttl`;
    expect(buildAnfrageFilename(tenantName, tenantWebId)).toBe(
      expectedFilename,
    );
  });
});

describe("extractPodname", () => {
  it("Extrahiert Podname aus einer gültigen WebID", () => {
    const WebID = "https://solid.valetudo.casa/stud/profile/card#me";
    expect(extractPodname(WebID)).toBe("stud");
  });

  it("Throws error wenn die gegebene WebID ungültig ist.", () => {
    const FakeWebID1 = "";
    const FakeWebID2 = "https://localhost:3000/";
    const FakeWebID3 = "notaURL";

    expect(() => extractPodname(FakeWebID1)).toThrow("Ungültige URL");
    expect(() => extractPodname(FakeWebID2)).toThrow(
      "Podname konnte nicht extrahiert werden",
    );
    expect(() => extractPodname(FakeWebID3)).toThrow("URL ist nicht valide");
  });
});

describe("formatForms", () => {
  const mockEncodedWebID =
    "aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l";

  const mockFormURLs = [
    "https://solid.valetudo.casa/kielcloak/antraege/antrag_begruessungsgeld_aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l_1768012811111.ttl",
    "https://solid.valetudo.casa/kielcloak/antraege/antrag_ummeldung3_aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l_1768012855555.ttl",
    "https://solid.valetudo.casa/kielcloak/antraege/antrag_ummeldung4_aHR0cDovL2xvY2FsaG9zdDozMDAwL3N0dWQvcHJvZmlsZS9jYXJkI21l_1768012899999.ttl",
  ];

  it("Extrahiert antrag_type und timestamp aus einer Liste von URLs", () => {
    expect(formatForms(mockFormURLs, mockEncodedWebID)).toEqual([
      { antrag_type: "begruessungsgeld", timestamp: "1768012811111" },
      { antrag_type: "ummeldung3", timestamp: "1768012855555" },
      { antrag_type: "ummeldung4", timestamp: "1768012899999" },
    ]);
  });

  it("Soll eine leere Liste zurückgeben, wenn es keinen Antrag für die gegebene WebID gibt", () => {
    const fakeWebID = "aHR0cDovL2xvY2FsaG9_FAKE_WEB_ID_WQvcHJvZmlsZS9jYXJkI21l";

    expect(formatForms(mockFormURLs, fakeWebID)).toEqual([]);
  });

  it("Soll eine leere Liste zurückgeben bei leerer URL-Liste", () => {
    expect(formatForms([], mockEncodedWebID)).toEqual([]);
  });

  it("Ignoriert URLs mit falschem Dateiformat", () => {
    const urls = [
      "https://example.com/antrag_test_webid_123.pdf",
      "https://example.com/not-an-antrag.txt",
    ];

    expect(formatForms(urls, mockEncodedWebID)).toEqual([]);
  });

  it("Ignoriert URLs ohne Dateinamen", () => {
    const urls = ["https://solid.valetudo.casa/kielcloak/antraege/"];

    expect(formatForms(urls, mockEncodedWebID)).toEqual([]);
  });

  it("Verarbeitet URLs mit einfachen Anführungszeichen korrekt", () => {
    const urls = [
      "'https://solid.valetudo.casa/kielcloak/antraege/antrag_test_" +
        mockEncodedWebID +
        "_123.ttl'",
    ];

    expect(formatForms(urls, mockEncodedWebID)).toEqual([
      { antrag_type: "test", timestamp: "123" },
    ]);
  });
});
