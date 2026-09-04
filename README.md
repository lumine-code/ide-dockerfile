# ide-dockerfile

Dockerfile language-server adapter.

Registers the bundled Dockerfile Language Server with `ide-client`, providing completion, diagnostics, navigation, symbols, formatting, rename, code actions, links, folding, and semantic highlighting for Dockerfiles and Containerfiles.

## Features

- **Bundled server**: pins `dockerfile-language-server-nodejs` exactly, with an optional custom executable path.
- **Managed upgrade**: installs a newer server from npm when you want one, and removing it returns to the bundled copy.
- **Container intelligence**: completes instructions, flags invalid or discouraged constructs, and explains directives on hover.
- **Navigation and structure**: follows build-stage and variable definitions and supplies highlights, links, folding ranges, and document symbols.
- **Editing**: formats files, renames resolved symbols, and exposes supported quick fixes.
- **Feature switches**: each shared IDE capability can be handed to another server serving the same file.
- **Project sessions**: one server per project root, started lazily with the first Dockerfile editor.

## Installation

Install `ide-client` first. Then install `ide-dockerfile` from the Install pane of the Lumine settings, or run `lumine --install lumine-code/ide-dockerfile`.

## Services

- `ide-client`: consumed to register the Dockerfile adapter with the editor's language-server client.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
