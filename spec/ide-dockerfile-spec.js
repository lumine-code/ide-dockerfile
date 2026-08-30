const fs = require("fs");
const main = require("../lib/main");
const { resolveServer, managedServer } = require("../lib/server");

const FEATURES = [
  "diagnostics",
  "autocomplete",
  "hover",
  "signature",
  "definition",
  "symbols",
  "format",
  "rename",
  "codeActions",
  "semanticTokens",
];

const registerAdapter = (overrides = {}) => {
  let adapter;
  const service = {
    registerAdapter(registered) {
      adapter = registered;
      return { dispose() {} };
    },
    getSessions: () => [],
    restart: async () => {},
    ...overrides,
  };
  const disposable = main.consumeIdeClient(service);
  return { adapter, disposable, service };
};

describe("ide-dockerfile server resolution", () => {
  it("uses a configured executable with stdio", async () => {
    const launch = await resolveServer(process.execPath);
    expect(launch).toEqual({ command: process.execPath, args: ["--stdio"] });
  });

  it("launches the exact bundled server through Electron's Node runtime", async () => {
    const launch = await resolveServer("");
    expect(launch.command).toBe(process.execPath);
    expect(launch.args[1]).toBe("--stdio");
    expect(fs.existsSync(launch.args[0])).toBe(true);
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBe("1");
    const metadata = require("dockerfile-language-server-nodejs/package.json");
    expect(metadata.version).toBe("0.15.0");
    expect(metadata.dependencies["dockerfile-language-service"]).toBe("0.16.1");
  });

  it("prefers a managed install over the bundled server", async () => {
    const managed = { modulePath: "/managed/server.js", version: "9.9.9" };
    const launch = await resolveServer("", managed);
    expect(launch.args[0]).toBe(managed.modulePath);
    // Reported in the session details, so which copy is running is visible.
    expect(launch.version).toBe("9.9.9");
    expect((await resolveServer(process.execPath, managed)).command).toBe(process.execPath);
  });

  it("declares the bundled floor so uninstall falls back", () => {
    // The dependency is always present, so removing the managed copy returns to
    // a working server rather than to none.
    expect(managedServer.source).toBe("npm");
    expect(managedServer.bundled).toBe(true);
    expect(managedServer.module).toContain("node_modules/");
  });
});

describe("ide-dockerfile adapter", () => {
  let adapter;
  let disposable;

  beforeEach(async () => {
    await lumine.packages.activatePackage("ide-dockerfile");
    ({ adapter, disposable } = registerAdapter());
  });

  afterEach(async () => {
    disposable.dispose();
    await lumine.packages.deactivatePackage("ide-dockerfile");
  });

  it("registers the Dockerfile grammar as a project-scoped stdio server", async () => {
    expect(adapter.id).toBe("ide-dockerfile");
    expect(adapter.displayName).toBe("Dockerfile Language Server");
    expect(adapter.grammarScopes).toEqual(["source.dockerfile"]);
    expect(adapter.sessionScope).toBe("project-root");
    expect(adapter.settingsKeyPaths).toEqual(["ide-dockerfile"]);
    const launch = await adapter.resolveServer({ rootPath: __dirname });
    expect(launch.cwd).toBe(__dirname);
    expect(launch.transport).toBe("stdio");
  });

  it("answers every configuration section requested by the server", () => {
    lumine.config.set("ide-dockerfile.formatter.ignoreMultilineInstructions", true);
    const all = adapter.getWorkspaceConfiguration();
    expect(all.docker.languageserver.formatter.ignoreMultilineInstructions).toBe(true);
    expect(adapter.getWorkspaceConfiguration("docker")).toEqual(all.docker);
    expect(adapter.getWorkspaceConfiguration("docker.languageserver")).toEqual(
      all.docker.languageserver,
    );
    expect(adapter.getWorkspaceConfiguration("docker.languageserver.diagnostics")).toEqual(
      all.docker.languageserver.diagnostics,
    );
    expect(adapter.getWorkspaceConfiguration("docker.languageserver.formatter")).toEqual(
      all.docker.languageserver.formatter,
    );
    expect(adapter.getWorkspaceConfiguration("editor")).toBeUndefined();
  });

  it("transcribes every diagnostic severity", () => {
    lumine.config.set("ide-dockerfile.diagnostics.deprecatedMaintainer", "error");
    lumine.config.set("ide-dockerfile.diagnostics.instructionCasing", "ignore");
    const diagnostics = adapter.getSettings().docker.languageserver.diagnostics;
    expect(Object.keys(diagnostics)).toEqual([
      "deprecatedMaintainer",
      "directiveCasing",
      "emptyContinuationLine",
      "instructionCasing",
      "instructionCmdMultiple",
      "instructionEntrypointMultiple",
      "instructionHealthcheckMultiple",
      "instructionJSONInSingleQuotes",
    ]);
    expect(diagnostics.deprecatedMaintainer).toBe("error");
    expect(diagnostics.instructionCasing).toBe("ignore");
  });

  it("maps the diagnostics feature switch to ignored server checks", () => {
    lumine.config.set("ide-dockerfile.features.diagnostics", false);
    expect(
      Object.values(adapter.getSettings().docker.languageserver.diagnostics).every(
        (severity) => severity === "ignore",
      ),
    ).toBe(true);
  });

  it("restarts live sessions after the executable path changes", async () => {
    disposable.dispose();
    const session = { adapter: null, state: "running" };
    const restart = jasmine.createSpy("restart").and.returnValue(Promise.resolve());
    ({ adapter, disposable } = registerAdapter({
      getSessions: () => [session],
      restart,
    }));
    session.adapter = adapter;
    lumine.config.set("ide-dockerfile.serverPath", process.execPath);
    await Promise.resolve();
    expect(restart).toHaveBeenCalledOnceWith(session);
  });

  it("declares switches for exactly the shared capabilities the server advertises", () => {
    expect(Object.keys(require("../package.json").configSchema.features.properties)).toEqual(
      FEATURES,
    );
  });
});

describe("ide-dockerfile feature contracts", () => {
  const definitions = require("../package.json").configSchema.features.properties;

  beforeEach(async () => {
    await lumine.packages.activatePackage("ide-dockerfile");
  });

  afterEach(async () => {
    for (const feature of FEATURES) lumine.config.unset(`ide-dockerfile.features.${feature}`);
    await lumine.packages.deactivatePackage("ide-dockerfile");
  });

  for (const feature of FEATURES) {
    it(`exposes ${feature} as an independent enabled-by-default switch`, () => {
      expect(definitions[feature].type).toBe("boolean");
      expect(definitions[feature].default).toBe(true);
      const keyPath = `ide-dockerfile.features.${feature}`;
      expect(lumine.config.get(keyPath)).toBe(true);
      lumine.config.set(keyPath, false);
      expect(lumine.config.get(keyPath)).toBe(false);
    });
  }
});
