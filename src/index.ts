// Hier sollen die eigentlichen Implementationen stehen
// Definitionen in index.d.ts !

import express from "express";
import type { Request, Response } from "express";
const { Session } = require("@inrupt/solid-client-authn-node");
import dotenv from "dotenv"; // Dotenv für das Lesen von env vars
import cors from "cors"; // To handle Cross Origin Ressource Sharing
import { overwriteFile } from "@inrupt/solid-client";

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
if (process.env.NODE_ENV != "test") {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    SessionLogin();
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
    tokenType: "client_secret",
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
app.post("/save_address", async (req: Request, res: Response) => {
  const WebID = req.body.web_id;
  const sourceURL = req.body.sourceURL;
  const targets = req.body.targets;

  // Input validation
  if (!WebID || !sourceURL || !targets || targets.length === 0) {
    const errorMessage = "Missing or invalid parameters";
    console.error(errorMessage);
    return res.status(400).json({
      error: errorMessage,
      message: "web_id, sourceURL, and non-empty targets array are required",
    });
  }

  // Authentication check
  if (!session.info.webId || !session.info.isLoggedIn) {
    const errorMessage = "Unauthorized";
    console.error(errorMessage);
    return res.status(401).json({
      error: errorMessage,
      message: "KielCloak Session nicht authoriziert oder authentifiziert",
    });
  }

  try {
    const podname = extractPodname(WebID);
    if (!podname) {
      const errorMessage = "Ungültige WebID";
      console.error(errorMessage);
      return res.status(400).json({
        error: errorMessage,
        message: "Podname konnte aus WebID gelesen werden",
      });
    }

    const filename = sourceURL.split("/").pop(); // "adressenbestaetigung-1765307371.ttl"
    const newFilename = filename?.replace(/^([^-]+)-/, `$1_${podname}-`);

    for (const element of targets) {
      try {
        const file = await createFile(sourceURL, newFilename, element);
        console.log(`Nächster Empfänger: ${element}`);
        await moveData(file, newFilename, element);
      } catch (error) {
        console.error(`Fehler bei der Kommunikation mit ${element}:`, error);

        // Return error immediately for the first failed target
        return res.status(500).json({
          message: `Adresse konnte nicht mit ${element} geteilt werden`,
        });
      }
    }

    console.log("Kommunikation mit allen Dritten erfolgreich!!");
    return res.status(200).json({
      message: "OK",
    });
  } catch (error) {
    console.error("Unerwarteter Fehler in /save_address:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Ein unerwarteter Fehler ist im Prozess aufgetreten",
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
async function createFile(
  sourceURL: string,
  filename: string,
  targetURL: string,
): Promise<Blob> {
  if (!filename.endsWith(".ttl")) {
    throw new Error("Dateiname muss mit .ttl enden!");
  }

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
  if (!session.info.webId) {
    throw new Error("KielCloak nicht eingeloggt oder WebID fehlt.");
  }

  console.log(`Daten werden an ${targetURL} geschickt`);

  try {
    await overwriteFile(targetURL + fileName, file, {
      contentType: "text/turtle",
      fetch: session.fetch,
    });

    console.log(`Daten in ${targetURL} erfolgreich gespeichert!`);
    return;
  } catch (error) {
    console.error(`Fehler beim Speichern der Datei in ${targetURL}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Datei konnte nicht in Target ${targetURL} gespeichert werden: ${errorMessage}`,
    );
  }
}

/**
 * Handelt das Speichern eines neuen Antrags im KielCloak Pod
 */
app.post("/antrag/new", async (req: Request, res: Response) => {
  const WebID = req.body.web_id;
  const antrag_type = req.body.antrag_type;
  const ttl_file = req.body.ttl_file;

  // Input validation
  if (!WebID || !antrag_type || !ttl_file) {
    const errorMessage = "Missing or invalid parameters";
    console.error(errorMessage);
    return res.status(400).json({
      error: errorMessage,
      message: "web_id, antrag_type oder ttl_file nicht definiert!",
    });
  }

  // Authentication check
  if (!session.info.webId || !session.info.isLoggedIn) {
    const errorMessage = "Unauthorized";
    console.error(errorMessage);
    return res.status(401).json({
      error: errorMessage,
      message: "KielCloak Session nicht authoriziert oder authentifiziert",
    });
  }

  try {
    const podname = extractPodname(WebID);
    if (!podname) {
      const errorMessage = "Ungültige WebID";
      console.error(errorMessage);
      return res.status(400).json({
        error: errorMessage,
        message: "Podname konnte aus WebID nicht gelesen werden.",
      });
    }

    const filename = `antrag_${antrag_type}_${podname}.ttl`;

    try {
      await moveData(ttl_file, filename, process.env.KIELCLOAK_POD_URL || "");
    } catch (error) {
      console.error(`Fehler bei der Kommunikation mit KielCloak Pod`, error);

      // Return error immediately for the first failed target
      return res.status(500).json({
        message: `Antrag konnte im KielCloak Pod gespeichert werden`,
      });
    }

    console.log("Antrag erfolgreich gespeichert!");
    return res.status(200).json({
      message: "OK",
    });
  } catch (error) {
    console.error("Unerwarteter Fehler in /antrag/new:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Ein unerwarteter Fehler ist im Prozess aufgetreten",
    });
  }
});

// Exports for testing
export { session, SessionLogin, createFile, moveData };
