import { describe, expect, it } from "vitest";
import pkgRaw from "../package.json?raw";
import tauriRaw from "../src-tauri/tauri.conf.json?raw";
import cargoRaw from "../src-tauri/Cargo.toml?raw";
import releaseYml from "../.github/workflows/release.yml?raw";
import buildYml from "../.github/workflows/build.yml?raw";
import { resolveDisplayedAppVersion } from "./updater";

const PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDlDODcxMzMyNzkzOURDNTMKUldSVDNEbDVNaE9IbkZ5TUI3VmUvaXNDNUpZcWFxbFRnZ1pCdHpmZnlHMDVxN3M4UTVzOFQ5N1QK";

describe("resolveDisplayedAppVersion", () => {
  it("prefers the installed Tauri version and strips a leading v", () => {
    expect(resolveDisplayedAppVersion("v0.2.0", "0.1.0")).toBe("0.2.0");
    expect(resolveDisplayedAppVersion("0.2.0", "0.1.0")).toBe("0.2.0");
  });

  it("falls back to the bundled package version when Tauri has not reported one", () => {
    expect(resolveDisplayedAppVersion(null, "0.1.0")).toBe("0.1.0");
    expect(resolveDisplayedAppVersion("  ", "0.1.0")).toBe("0.1.0");
  });
});

describe("release versions stay aligned", () => {
  it("keeps package.json, tauri.conf.json, and the desktop Cargo.toml on 0.1.1", () => {
    const pkg = JSON.parse(pkgRaw) as { version: string };
    const tauri = JSON.parse(tauriRaw) as {
      version: string;
      bundle: { createUpdaterArtifacts?: boolean };
      plugins: { updater: { pubkey: string; endpoints: string[] } };
    };
    const cargoVersion = cargoRaw.match(/^version = "([^"]+)"/m)?.[1];
    expect(pkg.version).toBe("0.1.1");
    expect(tauri.version).toBe(pkg.version);
    expect(cargoVersion).toBe(pkg.version);
    expect(tauri.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauri.plugins.updater.endpoints).toEqual([
      "https://github.com/dangzhuotong/tongyun-git/releases/latest/download/latest.json",
    ]);
    expect(tauri.plugins.updater.pubkey).toBe(PUBKEY);
    expect(tauri.plugins.updater.pubkey).not.toContain("\n");
  });
});

describe("release workflow", () => {
  it("publishes on v* tags and signs updater artifacts in CI", () => {
    expect(releaseYml).toMatch(/tags:\s*\n\s*- ["']v\*["']/);
    expect(releaseYml).toContain(
      "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
    );
    expect(releaseYml).toContain(
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
    );
    expect(releaseYml).toContain("includeUpdaterJson: ${{ startsWith(github.ref, 'refs/tags/') }}");
    expect(releaseYml).toContain("projectPath: .");
    expect(releaseYml).not.toContain("apps/desktop");
  });

  it("keeps push-to-main artifact builds and does not publish a Release from build.yml", () => {
    expect(buildYml).toMatch(/branches:\s*\[main\]/);
    expect(buildYml).toContain("workflow_dispatch");
    expect(buildYml).not.toContain("includeUpdaterJson");
    expect(buildYml).not.toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(buildYml).not.toContain("tagName:");
    expect(buildYml).toContain("src-tauri/tauri.unsigned.json");
  });
});
