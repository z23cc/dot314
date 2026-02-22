import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
  computeSliceRangeFromReadArgs,
  countFileLines,
  inferSelectionStatus,
} from "../dist/auto-select.js";


test("inferSelectionStatus detects full selection", () => {
  const text = [
    "### Selected Files",
    "agent/src/",
    "└── client.ts — 1,621 tokens (full)",
    "",
    "### Codemaps",
    "agent/src/",
    "└── types.ts — 731 tokens (auto)",
  ].join("\n");

  assert.deepEqual(inferSelectionStatus(text, "agent/src/client.ts"), { mode: "full" });
});


test("inferSelectionStatus detects slice selection", () => {
  const text = [
    "### Selected Files",
    "agent/src/",
    "└── client.ts — 141 tokens (lines 1-20)",
  ].join("\n");

  assert.deepEqual(inferSelectionStatus(text, "agent/src/client.ts"), { mode: "slices" });
});


test("inferSelectionStatus detects codemap-only (manual)", () => {
  const text = [
    "### Codemaps",
    "agent/src/",
    "└── client.ts — 288 tokens (manual)",
  ].join("\n");

  assert.deepEqual(inferSelectionStatus(text, "agent/src/client.ts"), {
    mode: "codemap_only",
    codemapManual: true,
  });
});


test("inferSelectionStatus handles nested tree paths", () => {
  const text = [
    "### Selected Files",
    "agent/extensions/",
    "└── repoprompt-mcp/",
    "    └── src/",
    "        └── index.ts — 7,000 tokens (lines 120-220)",
  ].join("\n");

  assert.deepEqual(
    inferSelectionStatus(text, "agent/extensions/repoprompt-mcp/src/index.ts"),
    { mode: "slices" }
  );
});


test("inferSelectionStatus tolerates irregular spacing around metadata", () => {
  const text = [
    "### Codemaps",
    "agent/src/",
    "└── client.ts  —   288 tokens   (manual)",
  ].join("\n");

  assert.deepEqual(inferSelectionStatus(text, "agent/src/client.ts"), {
    mode: "codemap_only",
    codemapManual: true,
  });
});


test("computeSliceRangeFromReadArgs handles positive ranges", () => {
  assert.deepEqual(computeSliceRangeFromReadArgs(10, 5, undefined), { start_line: 10, end_line: 14 });
  assert.equal(computeSliceRangeFromReadArgs(10, undefined, 100), null);
});


test("computeSliceRangeFromReadArgs handles tail ranges", () => {
  assert.deepEqual(computeSliceRangeFromReadArgs(-10, undefined, 100), { start_line: 91, end_line: 100 });
  assert.deepEqual(computeSliceRangeFromReadArgs(-10, undefined, 5), { start_line: 1, end_line: 5 });
  assert.equal(computeSliceRangeFromReadArgs(-10, undefined, undefined), null);
});


test("countFileLines counts lines with and without trailing newline", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rp-auto-select-"));
  const filePath = path.join(dir, "x.txt");

  await fs.writeFile(filePath, "a\nb\nc\n", "utf8");
  assert.equal(await countFileLines(filePath), 3);

  await fs.writeFile(filePath, "a\nb\nc", "utf8");
  assert.equal(await countFileLines(filePath), 3);

  await fs.writeFile(filePath, "", "utf8");
  assert.equal(await countFileLines(filePath), 0);
});
