import { buildApp } from "./aplicacao";
import { env } from "./config/ambiente";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();


