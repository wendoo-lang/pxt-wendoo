const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { dirname, join, relative, resolve } = require("node:path");
const { after, before, describe, test } = require("node:test");

/**
 * Editor project coverage: every tsconfig.spec.json under packages/ and
 * makecode/simx/ must be referenced by the root tsconfig.json or by its
 * project's own tsconfig.json, and tsserver must assign each project's spec
 * files to that spec project with zero semantic diagnostics.
 */

const repoRoot = resolve(__dirname, "..");

/** Directories whose immediate subdirectories are indexed npm/TypeScript projects. */
const projectGroups = ["packages", join("makecode", "simx")];

/** TypeScript installation resolved from packages/protocol; supplies tsserver and the config parser. */
const typescriptDir = dirname(
  require.resolve("typescript/package.json", { paths: [join(repoRoot, "packages", "protocol")] })
);

/** Every tsconfig.spec.json one level under a project group, as repo-root-relative paths. */
function discoverSpecConfigs() {
  const found = [];
  for (const group of projectGroups) {
    for (const entry of readdirSync(join(repoRoot, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(group, entry.name, "tsconfig.spec.json");
      if (existsSync(join(repoRoot, candidate))) found.push(candidate);
    }
  }
  return found;
}

/**
 * One spec file per extension under the project's src tree: the first
 * *.spec.ts and the first *.spec.tsx found, in sorted order. Returns an
 * empty array when the project has no src directory.
 */
function specFilesPerExtension(projectDir) {
  const src = join(repoRoot, projectDir, "src");
  if (!existsSync(src)) return [];
  const found = new Map();
  const stack = [src];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.spec\.ts$/.test(entry.name) && !found.has("ts")) found.set("ts", full);
      else if (/\.spec\.tsx$/.test(entry.name) && !found.has("tsx")) found.set("tsx", full);
    }
  }
  return [...found.values()];
}

/** A tsserver session speaking the wire protocol over stdio. */
function startTsserver() {
  const proc = spawn("node", [join(typescriptDir, "lib", "tsserver.js"), "--disableAutomaticTypingAcquisition"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  let seq = 0;
  let buffered = "";
  const pending = new Map();
  proc.stdout.on("data", (chunk) => {
    buffered += chunk.toString("utf8");
    for (;;) {
      const headerEnd = buffered.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = /Content-Length: (\d+)/.exec(buffered.slice(0, headerEnd));
      if (!header) {
        buffered = buffered.slice(headerEnd + 4);
        continue;
      }
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + Number(header[1]);
      if (buffered.length < bodyEnd) return;
      const body = buffered.slice(bodyStart, bodyEnd);
      buffered = buffered.slice(bodyEnd);
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }
      if (message.type === "response" && pending.has(message.request_seq)) {
        pending.get(message.request_seq)(message);
        pending.delete(message.request_seq);
      }
    }
  });
  return {
    request(command, args) {
      const requestSeq = ++seq;
      const response = new Promise((resolveResponse) => pending.set(requestSeq, resolveResponse));
      proc.stdin.write(`${JSON.stringify({ seq: requestSeq, type: "request", command, arguments: args })}\n`);
      return response;
    },
    notify(command, args) {
      proc.stdin.write(`${JSON.stringify({ seq: ++seq, type: "request", command, arguments: args })}\n`);
    },
    stop() {
      proc.stdin.end();
      proc.kill();
    },
  };
}

describe("editor project coverage", () => {
  const specConfigs = discoverSpecConfigs();
  let server;

  before(() => {
    server = startTsserver();
  });
  after(() => {
    server.stop();
  });

  test("every tsconfig.spec.json is editor-reachable via a reference", () => {
    const ts = require(join(typescriptDir, "lib", "typescript.js"));
    const readReferences = (configPath) => {
      const parsed = ts.readConfigFile(configPath, (p) => readFileSync(p, "utf8"));
      assert.equal(parsed.error, undefined, `${relative(repoRoot, configPath)} must parse`);
      return new Set(
        (parsed.config.references ?? []).map((ref) => relative(repoRoot, resolve(dirname(configPath), ref.path)))
      );
    };
    const rootReferenced = readReferences(join(repoRoot, "tsconfig.json"));
    for (const config of specConfigs) {
      if (rootReferenced.has(config)) continue;
      // A project may index its own spec project instead, from a
      // solution-style tsconfig.json in its own directory.
      const projectConfig = join(repoRoot, dirname(config), "tsconfig.json");
      assert.ok(existsSync(projectConfig), `nothing references ${config} and its project has no tsconfig.json`);
      assert.ok(
        readReferences(projectConfig).has(config),
        `${config} must be referenced by the root tsconfig.json or its project's own tsconfig.json`
      );
    }
  });

  for (const config of specConfigs) {
    const projectDir = dirname(config);
    for (const specFile of specFilesPerExtension(projectDir)) {
      const name = relative(repoRoot, specFile);
      test(`${name}: belongs to its own spec project and is clean`, async () => {
        server.notify("open", { file: specFile });
        const info = await server.request("projectInfo", { file: specFile, needFileNameList: false });
        const diagnostics = await server.request("semanticDiagnosticsSync", { file: specFile });
        server.notify("close", { file: specFile });
        const project = info.body?.configFileName ?? "(none)";
        assert.equal(
          relative(repoRoot, project),
          config,
          `${name} landed in ${project} -- wrong-project specs show bogus editor diagnostics`
        );
        const codes = (diagnostics.body ?? []).map((d) => `TS${d.code}`);
        assert.deepEqual(codes, [], `${name} has editor diagnostics: ${codes.join(", ")}`);
      });
    }
  }

  test("a package source file still belongs to its build project", async () => {
    const controlFile = join(repoRoot, "packages", "protocol", "src", "makecode-session.ts");
    server.notify("open", { file: controlFile });
    const info = await server.request("projectInfo", { file: controlFile, needFileNameList: false });
    server.notify("close", { file: controlFile });
    assert.equal(
      relative(repoRoot, info.body?.configFileName ?? "(none)"),
      join("packages", "protocol", "tsconfig.json")
    );
  });
});
