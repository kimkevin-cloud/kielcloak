// Hier sollen die eigentlichen Implementationen stehen
// Definitionen in index.d.ts !

import express from "express";
import type { Request, Response } from "express";
const {
  getSessionFromStorage,
  Session,
} = require("@inrupt/solid-client-authn-node");
import dotenv from "dotenv"; // Dotenv für das Lesen von env vars
import { ok } from "assert";
import cors from "cors";

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
});

/**
 * Bekommt Anmeldungsbefehl vom Frontend.
 */
app.get("/login", async (_: Request, res: Response) => {
  try {
    await sessionLogin();
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
    await sessionLogout();
    res.json({ success: true });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/test", async (req: Request, res: Response) => {
  console.log("gotcha!");
  res.status(200).send("OK");
});

app.post("/save_address", async (req: Request, res: Response) => {
  const data = req.body;
  const WebID = data.WebID;
  const sourceURL = data.sourceURL;
  const destinations = data.destinations;

  console.log("WebID: ", WebID);
  console.log("sourceURL: ", sourceURL);
  console.log("destionations: ", destinations);

  // WriteToThirdParty(WebID, sourceURL, destinations) ???
  res.json({ status: "ok" });
});

async function sessionLogin() {
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

async function sessionLogout() {
  try {
    const session = await getSessionFromStorage(sessionStorage.sessionId);
    session.logout();
  } catch (error) {
    console.error("Error during session login:", error);
  }
}
