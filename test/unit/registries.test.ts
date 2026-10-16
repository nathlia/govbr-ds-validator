import { describe, it, expect } from "vitest";
import {
  emagMembership,
  getWcagRegistry,
  kbMembership,
  registryVersions,
  structureRuleMembership,
  tokenRuleMembership,
  wcagMembership,
} from "../../src/verify/registries.js";

describe("WCAG 2.2 registry", () => {
  it("comes from the W3C source with provenance, and marks the criterion 2.2 removed", () => {
    const { meta, criteria } = getWcagRegistry();
    expect(meta.source).toBe("https://www.w3.org/WAI/WCAG22/wcag.json");
    expect(meta.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.totalListed).toBe(criteria.length);
    expect(meta.inWcag22).toBe(86);
    expect(meta.obsoleteInWcag22).toEqual(["4.1.1"]);
  });

  it("distinguishes member, obsolete, unknown and malformed", () => {
    expect(wcagMembership("1.4.3").status).toBe("member");
    expect(wcagMembership("wcag-2.5.8").status).toBe("member");
    expect(wcagMembership("wcag:4.1.3").status).toBe("member");
    expect(wcagMembership("4.1.1").status).toBe("obsolete");
    expect(wcagMembership("wcag-9.9.9").status).toBe("unknown");
    expect(wcagMembership("1.4").status).toBe("malformed");
  });
});

describe("other registries", () => {
  it("checks e-MAG 3.1 recommendations by membership", () => {
    expect(emagMembership("emag-3.5").status).toBe("member");
    expect(emagMembership("6.5").status).toBe("member");
    expect(emagMembership("emag-9.9").status).toBe("unknown");
  });

  it("checks KB ids by membership", () => {
    expect(kbMembership("govbr-3.7.0-component-fake-000000000000").status).toBe("unknown");
    expect(kbMembership("govbr-3.7.0-foundation-global-21b1a2733f7b").status).toBe("member");
  });

  it("knows the published checker ids and which of them carry a norm", () => {
    const color = tokenRuleMembership("ds-token-color");
    expect(color.status).toBe("member");
    expect(color.entry?.implements.length).toBeGreaterThan(0);
    expect(tokenRuleMembership("ds-token-font-size").entry?.implements).toEqual([]);
    expect(tokenRuleMembership("ds-token-shadow").status).toBe("unknown");
    expect(structureRuleMembership("ds-structure-button-tag").status).toBe("member");
    expect(structureRuleMembership("ds-structure-button-variant").status).toBe("unknown");
  });

  it("reports every registry version", () => {
    const versions = registryVersions();
    expect(Object.keys(versions).sort()).toEqual(["components", "contextual", "emag", "kb", "wcag"]);
    expect(versions.emag).toContain("45 recomendações");
    expect(versions.contextual).toContain("9 condições");
  });
});
