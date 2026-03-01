import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { ExtPosition, PokemonSize } from '../../common/types';
import {
  VSCODE_POKEMON_CHANGE_LANGUAGE_COMMAND,
  VSCODE_POKEMON_CONFIGURE_KEYBINDINGS_COMMAND,
  VSCODE_POKEMON_DELETE_POKEMON_COMMAND,
  VSCODE_POKEMON_EXPORT_LIST_COMMAND,
  VSCODE_POKEMON_IMPORT_LIST_COMMAND,
  VSCODE_POKEMON_REMOVE_ALL_POKEMON_COMMAND,
  VSCODE_POKEMON_ROLL_CALL_COMMAND,
  VSCODE_POKEMON_SPAWN_RANDOM_POKEMON_COMMAND,
  VSCODE_POKEMON_START_COMMAND,
  VSCODE_POKEMON_SPAWN_POKEMON_COMMAND,
} from '../../constants/vscode-keys.constant';
import { registerChangePokemonLanguageCommand } from '../../extension/commands/change-pokemon-language.command';
import { registerConfigureKeybindingsCommand } from '../../extension/commands/configure-keybindings.command';
import { registerDeletePokemonCommand } from '../../extension/commands/delete-pokemon.command';
import { registerExportPokemonListCommand } from '../../extension/commands/export-pokemon-list.command';
import { registerImportPokemonListCommand } from '../../extension/commands/import-pokemon-list.command';
import { registerRemoveAllPokemonCommand } from '../../extension/commands/remove-all-pokemon.command';
import { registerRollCallCommand } from '../../extension/commands/roll-call.command';
import { registerSpawnRandomPokemonCommand } from '../../extension/commands/spawn-random-pokemon.command';
import { registerStartCommand } from '../../extension/commands/start.command';
import { PokemonSpecificationLike } from '../../extension/commands/types/pokemon-specification.type';
import {
  createBaseCommandDeps,
  createCommandTestHarness,
  FakePokemonSpecification,
  createPanelRecorder,
  createWebviewRecorder,
} from './helpers/command-test.helper';

suite('other command behavior', () => {
  let commandDisposable: vscode.Disposable | undefined;
  let harness: ReturnType<typeof createCommandTestHarness>;

  setup(() => {
    harness = createCommandTestHarness();
  });

  teardown(async () => {
    if (commandDisposable) {
      commandDisposable.dispose();
      commandDisposable = undefined;
    }

    await harness.restore();
  });

  test('start command creates panel and persists session collection', async () => {
    const panelRecorder = createPanelRecorder();
    const sessionCollection = [
      { name: 'A' },
    ] as unknown as PokemonSpecificationLike[];
    let createOrShowCalls = 0;
    let spawnPersistCalls = 0;

    const deps = createBaseCommandDeps({
      getPokemonPanel: () => panelRecorder.panel,
      getSessionPokemonCollection: (_context) => sessionCollection,
      createOrShowPokemonPanel: (_extensionUri, _spec) => {
        createOrShowCalls += 1;
      },
      spawnAndPersistCollection: async (_context, _panel, collection) => {
        spawnPersistCalls += 1;
        assert.strictEqual(collection, sessionCollection);
      },
    });

    commandDisposable = registerStartCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(VSCODE_POKEMON_START_COMMAND);

    assert.strictEqual(createOrShowCalls, 1);
    assert.strictEqual(spawnPersistCalls, 1);
  });

  test('start command focuses explorer view when configured', async () => {
    let createOrShowCalls = 0;

    const deps = createBaseCommandDeps({
      getConfigurationPosition: () => ExtPosition.explorer,
      hasWebviewViewProvider: () => true,
      createOrShowPokemonPanel: (_extensionUri, _spec) => {
        createOrShowCalls += 1;
      },
    });

    commandDisposable = registerStartCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(VSCODE_POKEMON_START_COMMAND);

    assert.strictEqual(createOrShowCalls, 0);
    assert.ok(
      harness
        .getExecutedCommands()
        .some((entry) => entry.command === 'pokemonView.focus'),
    );
  });

  test('remove-all command resets panel and clears persisted collection', async () => {
    const panelRecorder = createPanelRecorder();
    let storedCollection: PokemonSpecificationLike[] | undefined;

    const deps = createBaseCommandDeps({
      getPokemonPanel: () => panelRecorder.panel,
      storeCollectionAsMemento: async (_context, collection) => {
        storedCollection = collection;
      },
    });

    commandDisposable = registerRemoveAllPokemonCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(
      VSCODE_POKEMON_REMOVE_ALL_POKEMON_COMMAND,
    );

    assert.strictEqual(panelRecorder.calls.resetPokemon, 1);
    assert.ok(storedCollection);
    assert.strictEqual(storedCollection?.length, 0);
  });

  test('roll-call command triggers panel roll call', async () => {
    const panelRecorder = createPanelRecorder();
    const deps = createBaseCommandDeps({
      getPokemonPanel: () => panelRecorder.panel,
    });

    commandDisposable = registerRollCallCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(VSCODE_POKEMON_ROLL_CALL_COMMAND);

    assert.strictEqual(panelRecorder.calls.rollCall, 1);
  });

  test('spawn-random command spawns and stores collection', async () => {
    const panelRecorder = createPanelRecorder();
    let storedCollection: PokemonSpecificationLike[] | undefined;

    const deps = createBaseCommandDeps({
      getPokemonPanel: () => panelRecorder.panel,
      storeCollectionAsMemento: async (_context, collection) => {
        storedCollection = collection;
      },
    });

    commandDisposable = registerSpawnRandomPokemonCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(
      VSCODE_POKEMON_SPAWN_RANDOM_POKEMON_COMMAND,
    );

    const spawnedPokemon = panelRecorder.getSpawnedPokemon();
    assert.ok(spawnedPokemon);
    assert.ok(storedCollection);
    assert.strictEqual(storedCollection?.length, 1);
    assert.strictEqual(storedCollection?.[0], spawnedPokemon);
  });

  test('delete command lists pokemon and subscribes to webview messages', async () => {
    const panelRecorder = createPanelRecorder();
    const webviewRecorder = createWebviewRecorder();
    const deps = createBaseCommandDeps({
      getPokemonPanel: () => panelRecorder.panel,
      getWebview: () => webviewRecorder.webview,
    });

    commandDisposable = registerDeletePokemonCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(
      VSCODE_POKEMON_DELETE_POKEMON_COMMAND,
    );

    assert.strictEqual(panelRecorder.calls.listPokemon, 1);
    assert.strictEqual(webviewRecorder.hasListener(), true);
  });

  test('export command shows error when no workspace is open', async () => {
    const deps = createBaseCommandDeps({
      pokemonSpecification: FakePokemonSpecification as never,
    });

    commandDisposable = registerExportPokemonListCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(VSCODE_POKEMON_EXPORT_LIST_COMMAND);

    assert.ok(
      harness
        .getErrorMessages()
        .some((message) =>
          message.includes('You must have a folder or workspace open'),
        ),
      'Expected export command to show a workspace-required error',
    );
  });

  test('import command reads file, spawns pokemon, and stores collection', async () => {
    const panelRecorder = createPanelRecorder();
    let storedCollection: PokemonSpecificationLike[] | undefined;

    const deps = createBaseCommandDeps({
      getConfiguredSize: () => PokemonSize.small,
      getPokemonPanel: () => panelRecorder.panel,
      storeCollectionAsMemento: async (_context, collection) => {
        storedCollection = collection;
      },
    });

    const pokemonFile = [
      { type: 'bulbasaur', color: 'default', size: 'small', name: 'Bulby' },
    ];
    const tempFile = path.join(
      os.tmpdir(),
      `vscode-pokemon-import-${Date.now()}.json`,
    );
    await fs.writeFile(tempFile, JSON.stringify(pokemonFile), 'utf8');

    harness.setOpenDialogResult([vscode.Uri.file(tempFile)]);

    commandDisposable = registerImportPokemonListCommand(
      {} as vscode.ExtensionContext,
      deps,
    );
    await harness.invokeRegisteredCommand(VSCODE_POKEMON_IMPORT_LIST_COMMAND);

    assert.strictEqual(panelRecorder.calls.spawnPokemon, 1);
    assert.ok(storedCollection);
    assert.strictEqual(storedCollection?.length, 1);
    assert.strictEqual(storedCollection?.[0].name, 'Bulby');
  });

  test('configure-keybindings command opens keyboard shortcuts for selected command', async () => {
    harness.setQuickPickResult({
      commandId: VSCODE_POKEMON_SPAWN_POKEMON_COMMAND,
      label: 'Spawn additional pokemon',
    });

    commandDisposable = registerConfigureKeybindingsCommand();
    await harness.invokeRegisteredCommand(
      VSCODE_POKEMON_CONFIGURE_KEYBINDINGS_COMMAND,
    );

    assert.ok(
      harness
        .getExecutedCommands()
        .some(
          (entry) =>
            entry.command === 'workbench.action.openGlobalKeybindings' &&
            entry.args[0] === VSCODE_POKEMON_SPAWN_POKEMON_COMMAND,
        ),
    );
  });

  test('change-language command updates config and shows confirmation', async () => {
    harness.setConfigurationValue('pokemonLanguage', 'auto');
    harness.setQuickPickResult({ label: '🇫🇷 Français (FR)', value: 'fr-FR' });

    commandDisposable = registerChangePokemonLanguageCommand();
    await harness.invokeRegisteredCommand(
      VSCODE_POKEMON_CHANGE_LANGUAGE_COMMAND,
    );

    assert.ok(
      harness
        .getConfigUpdates()
        .some(
          (update) =>
            update.key === 'pokemonLanguage' && update.value === 'fr-FR',
        ),
    );

    assert.ok(
      harness
        .getInfoMessages()
        .some((message) => message.includes('Pokemon language changed to')),
    );
  });
});
