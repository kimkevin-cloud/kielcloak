// Hier sollen die eigentlichen Implementationen stehen
// Definitionen in index.d.ts !

import express from "express";
import type { Request, Response } from "express";
const { getSessionFromStorage, Session } = require("@inrupt/solid-client-authn-node");
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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  SessionLogin();
});

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

  const podname = extractPodname(WebID);
  const file = await createFile(sourceURL, podname);

  for (const element of targets) {
    try {
      console.log(`Next recipient: ${element}`);
    await moveData(file, element);
    } catch (error) {
      console.error(error);
      return res.status(500).send(`Adresse konnte nicht mit ${element} geteilt werden!`);
    }
  }

  console.log("All recipients addressed!");
  return res.status(200).send("OK");
});


function extractPodname(url: string): string {
  const match = url.match(/https?:\/\/[^/]+\/([^/]+)\/profile/);
  return match?.[1]?.toString() ?? "";
}

async function createFile(sourceURL: string, podname: string): Promise<File> {

  const filename = sourceURL.split("/").pop(); // "adressenbestaetigung-1765307371.ttl"
  const newFilename = filename?.replace(/^([^-]+)-/, `$1_${podname}-`);

  const content = `
@prefix : <http://localhost:3000/stud/MailBox/${newFilename}>.
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

async function moveData(file : File, targetURL: string) {
  if (!file || !targetURL) {
    throw new Error("sourceURL oder targetURL ist nicht definiert!");
  }
  // Ohne Login oder WebID kein Zugriff auf den Pod möglich
  if (!session.info.webId) {
    throw new Error("KielCloak nicht eingeloggt oder WebID fehlt.");
  }

  console.log(`Daten werden an ${targetURL} geschickt`);

  try {
    overwriteFile(targetURL, file, {
      contentType: "text/turtle",
      fetch: session.fetch,
    });

    console.log(`Daten in ${targetURL} erfolgreich gespeichert!`);
  } catch (error) {
    throw new Error("Datei konnte nicht in Target gespeichert werden");
  }

  return;
}

// Exports for testing
export { session, SessionLogin, createFile, moveData };
