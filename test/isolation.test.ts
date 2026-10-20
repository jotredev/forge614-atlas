/** Comprueba el aislamiento automático de las variables HOME y FORGE614_HOME en la suite de pruebas. */
import { describe, expect, test } from "bun:test";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { resolveForgeHome } from "../src/modules/forge-home/forge-home";

describe("test isolation", () => {
  /** Verifica que HOME y FORGE614_HOME no apunten a los datos reales del usuario. */
  test("never points to real user HOME or FORGE614_HOME during tests", () => {
    const realUserHome = userInfo().homedir || homedir();
    const realForgeHome = join(realUserHome, ".forge614");

    expect(process.env.HOME).not.toBe(realUserHome);
    expect(process.env.FORGE614_HOME).not.toBe(realForgeHome);

    const resolved = resolveForgeHome(process.env, homedir());
    expect(resolved).not.toBe(realForgeHome);
    expect(resolved.endsWith(".forge614")).toBe(true);
  });
});

