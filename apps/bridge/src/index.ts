import { randomBytes } from "node:crypto";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { startRelayServer } from "./server.js";

const config = loadConfig(process.env);

const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === "development" && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
});

const server = await startRelayServer({
  host: config.HOST,
  port: config.PORT,
  bindingSecret: config.BRIDGE_BINDING_SECRET ?? randomBytes(32).toString("hex"),
  logger,
});
logger.info({ host: config.HOST, port: server.port }, "relay listening");

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "shutting down");
  server.close().then(
    () => process.exit(0),
    (error: unknown) => {
      logger.error({ err: error }, "shutdown failed");
      process.exit(1);
    }
  );
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
