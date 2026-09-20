import { describe, expect, test } from "bun:test";
import { moduleTopicKey } from "./module-topic";

describe("moduleTopicKey", () => {
  test("formats the topic key with the atlas:module: prefix", () => {
    expect(moduleTopicKey("auth")).toBe("atlas:module:auth");
  });

  test("produces different keys for different module names", () => {
    expect(moduleTopicKey("auth")).not.toBe(moduleTopicKey("billing"));
  });
});
