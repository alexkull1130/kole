import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/parser.mjs";
import { check } from "../src/checker.mjs";
import { Runtime, run } from "../src/runtime.mjs";

test("native method declarations are checked without running host code", () => {
  const source = "class Bridge { static native send(value: string) -> void; static main() -> void { Bridge.send(\"hi\"); } }";
  const program = parse(source, "Bridge.k");
  assert.equal(program.classes[0].members[0].native, "host");
  assert.doesNotThrow(() => check(program, new Runtime(program)));
});

test("standalone execution reports an unbound native method", () => {
  const source = "class Bridge { static native send(value: string) -> void; static main() -> void { Bridge.send(\"hi\"); } }";
  assert.throws(() => run(source, "Bridge"), /Native method requires an embedding host/);
});

test("unsupported native signatures fail at parse time", () => {
  assert.throws(() => parse("class Bridge { native send(value: string) -> void; }"), /Native methods currently require static/);
  assert.throws(() => parse("class Bridge { static native send(value: int) -> void; }"), /Native methods currently require static/);
});
