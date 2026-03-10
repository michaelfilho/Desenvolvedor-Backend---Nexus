import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/ambiente";
import { prisma } from "./cliente_prisma";
import { AppError } from "./erros";

type AccessPayload = {
  sub: string;
  email: string;
  type: "access";
};

type RefreshPayload = {
  sub: string;
  sid: string;
  type: "refresh";
};

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function issueAuthTokens(user: { id: string; email: string }) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await prisma.refreshSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: "pending",
      expiresAt
    }
  });

  const accessPayload: AccessPayload = { sub: user.id, email: user.email, type: "access" };
  const accessToken = jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"]
  });

  const refreshPayload: RefreshPayload = { sub: user.id, sid: session.id, type: "refresh" };
  const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"]
  });

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: sha256(refreshToken)
    }
  });

  return {
    accessToken,
    refreshToken
  };
}

export async function rotateRefreshToken(
  user: { id: string; email: string },
  oldSessionId: string,
  rawRefreshToken: string
) {
  return prisma.$transaction(async (tx) => {
    const oldSession = await tx.refreshSession.findUnique({ where: { id: oldSessionId } });

    if (!oldSession || oldSession.userId !== user.id || oldSession.revokedAt || oldSession.expiresAt < new Date()) {
      throw new AppError("Invalid refresh session", 401);
    }

    if (oldSession.refreshTokenHash !== sha256(rawRefreshToken)) {
      throw new AppError("Invalid refresh token", 401);
    }

    await tx.refreshSession.update({
      where: { id: oldSession.id },
      data: { revokedAt: new Date() }
    });

    const newSession = await tx.refreshSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessPayload: AccessPayload = { sub: user.id, email: user.email, type: "access" };
    const accessToken = jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"]
    });

    const refreshPayload: RefreshPayload = { sub: user.id, sid: newSession.id, type: "refresh" };
    const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"]
    });

    await tx.refreshSession.update({
      where: { id: newSession.id },
      data: { refreshTokenHash: sha256(refreshToken) }
    });

    return { accessToken, refreshToken };
  });
}


