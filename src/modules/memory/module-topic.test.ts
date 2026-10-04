/** Comprueba el prefijo de la clave de tema de un módulo y la distinción entre dos nombres. */
import { describe, expect, test } from "bun:test";
import { moduleTopicKey } from "./module-topic";

/** Comprueba las dos propiedades de `moduleTopicKey` usadas para guardar informes por módulo. */
describe("moduleTopicKey", () => {
  /** Comprueba que `auth` produzca exactamente `atlas:module:auth`. */
  test("formats the topic key with the atlas:module: prefix", () => {
    expect(moduleTopicKey("auth")).toBe("atlas:module:auth");
  });

  /** Comprueba que las claves de `auth` y `billing` sean distintas. */
  test("produces different keys for different module names", () => {
    expect(moduleTopicKey("auth")).not.toBe(moduleTopicKey("billing"));
  });
});
