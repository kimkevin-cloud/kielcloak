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

if (process.env.NODE_ENV != "test") {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    SessionLogin();
  });
}

async function SessionLogin() {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const oidcIssuer = process.env.OIDC_ISSUER;

  if (!clientId || !clientSecret || !oidcIssuer) {
    throw new Error(
      "Missing environment variables CLIENT_ID, CLIENT_SECRET, or OIDC_ISSUER"
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

    for (const element of targets) {
      try {
        const file = await createFile(sourceURL, element, podname);
        console.log(`Nächster Empfänger: ${element}`);
        await moveData(file, element);
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

function extractPodname(url: string): string {
  const match = url.match(/https?:\/\/[^/]+\/([^/]+)\/profile/);
  return match?.[1]?.toString() ?? "";
}

async function createFile(sourceURL: string,target: string, podname: string): Promise<File> {
  const filename = sourceURL.split("/").pop(); // "adressenbestaetigung-1765307371.ttl"
  const newFilename = filename?.replace(/^([^-]+)-/, `$1_${podname}-`);

  const content = `
@prefix : <${target}/${newFilename}>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.

:adressdata
  owl:sameAs <${sourceURL}>.
  `.trim();

  const blob = new Blob([content], { type: "text/turtle" });
  const file = new File([blob], `${newFilename}`, {
    type: "text/turtle",
  });

  return file;
}

async function moveData(file: File, targetURL: string) {
  if (!file || !targetURL) {
    throw new Error("sourceURL oder targetURL ist nicht definiert!");
  }
  // Ohne Login oder WebID kein Zugriff auf den Pod möglich
  if (!session.info.webId) {
    throw new Error("KielCloak nicht eingeloggt oder WebID fehlt.");
  }

  console.log(`Daten werden an ${targetURL} geschickt`);

  try {
    await overwriteFile(targetURL, file, {
      contentType: "text/turtle",
      fetch: session.fetch,
    });

    console.log(`Daten in ${targetURL} erfolgreich gespeichert!`);
    return;
  } catch (error) {
    console.error(`Fehler beim Speichern der Datei in ${targetURL}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Datei konnte nicht in Target ${targetURL} gespeichert werden: ${errorMessage}`
    );
  }
}

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

    try {
      await moveData(ttl_file, "");
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
