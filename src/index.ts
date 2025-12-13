// Hier sollen die eigentlichen Implementationen stehen
// Definitionen in index.d.ts !

import express from "express";
import type { Request, Response } from "express";
import { Session } from "@inrupt/solid-client-authn-node";
import dotenv from "dotenv"; // Dotenv für das Lesen von env vars
import cors from "cors"; // To handle Cross Origin Ressource Sharing
import {
  getContainedResourceUrlAll,
  getSolidDataset,
  overwriteFile,
} from "@inrupt/solid-client";
import { Buffer } from "buffer";

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

// Initialisierung des Backends
async function startServer() {
  await SessionLogin();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

/**
 * Handles Login for Backend service
 */
async function SessionLogin() {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const oidcIssuer = process.env.OIDC_ISSUER;

  if (!clientId || !clientSecret || !oidcIssuer) {
    throw new Error(
      "Missing environment variables CLIENT_ID, CLIENT_SECRET, or OIDC_ISSUER",
    );
  }

  await session.login({
    clientId,
    clientSecret,
    oidcIssuer,
    tokenType: "DPoP",
  });

  if (session.info.isLoggedIn) {
    // You can change the fetched URL to a private resource, such as your Pod root.
    if (session.info.webId) {
      await session.fetch(session.info.webId);
      console.log("Session logged in successfully.");
    } else {
      console.error("session.info.webId is undefined.");
    }
  } else {
    console.error("Session login failed.");
  }
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
      message: "KielCloak Session nicht authoriziert oder authentifiziert",
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
      message: "KielCloak Session nicht authoriziert oder authentifiziert",
    });
  }

  try {
    const podname = extractPodname(WebID);
    if (!podname) {
      const errorMessage = "Ungültige WebID";
      // console.error(errorMessage);
      return res.status(400).json({
        error: errorMessage,
        message: "Podname konnte aus WebID nicht gelesen werden.",
      });
    }

    const filename = `antrag_${antrag_type}_${podname}.ttl`;
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
      await moveData(
        ttl_file,
        filename,
        process.env.KIELCLOAK_POD_URL + "antraege/" || "",
      );
      await moveData(
        aclFile,
        filename + ".acl",
        process.env.KIELCLOAK_POD_URL + "antraege/" || "",
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
 * Extrahiert Podname aus eine gegebene WebID
 * @param url: WebID
 *
 * Beispiel url : "http://localhost:3000/stud/MailBox/adressenbestaetigung-1765307371.ttl"
 */
function extractPodname(url: string): string {
  const match = url.match(/https?:\/\/[^/]+\/([^/]+)\/profile/);
  return match?.[1]?.toString() ?? "";
}

/**
 * Erstellt ein Blob mit Podname und Timestamp im Namen (Bsp.: address_podname-ms.ttl), wo die sourceURL der vom Studenten angegebenen Adresse steht.
 * @param sourceURL Quelle, wo die Adresse im Studenten Pod gespeichert wurde
 * @param filename Dateiname
 * @param targetURL Empfänger Mailbox URL. Wird im Inhalt der Datei geschrieben
 */
function createDritteFile(
  sourceURL: string,
  filename: string,
  targetURL: string,
): Blob {
  if (!filename.endsWith(".ttl"))
    throw new Error("Dateiname muss mit .ttl enden!");

  const content = `
@prefix : <${targetURL}${filename}>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.

:adressdata
  owl:sameAs <${sourceURL}>.
  `.trim();

  const blob = new Blob([content], { type: "text/turtle" });

  return blob;
}

/**
 * Schreibt eine .ttl Datei in den gegebenen Pod (targetURL) mit einem Verweis zu sourceUrl, wenn ein Login besteht.
 * @param file Blob mit Verweis zur Adresse im Studenten Pod (z.B. Adresse des Studenten in adress-${ms}.ttl)
 * @param fileName Name der Datei
 * @param targetURL Empfänger URL, wo die .ttl Datei geschrieben werden soll.
 *
 * Test URLs:
 *  Bank : http://localhost:3000/bank/MailBox
 *  Uni : http://localhost:3000/uni/MailBox
 */
async function moveData(file: Blob, fileName: string, targetURL: string) {
  if (!file || !targetURL || !fileName || targetURL === "" || fileName === "") {
    throw new Error("sourceURL, fileName oder targetURL ist nicht definiert!");
  }
  // Ohne Login oder WebID kein Zugriff auf den Pod möglich
  if (!session.info.webId)
    throw new Error("KielCloak nicht eingeloggt oder WebID fehlt.");

  try {
    await overwriteFile(targetURL + fileName, file, {
      contentType: "text/turtle",
      fetch: session.fetch,
    });

    return;
  } catch (error) {
    // console.error(`Fehler beim Speichern der Datei in ${targetURL}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Datei konnte nicht in Target ${targetURL} gespeichert werden: ${errorMessage}`,
    );
  }
}

/**
 * Überprüft, ob ein bestimmter Antrag im KielCloak Pod existiert
 * @param fileName Name der Antags-Datei, die im KielCloak Pod gesucht wird
 * @returns Ein Promise, das den Boolean-Wert true zurückgibt, wenn die Datei existiert
 * @throws {Error} Wenn der Dateiname nicht mit .ttl endet oder
 *            KIELCLOAK_POD_URL nicht definiert ist
 */
async function antragExists(fileName: string): Promise<boolean> {
  const podUrl = process.env.KIELCLOAK_POD_URL;
  if (!podUrl) throw new Error("KIELCLOAK_POD_URL ist nicht definiert!");

  if (!session.info.webId || !session.info.isLoggedIn)
    throw new Error("KielCloak nicht eingeloggt oder WebID fehlt.");

  const containerUrl = new URL(podUrl + "antraege/").toString();
  if (!fileName.endsWith(".ttl"))
    throw new Error("Dateiname muss mit .ttl enden!");

  try {
    // Container-Metadaten laden
    const antraegeDS = await getSolidDataset(containerUrl, {
      fetch: session.fetch,
    });
    const containedUrls = getContainedResourceUrlAll(antraegeDS);

    // Datei in den Container-URLs suchen -> letztes Element muss dem gesuchten Dateinamen entsprechen
    return containedUrls.some((url) => {
      const foundFile = decodeURIComponent(
        new URL(url).pathname.split("/").pop() || "",
      );
      return foundFile === fileName;
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // console.error("Fehler beim Laden der Container-Metadaten:", errorMessage);
    throw new Error("Container konnte nicht geladen werden: " + errorMessage);
  }
}

/**
 * Erstellt ein ACL (Access Control List) Blob zum Antrag, mit den Berechtigungen für Kielcloak und Nutzer.
 * @param webID WebID des Nutzers, der den Antrag erstellt hat
 * @param fileName Dateiname des Antrags
 * @returns Ein Blob mit dem Inhalt der ACL
 * @throws {Error} Wenn der Dateiname nicht mit .ttl endet oder
 *            KIELCLOAK_POD_URL nicht definiert ist
 */
function createAntragACL(webID: string, fileName: string): Blob {
  if (!fileName.endsWith(".ttl"))
    throw new Error("Dateiname muss mit .ttl enden!");

  const podUrl = process.env.KIELCLOAK_POD_URL;
  if (!podUrl) throw new Error("KIELCLOAK_POD_URL ist nicht definiert!");

  // ACL Inhalt erstellen
  // Nutzer kann lesen, Kielcloak kann lesen und schreiben
  const content = `
@prefix acl: <https://www.w3.org/ns/auth/acl#>.

<#owner>
  a acl:Authorization;
  acl:agent <${session.info.webId}>;
  acl:accessTo <${podUrl}antraege/${fileName}>;
  acl:default <./>;
  acl:mode 
    acl:Write, acl:Control, acl:Read.

<#${webID}>
  a acl:Authorization;
  acl:agent <${webID}>;
  acl:accessTo <${podUrl}antraege/${fileName}>;
  acl:mode acl:Read.
`.trim();

  const blob = new Blob([content], { type: "text/turtle" });
  return blob;
}

// Exports for testing
export {
  session,
  SessionLogin,
  createDritteFile,
  moveData,
  createAntragACL,
  antragExists,
};
