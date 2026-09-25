import { z } from "zod";

/** Schema of the environment variables the relay service reads at startup. */
const configSchema = z.object({
  /** `development` renders logs for a terminal; any other value logs JSON lines. */
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Host name or address the service listens on, without a scheme. */
  HOST: z.string().min(1).default("localhost"),
  /** TCP port the service listens on. */
  PORT: z.coerce.number().int().min(0).max(65535).default(6464),
  /** Minimum level of the log records the service writes. */
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /**
   * Secret that signs binding tokens. When unset, the service generates one at
   * startup, and tokens it issued stop verifying when it restarts.
   */
  BRIDGE_BINDING_SECRET: z.string().min(1).optional(),
});

/** The relay service's startup configuration. */
export type RelayConfig = z.infer<typeof configSchema>;

/** Reads the relay service's configuration from `env`. Throws if a variable holds an invalid value. */
export function loadConfig(env: NodeJS.ProcessEnv): RelayConfig {
  return configSchema.parse(env);
}
