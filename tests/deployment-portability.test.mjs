import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(pkg.scripts.start, "node worker/runner.mjs");
assert.equal(pkg.scripts.worker, "node worker/runner.mjs");

const architecture = await readFile(new URL("../docs/ARCHITECTURE.md", import.meta.url), "utf8");
assert.match(architecture, /Persistent worker host/);
assert.match(architecture, /Railway is the current production deployment target/);
assert.doesNotMatch(architecture, /\*\*Heroku:\*\*/);

const infra = await readFile(new URL("../docs/PRODUCTION_INFRASTRUCTURE.md", import.meta.url), "utf8");
assert.match(infra, /node worker\/runner\.mjs/);
assert.match(infra, /does not need a public domain/);
assert.match(infra, /Railway is a deployment target, not a control-plane dependency/);

console.log("deployment-portability: PASS");
