/**
 * Loaded before the specs (`--import`): registers `single-react-hooks.mjs`,
 * so every module a spec loads -- the shared UI package's dependencies
 * included -- resolves the editor's single copy of React.
 */
import { register } from "node:module";

register("./single-react-hooks.mjs", import.meta.url);
