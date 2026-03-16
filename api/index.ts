import type { IncomingMessage, ServerResponse } from "node:http";
import type { buildApp as buildAppType } from "../src/aplicacao";

let appPromise: Promise<Awaited<ReturnType<typeof buildAppType>>> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const { buildApp } = await import("../src/aplicacao");
      return buildApp();
    })();
  }

  const app = await appPromise;
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    app.server.emit("request", req, res);
  } catch (error) {
    console.error("Serverless bootstrap failed:", error);

    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        message: "Server initialization failed. Check Vercel environment variables and DATABASE_URL.",
        code: "SERVER_BOOTSTRAP_FAILED"
      })
    );
  }
}
