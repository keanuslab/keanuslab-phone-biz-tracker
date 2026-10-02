import { onRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { fetchWillhabenListing, validWillhabenUrl } from "./willhaben.mjs";

if (!getApps().length) initializeApp();

async function authorize(request) {
  const match = /^Bearer (\S+)$/i.exec(request.get("Authorization") ?? "");
  if (!match) return null;
  let user;
  try {
    user = await getAuth().verifyIdToken(match[1], true);
  } catch {
    return null;
  }
  if (!user.email_verified || !user.email) return null;
  const entry = await getFirestore().doc(`allowlist/${user.email.toLowerCase()}`).get();
  return entry.exists ? user.uid : null;
}

// A Firestore transaction makes the quota effective across instances and cold starts.
async function takeQuota(uid) {
  const ref = getFirestore().doc(`importQuotas/${uid}`);
  return getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const now = Date.now();
    const state = snapshot.data() ?? {};
    const windowStart = typeof state.windowStart === "number" && now - state.windowStart < 3_600_000 ? state.windowStart : now;
    const count = windowStart === state.windowStart ? state.count ?? 0 : 0;
    if (count >= 20) return Math.ceil((windowStart + 3_600_000 - now) / 1000);
    if (typeof state.lastRequest === "number" && now - state.lastRequest < 3_000) return Math.ceil((state.lastRequest + 3_000 - now) / 1000);
    tx.set(ref, { windowStart, count: count + 1, lastRequest: now });
    return 0;
  });
}

export const willhabenImport = onRequest({ region: "europe-west3", timeoutSeconds: 15, maxInstances: 3 }, async (request, response) => {
  response.set("Cache-Control", "private, no-store");
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const uid = await authorize(request);
    if (!uid) { response.status(401).json({ error: "Sign in with an approved account to load listings automatically." }); return; }
    const url = validWillhabenUrl(String(request.query.url ?? ""));
    if (!url) { response.status(400).json({ error: "Enter a valid willhaben listing link." }); return; }
    const retryAfter = await takeQuota(uid);
    if (retryAfter > 0) { response.set("Retry-After", String(retryAfter)); response.status(429).json({ error: "Import limit reached. Paste the ad text or try again later." }); return; }
    const listing = await fetchWillhabenListing(url.toString());
    response.json(listing);
  } catch (error) {
    // Do not expose upstream or credential errors to callers.
    console.error("willhaben import failed", error);
    response.status(502).json({ error: "The listing could not be loaded. Paste the ad text instead." });
  }
});
