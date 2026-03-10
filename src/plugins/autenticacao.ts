import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { env } from "../config/ambiente";

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET
  });
});


