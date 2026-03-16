import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fastify from "fastify";
import cors from "@fastify/cors";
import { Prisma } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import { authPlugin } from "./plugins/autenticacao";
import { authRoutes } from "./rotas/autenticacao";
import { ledgerRoutes } from "./rotas/extrato_razao";
import { swapRoutes } from "./rotas/conversao";
import { transactionRoutes } from "./rotas/transacoes";
import { walletRoutes } from "./rotas/carteira";
import { webhookRoutes } from "./rotas/webhooks_deposito";
import { withdrawalRoutes } from "./rotas/saques";
import { AppError } from "./lib/erros";
import { prisma } from "./lib/cliente_prisma";
import { env } from "./config/ambiente";

const publicDirectory = join(process.cwd(), "public");

async function sendPublicAsset(reply: FastifyReply, fileName: string, contentType: string) {
  try {
    const asset = await readFile(join(publicDirectory, fileName), "utf8");
    return reply.type(contentType).send(asset);
  } catch {
    return reply.status(404).send({ message: "Asset not found" });
  }
}

export async function buildApp() {
  const app = fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  app.decorate("authenticate", async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    try {
      const token = request.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        throw new AppError("Missing access token", 401);
      }

      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
        sub: string;
        email: string;
        type: string;
        iat?: number;
        exp?: number;
      };

      if ((payload as { type?: string }).type !== "access") {
        throw new AppError("Invalid access token", 401);
      }

      request.authUser = {
        sub: payload.sub,
        email: payload.email,
        type: "access",
        iat: payload.iat,
        exp: payload.exp
      };
    } catch {
      return reply.status(401).send({ message: "Unauthorized" });
    }
  });

  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
  app.get("/", async (_request, reply) => sendPublicAsset(reply, "index.html", "text/html; charset=utf-8"));
  app.get("/app.css", async (_request, reply) => sendPublicAsset(reply, "app.css", "text/css; charset=utf-8"));
  app.get("/app.js", async (_request, reply) => sendPublicAsset(reply, "app.js", "application/javascript; charset=utf-8"));

  await app.register(authRoutes);
  await app.register(walletRoutes);
  await app.register(webhookRoutes);
  await app.register(swapRoutes);
  await app.register(withdrawalRoutes);
  await app.register(ledgerRoutes);
  await app.register(transactionRoutes);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Validation failed",
        issues: error.issues
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        message: error.message,
        code: error.code
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.status(409).send({ message: "Conflict: duplicated unique data" });
    }

    return reply.status(500).send({ message: "Internal server error" });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}


