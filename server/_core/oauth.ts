import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/** Shared OAuth callback handler — used by both /api/oauth/callback and /manus-oauth/callback */
async function handleOAuthCallback(req: Request, res: Response) {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");

  if (!code || !state) {
    res.status(400).json({ error: "code and state are required" });
    return;
  }

  try {
    const tokenResponse = await sdk.exchangeCodeForToken(code, state);
    const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

    if (!userInfo.openId) {
      res.status(400).json({ error: "openId missing from user info" });
      return;
    }

    await db.upsertUser({
      openId: userInfo.openId,
      name: userInfo.name || null,
      email: userInfo.email ?? null,
      loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
      lastSignedIn: new Date(),
    });

    const sessionToken = await sdk.createSessionToken(userInfo.openId, {
      name: userInfo.name || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    // Decode the state to get the return URL
    // In dev: state = btoa(redirectUri) where redirectUri = origin + /api/oauth/callback
    // In prod: state = btoa(returnUrl) where returnUrl = origin + returnPath
    let returnUrl = "/";
    try {
      const decoded = Buffer.from(state, "base64").toString("utf-8");
      if (decoded.startsWith("http")) {
        const url = new URL(decoded);
        // If the decoded URL is the callback itself, redirect to homepage
        if (url.pathname.includes("/callback") || url.pathname.includes("/oauth")) {
          returnUrl = "/";
        } else {
          returnUrl = url.pathname + url.search + url.hash || "/";
        }
      } else if (decoded.startsWith("/")) {
        returnUrl = decoded;
      }
    } catch {
      returnUrl = "/";
    }

    console.log(`[OAuth] Login success for openId=${userInfo.openId}, redirecting to ${returnUrl}`);
    res.redirect(302, returnUrl);
  } catch (error) {
    console.error("[OAuth] Callback failed", error);
    res.status(500).json({ error: "OAuth callback failed" });
  }
}

export function registerOAuthRoutes(app: Express) {
  // Dev server callback route
  app.get("/api/oauth/callback", handleOAuthCallback);

  // Production callback route used by Manus platform when custom domain is set
  app.get("/manus-oauth/callback", handleOAuthCallback);
}
