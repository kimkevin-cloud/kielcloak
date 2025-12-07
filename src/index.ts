// Hier sollen die eigentlichen Implementationen stehen
// Definitionen in index.d.ts !

import express from "express";
import type { Request, Response } from "express";
const { getSessionFromStorage, Session } = require("@inrupt/solid-client-authn-node");
import dotenv from "dotenv"; // Dotenv für das Lesen von env vars
import cors from "cors"; // To handle Cross Origin Ressource Sharing
import { deleteFile, overwriteFile } from "@inrupt/solid-client";
import { promises } from "fs";

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

app.get("/test", async (req: Request, res: Response) => {
  console.log("gotcha!");
  res.status(200).send("OK");
});

/**
 * Bekommt Anmeldungsbefehl vom Frontend.
 */
app.get("/login", async (_: Request, res: Response) => {
  try {
    await SessionLogin();
    res.json({ success: true });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Bekommt Abmeldungsbefehl vom Frontend.
 */
app.get("/logout", async (_: Request, res: Response) => {
  try {
    await SessionLogout();
    res.json({ success: true });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

async function SessionLogin() {
  try {
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
  } catch (error) {
    console.error("Error during session login:", error);
  }
}

async function SessionLogout() {
  try {
    const session = await getSessionFromStorage(sessionStorage.sessionId);
    session.logout();
  } catch (error) {
    console.error("Error during session login:", error);
  }
}

app.post("/save_address", async (req: Request, res: Response) => {
  
  const sourceURL = req.body.sourceURL;
  const targets = req.body.targets;

  // Erstellen eines neuen .ttl Datei mit der sourceURL im Feld :adressdata
  const adressURL = await createTTL(sourceURL);

  try {
    for (const element of targets) {
      console.log(`Next recipient: ${element}`);
      await moveData(adressURL, element);
    }

    console.log("All recipients addressed!");
    await deleteFile(adressURL);
    return res.status(200).send("OK");

  } catch (error) {
      console.error(error);
  }
});

async function createTTL(sourceURL: string) : Promise<string> {
  
  console.log("Create TTL File")

  const ms = Date.now().toString();
  const filename = `adress-${ms}.ttl`;

  const content = `
@prefix : <http://localhost:3000/stud/MailBox/adressenbestaetigung-${ms}.ttl#>.
@prefix owl: <http://www.w3.org/2002/07/owl#>.

:adressdata
  owl:sameAs <${sourceURL}>.
`.trim();

  await promises.writeFile(filename, content, { flag: "w" });

  console.log("TTL File created! Exiting createTTL");
  return filename;
}

async function moveData(sourceURL: string, targetURL: string) {

  if (!sourceURL || !targetURL) {
    throw new Error("sourceURL oder targetURL ist nicht definiert!");
  }
  // Ohne Login oder WebID kein Zugriff auf den Pod möglich
	if (!session.info.webId) {
		throw new Error(' KielCloak nicht eingeloggt oder WebID fehlt.');
	}

  // Locale .ttl Datei lesen (buffer)
  const buffer = await promises.readFile(sourceURL);
  // Transformieren buffer -> File
  const file = new File([buffer], "adress.ttl", {
    type: "text/turtle"
  });

  console.log(`Daten aus ${sourceURL} -> ${targetURL}`);
  try {
    await overwriteFile(targetURL, file, {
    contentType: "text/turtle",
    fetch: session.fetch
  });

  console.log(`Daten in ${targetURL} erfolgreich gespeichert!`);
  
  } catch (error) {
    throw new Error("Datei konnte nicht in Target gespeichert werden");
  }

  return;
}
