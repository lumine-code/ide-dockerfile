const fs = require("fs");
const os = require("os");
const path = require("path");
const main = require("../lib/main");
const {
  LiveLspClient,
  fileUri,
  position,
} = require("./helpers/live-lsp-client");

const registerAdapter = () => {
  let adapter;
  const disposable = main.consumeIdeClient({
    registerAdapter(registered) {
      adapter = registered;
      return { dispose() {} };
    },
    getSessions: () => [],
    restart: async () => {},
  });
  return { adapter, disposable };
};

describe("ide-dockerfile bundled server", () => {
  let adapter, client, disposable, rootPath, source, uri;
  let originalTimeout;

  beforeAll(() => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage("ide-dockerfile");
    ({ adapter, disposable } = registerAdapter());
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "ide-dockerfile-live-"));
    const filePath = path.join(rootPath, "Dockerfile");
    source = fs.readFileSync(
      path.join(__dirname, "fixtures", "drive", "Dockerfile"),
      "utf8",
    );
    fs.writeFileSync(filePath, source);
    fs.writeFileSync(path.join(rootPath, "package.json"), "{}\n");
    uri = fileUri(filePath);
    client = new LiveLspClient(adapter, rootPath);
  });

  afterEach(async () => {
    await client.stop();
    disposable.dispose();
    await fs.promises.rm(rootPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    await lumine.packages.deactivatePackage("ide-dockerfile");
  });

  it("advertises every Dockerfile protocol feature", async () => {
    const { capabilities } = await client.start();
    expect(capabilities.textDocumentSync).toBe(2);
    expect(capabilities.completionProvider.resolveProvider).toBe(true);
    expect(capabilities.completionProvider.triggerCharacters).toEqual([
      "=",
      " ",
      "$",
      "-",
    ]);
    expect(capabilities.codeActionProvider).toBe(true);
    expect(capabilities.documentFormattingProvider).toBe(true);
    expect(capabilities.documentRangeFormattingProvider).toBe(true);
    expect(capabilities.documentOnTypeFormattingProvider).toEqual({
      firstTriggerCharacter: "\\",
      moreTriggerCharacter: ["`"],
    });
    expect(capabilities.hoverProvider).toBe(true);
    expect(capabilities.documentSymbolProvider).toBe(true);
    expect(capabilities.documentHighlightProvider).toBe(true);
    expect(capabilities.renameProvider.prepareProvider).toBe(true);
    expect(capabilities.definitionProvider).toBe(true);
    expect(capabilities.signatureHelpProvider.triggerCharacters).toEqual([
      "-",
      "[",
      ",",
      " ",
      "=",
    ]);
    expect(capabilities.documentLinkProvider.resolveProvider).toBe(true);
    expect(capabilities.semanticTokensProvider.legend.tokenTypes).toContain(
      "variable",
    );
    expect(capabilities.semanticTokensProvider.legend.tokenModifiers).toContain(
      "deprecated",
    );
    expect(capabilities.foldingRangeProvider).toBe(true);
    expect(capabilities.executeCommandProvider.commands).toContain(
      "docker.command.convertToUppercase",
    );
  });

  it("exercises every advertised feature and document lifecycle route", async () => {
    await client.start();
    client.open(uri, "dockerfile", source);
    const diagnostics = await client.waitFor(
      () =>
        client.messages("textDocument/publishDiagnostics").at(-1)?.params
          .diagnostics,
      "initial diagnostics",
    );
    expect(diagnostics.map(({ code }) => code)).toEqual([0, 45, 49]);
    expect(diagnostics.map(({ severity }) => severity)).toEqual([2, 2, 2]);
    expect(diagnostics[1].tags).toEqual([2]);

    const completions = await client.request("textDocument/completion", {
      textDocument: { uri },
      position: position(6, 0),
      context: { triggerKind: 1 },
    });
    expect(completions.map(({ data }) => data)).toContain("RUN");
    const run = completions.find(({ data }) => data === "RUN");
    const resolvedCompletion = await client.request(
      "completionItem/resolve",
      run,
    );
    expect(resolvedCompletion.documentation.value).toContain(
      "Execute any commands",
    );

    const hover = await client.request("textDocument/hover", {
      textDocument: { uri },
      position: position(0, 2),
    });
    expect(hover.contents.value).toContain("baseImage");
    expect(hover.contents.value).toContain("Online documentation");

    const symbols = await client.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    expect(symbols.map(({ name }) => name)).toEqual([
      "from",
      "MAINTAINER",
      "ARG",
      "ENV",
      "WORKDIR",
      "COPY",
      "RUN",
      "CMD",
    ]);
    expect(symbols[1].deprecated).toBe(true);

    const highlights = await client.request("textDocument/documentHighlight", {
      textDocument: { uri },
      position: position(3, 15),
    });
    expect(highlights.length).toBe(4);
    expect(highlights.map(({ kind }) => kind)).toEqual([3, 3, 2, 2]);

    const definition = await client.request("textDocument/definition", {
      textDocument: { uri },
      position: position(3, 15),
    });
    expect(definition.uri).toBe(uri);
    expect(definition.range.start).toEqual(position(2, 4));

    const prepared = await client.request("textDocument/prepareRename", {
      textDocument: { uri },
      position: position(3, 15),
    });
    expect(prepared).toEqual({ start: position(3, 14), end: position(3, 22) });
    const rename = await client.request("textDocument/rename", {
      textDocument: { uri },
      position: position(3, 15),
      newName: "ROOT",
    });
    expect(rename.changes[uri].length).toBe(4);
    expect(rename.changes[uri].every(({ newText }) => newText === "ROOT")).toBe(
      true,
    );

    const formatting = await client.request("textDocument/formatting", {
      textDocument: { uri },
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(formatting).toEqual([
      { range: { start: position(7, 0), end: position(7, 0) }, newText: "  " },
    ]);
    const rangeFormatting = await client.request(
      "textDocument/rangeFormatting",
      {
        textDocument: { uri },
        range: { start: position(6, 0), end: position(7, 13) },
        options: { tabSize: 2, insertSpaces: true },
      },
    );
    expect(rangeFormatting).toEqual(formatting);
    const onType = await client.request("textDocument/onTypeFormatting", {
      textDocument: { uri },
      position: position(7, 0),
      ch: "\\",
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(onType).toEqual([]);

    const signature = await client.request("textDocument/signatureHelp", {
      textDocument: { uri },
      position: position(8, 6),
      context: { triggerKind: 1, isRetrigger: false },
    });
    expect(signature.signatures.length).toBe(2);
    expect(signature.signatures[0].label).toContain("executable");

    const links = await client.request("textDocument/documentLink", {
      textDocument: { uri },
    });
    expect(links.length).toBe(1);
    const resolvedLink = await client.request("documentLink/resolve", links[0]);
    expect(resolvedLink.target).toContain("hub.docker.com");

    const semantic = await client.request("textDocument/semanticTokens/full", {
      textDocument: { uri },
    });
    expect(semantic.data.length).toBeGreaterThan(100);
    const folding = await client.request("textDocument/foldingRange", {
      textDocument: { uri },
    });
    expect(folding).toEqual([
      { startLine: 6, endLine: 7, startCharacter: 16, endCharacter: 13 },
    ]);

    const actions = await client.request("textDocument/codeAction", {
      textDocument: { uri },
      range: diagnostics[0].range,
      context: { diagnostics },
    });
    expect(actions[0].command).toBe("docker.command.convertToUppercase");
    await client.request("workspace/executeCommand", {
      command: actions[0].command,
      arguments: actions[0].arguments,
    });
    await client.waitFor(
      () => client.appliedEdits.length,
      "workspace edit after command",
    );
    expect(client.appliedEdits.length).toBe(1);
    expect(
      client.appliedEdits[0].edit.documentChanges[0].edits[0].newText,
    ).toBe("FROM");

    const fixed = source
      .replace("from", "FROM")
      .replace("MAINTAINER Example <example@example.com>\n", "")
      .replace("CMD ['sh']", 'CMD ["sh"]');
    client.change(uri, fixed);
    await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .find(
            ({ params }) =>
              params.uri === uri && params.diagnostics.length === 0,
          ),
      "cleared diagnostics after didChange",
    );
    client.closeDocument(uri);
  });

  it("applies live diagnostic and formatter configuration", async () => {
    lumine.config.set("ide-dockerfile.diagnostics.instructionCasing", "error");
    lumine.config.set(
      "ide-dockerfile.formatter.ignoreMultilineInstructions",
      true,
    );
    await client.start();
    client.open(uri, "dockerfile", source);
    const diagnostics = await client.waitFor(
      () =>
        client.messages("textDocument/publishDiagnostics").at(-1)?.params
          .diagnostics,
      "configured diagnostics",
    );
    expect(diagnostics[0].severity).toBe(1);
    expect(
      await client.request("textDocument/formatting", {
        textDocument: { uri },
        options: { tabSize: 2, insertSpaces: true },
      }),
    ).toEqual([]);

    lumine.config.set("ide-dockerfile.features.diagnostics", false);
    client.notify("workspace/didChangeConfiguration", {
      settings: adapter.getSettings(),
    });
    await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .find(
            ({ params }) =>
              params.uri === uri && params.diagnostics.length === 0,
          ),
      "disabled diagnostics",
    );
  });
});
