const { CompositeDisposable } = require("lumine");
const { resolveServer } = require("./server");

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
      setting("features.diagnostics")
        ? setting(`diagnostics.${key}`)
        : "ignore",
    ]),
  ),
  formatter: {
    ignoreMultilineInstructions: setting(
      "formatter.ignoreMultilineInstructions",
    ),
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
      async resolveServer(context) {
        const launch = await resolveServer(setting("serverPath"));
        return { ...launch, cwd: context.rootPath, transport: "stdio" };
      },
      getSettings: settings,
      getWorkspaceConfiguration(section) {
        if (!section) return settings();
        if (section === "docker") return settings().docker;
        if (section === "docker.languageserver")
          return languageServerSettings();
        if (section === "docker.languageserver.diagnostics")
          return languageServerSettings().diagnostics;
        if (section === "docker.languageserver.formatter")
          return languageServerSettings().formatter;
        return undefined;
      },
    };

    const subscriptions = new CompositeDisposable(
      service.registerAdapter(adapter),
    );
    subscriptions.add(
      lumine.config.onDidChange("ide-dockerfile.serverPath", () => {
        for (const session of service.getSessions()) {
          if (
            session.adapter !== adapter ||
            ["stopping", "stopped"].includes(session.state)
          )
            continue;
          service.restart(session).catch((error) => {
            lumine.notifications.addError(
              "Unable to restart Dockerfile Language Server",
              {
                detail: error.message,
                dismissable: true,
              },
            );
          });
        }
      }),
    );
    return subscriptions;
  },
};
