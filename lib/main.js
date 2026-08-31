const { resolveServer, managedServer } = require("./server");

const setting = (key) => lumine.config.get(`ide-dockerfile.${key}`);
const diagnosticKeys = [
  "deprecatedMaintainer",
  "directiveCasing",
  "emptyContinuationLine",
  "instructionCasing",
  "instructionCmdMultiple",
  "instructionEntrypointMultiple",
  "instructionHealthcheckMultiple",
  "instructionJSONInSingleQuotes",
];

const languageServerSettings = () => ({
  diagnostics: Object.fromEntries(
    diagnosticKeys.map((key) => [
      key,
      setting("features.diagnostics") ? setting(`diagnostics.${key}`) : "ignore",
    ]),
  ),
  formatter: {
    ignoreMultilineInstructions: setting("formatter.ignoreMultilineInstructions"),
  },
});

const settings = () => ({
  docker: { languageserver: languageServerSettings() },
});

module.exports = {
  consumeIdeClient(service) {
    const adapter = {
      id: "ide-dockerfile",
      displayName: "Dockerfile Language Server",
      grammarScopes: ["source.dockerfile"],
      sessionScope: "project-root",
      settingsKeyPaths: ["ide-dockerfile"],
      restartKeyPaths: ["ide-dockerfile.serverPath"],
      managedServer,
      async resolveServer(context) {
        const launch = await resolveServer(setting("serverPath"), context.managedServer);
        return { ...launch, cwd: context.rootPath, transport: "stdio" };
      },
      getSettings: settings,
      getWorkspaceConfiguration(section) {
        if (!section) return settings();
        if (section === "docker") return settings().docker;
        if (section === "docker.languageserver") return languageServerSettings();
        if (section === "docker.languageserver.diagnostics")
          return languageServerSettings().diagnostics;
        if (section === "docker.languageserver.formatter")
          return languageServerSettings().formatter;
        return undefined;
      },
    };

    return service.registerAdapter(adapter);
  },
};
