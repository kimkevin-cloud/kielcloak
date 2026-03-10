import { session, app, port } from "../index.js";

/**
 *  Initialisierung des Backends
 */
export async function ensureLoginWithRetry(
  intervalMs: number = 5000,
): Promise<void> {
  // Infinite retry loop until SessionLogin succeeds
  for (;;) {
    try {
      await SessionLogin();
      if (session.info.isLoggedIn) return;
      console.warn("Session login unsuccessful, retrying...");
    } catch (err) {
      console.error("Failed to login:", err);
    }
    console.log(`Retrying login in ${intervalMs / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Handles Login for Backend service
 */
export async function startServer() {
  await ensureLoginWithRetry();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

/**
 * Handles Login for Backend service
 */
export async function SessionLogin() {
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
    oidcIssuer: new URL(oidcIssuer).toString(),
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
 * Checks if the session is alive
 * try to login if the session is not alive
 */
export async function sessionAlive(): Promise<boolean> {
  if (!session.info.webId || !session.info.isLoggedIn) {
    try {
      // versuche neue Session zu erstellen (einmaliger versuch bevor Fehlermeldung geworfen wird)
      await SessionLogin();
      return true;
    } catch (err) {
      console.error("Session login failed:", err);
      return false;
    }
  }
  return true;
}
