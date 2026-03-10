import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Token } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { rotateRefreshToken, issueAuthTokens } from "../lib/autenticacao";
import { AppError } from "../lib/erros";
import { prisma } from "../lib/cliente_prisma";
import { env } from "../config/ambiente";

const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const { email, password } = registerSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError("Email already in use", 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          wallet: {
            create: {
              balances: {
                create: [
                  { token: Token.BRL, amount: "0" },
                  { token: Token.BTC, amount: "0" },
                  { token: Token.ETH, amount: "0" }
                ]
              }
            }
          }
        }
      });

      return createdUser;
    });

    const tokens = await issueAuthTokens(user);

    return reply.code(201).send({
      user: {
        id: user.id,
        email: user.email
      },
      ...tokens
    });
  });

  app.post("/auth/login", async (request) => {
    const { email, password } = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError("Invalid credentials", 401);
    }

    const tokens = await issueAuthTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email
      },
      ...tokens
    };
  });

  app.post("/auth/refresh", async (request) => {
    const { refreshToken } = refreshSchema.parse(request.body);

    let payload: { sub: string; sid: string; type: string };

    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string; sid: string; type: string };
    } catch {
      throw new AppError("Invalid refresh token", 401);
    }

    if (payload.type !== "refresh") {
      throw new AppError("Invalid refresh token type", 401);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const tokens = await rotateRefreshToken(user, payload.sid, refreshToken);

    return tokens;
  });
}


