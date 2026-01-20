// Hier sollen die eigentlichen Implementationen stehen
// Definitionen in index.d.ts !

import express from "express";
import type { Request, Response } from "express";
import { Session } from "@inrupt/solid-client-authn-node";
import dotenv from "dotenv"; // Dotenv für das Lesen von env vars
import cors from "cors"; // To handle Cross Origin Ressource Sharing
import {
  getContainedResourceUrlAll,
  getResourceInfo,
  getSolidDataset,
  isContainer
} from "@inrupt/solid-client";
import { Buffer } from "buffer";
import { extractPodname } from "./utils/extractPodname.js";
import { createDritteFile } from "./utils/createDritteFile.js";
import { moveData } from "./utils/moveData.js";
import { antragExists } from "./utils/antragExists.js";
import { createAntragACL } from "./utils/createAntragACL.js";
import { formatForms } from "./utils/formatForms.js";
import { startServer } from "./utils/Login.js";

dotenv.config();

const app = express();
const port = 8080;
const session = new Session(); // Backend Session

app.use(express.static("public"));
app.use(express.json());
app.use(cors());

app.get("/", (_: Request, res: Response) => {
  res.send("Backend running!");
});

if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

/**
 * Handelt den Request aus dem Frontend, um die neue Adresse des Studentens in den Pods von den Dritten (aka. Uni oder Bank) zu speichern
 */
app.post("/send_address", async (req: Request, res: Response) => {
  const WebID: string = req.body.web_id;
  const sourceURL: string = req.body.sourceURL;
  const targets: string[] = req.body.targets;

  // Input validation
  if (!WebID || !sourceURL || !targets || targets.length === 0) {
    const errorMessage = "Missing or invalid parameters";
    // console.error(errorMessage);
    return res.status(400).json({
      error: errorMessage,
      message: "web_id, sourceURL, and non-empty targets array are required",
    });
  }

  // Authentication check
  if (!session.info.webId || !session.info.isLoggedIn) {
    const errorMessage = "Unauthorized";
    // console.error(errorMessage);
    return res.status(401).json({
      error: errorMessage,
      message: "KielCloak Session nicht autorisiert oder authentifiziert",
    });
  }

  try {
    const podname = extractPodname(WebID);
    if (!podname) {
      const errorMessage = "Ungültige WebID";
      // console.error(errorMessage);
      return res.status(400).json({
        error: errorMessage,
        message: "Podname konnte aus WebID gelesen werden",
      });
    }

    // podname aus WebID an Dateinamen anhängen
    const filename = sourceURL.split("/").pop(); // "adressenbestaetigung-1765307371.ttl"
    const newFilename = filename?.replace(/^([^-]+)-/, `$1_${podname}-`);

    for (const element of targets) {
      try {
        // Datei als Blob erstellen und absenden
        if (!filename || !newFilename) {
          throw new Error("Dateiname konnte nicht geparsed werden");
        }
        const file = createDritteFile(sourceURL, newFilename, element);
        await moveData(file, newFilename, element);
      } catch (error) {
        // console.error(`Fehler bei der Kommunikation mit ${element}:`, error);

        // Return error immediately for the first failed target
        return res.status(500).json({
          message: `Adresse konnte nicht mit ${element} geteilt werden: ${error instanceof Error ? error : ""}`,
        });
      }
    }

    // erfolgreiches Senden der Adresse an alle Dritten
    return res.status(200).json({
      forms: {},
      message: "OK",
    });
  } catch (error) {
    // console.error("Unerwarteter Fehler in /save_address:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: `Ein unerwarteter Fehler ist im Prozess aufgetreten: ${error instanceof Error ? error : ""}`,
    });
  }
});

/**
 * Handelt das Speichern eines neuen Antrags im KielCloak Pod
 */
app.post("/antrag/new", async (req: Request, res: Response) => {
  const WebID: string = req.body.web_id;
  const antrag_type: string = req.body.antrag_type;
  const ttl_file_base64: string = req.body.ttl_file;

  // Blob der TTL-Datei aus Base64 extrahieren
  const ttl_file = new Blob([Buffer.from(ttl_file_base64, "base64")]);

  // Input validation
  if (!WebID || !antrag_type || !ttl_file) {
    const errorMessage = "Missing or invalid parameters";
    // console.error(errorMessage);
    return res.status(400).json({
      error: errorMessage,
      message: "web_id, antrag_type oder ttl_file nicht definiert!",
    });
  }

  // Authentication check
  if (!session.info.webId || !session.info.isLoggedIn) {
    const errorMessage = "Unauthorized";
    // console.error(errorMessage);
    return res.status(401).json({
      error: errorMessage,
      message: "KielCloak Session nicht autorisiert oder authentifiziert",
    });
  }

  try {
    const podUrl = new URL(process.env.KIELCLOAK_POD_URL!).toString();
    const podUrlSanitized = podUrl.endsWith("/") ? podUrl : podUrl + "/";
    const base64WebID = Buffer.from(WebID, "utf8")
      .toString("base64")
      .replace(/=+$/g, "");
    if (antrag_type === "begruessungsgeld") {
      const entries = await listDirecotries(`${podUrlSanitized}antraege/`);
      for (const entry of entries) {
        if (entry.url.includes(`${antrag_type}_${base64WebID}`)) {
          return res.status(400).json({
            error: "Antrag konnte nicht erstellt werden",
            message: "Antrag für Begrssungsgeld existiert bereits",
          });
        }
      }
    }

    const timestamp = Date.now();
    const filename = `antrag_${antrag_type}_${base64WebID}_${timestamp}.ttl`;
    // Antrag darf noch nicht existieren
    if (await antragExists(filename)) {
      const errorMessage = "Antrag existiert bereits";
      // console.error(errorMessage);
      return res.status(400).json({
        error: errorMessage,
        message: "Antrag existiert bereits",
      });
    }

    try {
      // Antrag und ACL dazu anlegen und absenden bzw. im eigenen Pod speichern
      const aclFile = createAntragACL(WebID, filename);
      await moveData(ttl_file, filename, podUrlSanitized + "antraege/" || "");
      await moveData(
        aclFile,
        filename + ".acl",
        podUrlSanitized + "antraege/" || ""
      );
    } catch (error) {
      // console.error(`Fehler bei der Kommunikation mit KielCloak Pod`, error);

      // Fehler bei der Kommunikation mit KielCloak Pod
      return res.status(500).json({
        message: `Antrag konnte im KielCloak Pod gespeichert werden: ${error instanceof Error ? error : ""}`,
      });
    }

    // erfolgreiches Senden des Antrags
    return res.status(200).json({
      message: "OK",
    });
  } catch (error) {
    // console.error("Unerwarteter Fehler in /antrag/new:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: `Ein unerwarteter Fehler ist im Prozess aufgetreten: ${error instanceof Error ? error : ""}`,
    });
  }
});

/**
 * Nimmt WebID des Nutzers und gibt einen neuen JSON Objekt zurück mit antrag_type und timestamp
 * @param urls Liste alles URLs, die man transformieren muss.
 * @returns JSON Objekt der Art
 * {
 *  forms {
 *    "antrag_type": string,
 *     "timestamp": string
 *  }[]
 * }
 * Gibt alle Anträge des Nutzers zurück 
 */
app.get("/antrag/all", async (req: Request, res: Response) => {
  const base64WebID = req.query.web_id as string;

  // Input validation
  if (!base64WebID) {
    const errorMessage = "Missing or invalid WebID";
    console.error(errorMessage);
    return res.status(400).json({
      error: errorMessage,
      message: "web_id nicht definiert!",
    });
  }

  // Authentication check
  if (!session.info.webId || !session.info.isLoggedIn) {
    const errorMessage = "Unauthorized";
    console.error(errorMessage);
    return res.status(503).json({
      error: errorMessage,
      message: "KielCloak Session nicht authoriziert oder authentifiziert",
    });
  }
  
  try {
    const URL = `${process.env.KIELCLOAK_POD_URL}/antraege/`;
    // Retrieves a List of URLs to all Resources in the container
    const solidDataSet = await getSolidDataset(URL || "", {
      fetch: session.fetch,
    });

    const containedUrls = getContainedResourceUrlAll(solidDataSet);
    console.log("Contained URLs: ", containedUrls);
    console.log("URLs werden formatiert: ", containedUrls);
    const forms = formatForms(containedUrls, base64WebID);
    console.log("Formatierte Anträge: ", forms);

    if (forms.length === 0) {
      return res.status(201).json({
        forms,
        message: "Nutzer hat noch keine Anträge gestellt."
      });
    }
    else 
      return res.status(200).json({
        forms,
        message: "Anträgen des Nutzers gefunden!"
      });

  } catch (error) {
    console.error("Unerwarteter Fehler in /antrag/all:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Ein unerwarteter Fehler ist im Prozess aufgetreten",
    });
  }
});

async function listDirecotries(
  URL: string,
): Promise<Array<{ url: string; isContainer: boolean; contentType?: string }>> {
  // Ohne Login oder WebID kein Zugriff auf den Pod möglich
  if (!session.info.webId) {
    console.warn(
      "Nicht eingeloggt oder WebID fehlt – schreibe keine Testdaten.",
    );
    return [];
  }

  try {
    // Container-Metadaten laden
    const ds = await getSolidDataset(URL, {
      fetch: session.fetch,
    });
    const containedUrls = getContainedResourceUrlAll(ds);

    // Für jeden enthaltenen Resource eine HEAD-Abfrage, um Typ/Container zu ermitteln
    const entries = await Promise.all(
      containedUrls.map(async (url) => {
        try {
          const info = await getResourceInfo(url, {
            fetch: session.fetch,
          });
          const container = Boolean(isContainer(info));
          if (container) {
            return { url, isContainer: true, contentType: "container" };
          }
          const ct = info.internal_resourceInfo.contentType;
          return ct
            ? { url, isContainer: false, contentType: ct }
            : { url, isContainer: false };
        } catch {
          // Fallback: Heuristik über Slash am Ende (Container enden i. d. R. mit '/')
          return { url, isContainer: url.endsWith("/") };
        }
      }),
    );
    return entries;
  } catch (e) {
    console.error("Fehler beim Auflisten des Containers:", e);
    return [];
  }
}

app.post("/send_webid", async (req: Request, res: Response) => {
  const tenantWebId: string = req.body.tenantWebId;
  const givenName: string = req.body.givenName;
  const familyName: string = req.body.familyName;
  const fullName: string = req.body.fullName;
  const landlordWebId: string = req.body.landlordWebId;

  if (
    !tenantWebId ||
    !givenName ||
    !familyName ||
    !fullName ||
    !landlordWebId
  ) {
    return res.status(400).json({
      error: "Missing or invalid parameters",
      message:
        "tenantWebId, givenName, familyName, fullName und landlordWebId sind erforderlich.",
    });
  }

  if (!session.info.webId || !session.info.isLoggedIn) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "KielCloak Session nicht autorisiert oder authentifiziert",
    });
  }

  try {
    const mailboxUrl = landlordMailboxFromWebId(landlordWebId);
    const filename = buildAnfrageFilename(fullName, tenantWebId);
    const ttlFile = createTenantWebIdFile({
      tenantWebId,
      givenName,
      familyName,
      fullName: fullName,
    });

    await moveData(ttlFile, filename, mailboxUrl);

    return res.status(201).json({
      message: "OK",
      target: mailboxUrl,
      filename,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Internal server error",
      message: `Ein unerwarteter Fehler ist im Prozess aufgetreten: ${
        error instanceof Error ? error.message : ""
      }`,
    });
  }
});

function landlordMailboxFromWebId(landlordWebId: string): string {
  if (!landlordWebId.includes("/profile/card#me")) {
    throw new Error("Ungültige Vermieter WebID");
  }
  return landlordWebId.replace("/profile/card#me", "/MailBox/");
}

function createTenantWebIdFile(params: {
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

function sanitizeForFilename(input: string): string {
  return (
    input
      .trim()
      .replace(/^https?:\/\//, (m) => (m === "https://" ? "https-" : "http-"))
      .replace(/[\s/:?#&]+/g, "-")

      // Wie Umlaute behandeln?
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

function buildAnfrageFilename(tenantName: string, tenantWebId: string): string {
  const tenantWebIdBase64 = Buffer.from(tenantWebId, "utf8").toString("base64");
  return `anfrage_${sanitizeForFilename(tenantName)}_${tenantWebIdBase64}.ttl`;
}

// Exports for testing
export {
  session,
  port,
  app,
  dotenv,
  landlordMailboxFromWebId,
  createTenantWebIdFile,
  sanitizeForFilename,
  buildAnfrageFilename,
};
