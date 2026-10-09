/**
 * Writes every file `renderVmPrograms` renders over its checked-in copy.
 * Run it after a brain source it compiles changes, or after the compile
 * path changes what it makes of one: `npm run gen:vm-programs`.
 */
import { writeFileSync } from "node:fs";
import { absolutePath, renderVmPrograms } from "./vm-programs.js";

for (const file of renderVmPrograms()) {
  writeFileSync(absolutePath(file.path), file.text);
  process.stdout.write(`gen-vm-programs: wrote ${file.path}\n`);
}
