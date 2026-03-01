import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  ExtPosition,
  PokemonColor,
  PokemonSize,
  PokemonType,
  Theme,
} from '../../../common/types';
import { CommandDeps } from '../../../extension/commands/types';
import { PokemonPanelLike } from '../../../extension/commands/types/pokemon-panel.type';
import {
  PokemonSpecificationCtor,
  PokemonSpecificationLike,
} from '../../../extension/commands/types/pokemon-specification.type';

type RegisteredCommand = (...args: unknown[]) => unknown;

class AutoSelectQuickPick<T extends vscode.QuickPickItem> implements Partial<
  vscode.QuickPick<T>
> {
  items: readonly T[] = [];
  selectedItems: readonly T[] = [];
  placeholder = '';
  matchOnDescription = false;

  private onDidChangeValueHandlers: Array<(value: string) => void> = [];
  private onDidAcceptHandlers: Array<() => void | Promise<void>> = [];
  private onDidHideHandlers: Array<() => void> = [];
  private hidden = false;

  onDidChangeValue(listener: (value: string) => void): vscode.Disposable {
    this.onDidChangeValueHandlers.push(listener);
    return { dispose: () => void 0 };
  }

  onDidAccept(listener: () => void | Promise<void>): vscode.Disposable {
    this.onDidAcceptHandlers.push(listener);
    return { dispose: () => void 0 };
  }

  onDidHide(listener: () => void): vscode.Disposable {
    this.onDidHideHandlers.push(listener);
    return { dispose: () => void 0 };
  }

  show(): void {
    this.onDidChangeValueHandlers.forEach((handler) => handler('pikachu'));
    const selected = this.items.find(
      (item) => (item as { isGeneration?: boolean }).isGeneration === false,
    );
    this.selectedItems = selected ? [selected] : [];
    this.onDidAcceptHandlers.forEach((handler) => {
      void handler();
    });
  }

  hide(): void {
    if (this.hidden) {
      return;
    }

    this.hidden = true;
    this.onDidHideHandlers.forEach((handler) => handler());
  }

  dispose(): void {
    this.hidden = true;
  }
}

export class FakePokemonSpecification implements PokemonSpecificationLike {
  generation: string;
  originalSpriteSize: number;

  constructor(
    public color: PokemonColor,
    public type: PokemonType,
    public size: PokemonSize,
    public name: string,
    generation = '',
  ) {
    this.generation = generation;
    this.originalSpriteSize = 64;
  }

  static fromConfiguration(): PokemonSpecificationLike {
    return new FakePokemonSpecification(
      PokemonColor.default,
      'pikachu' as PokemonType,
      PokemonSize.small,
      'Pikachu',
    );
  }

  static collectionFromMemento(
    _context: vscode.ExtensionContext,
    _size: PokemonSize,
  ): PokemonSpecificationLike[] {
    return [];
  }
}

export function createBaseCommandDeps(
  overrides: Partial<CommandDeps> = {},
): CommandDeps {
  return {
    pokemonSpecification: FakePokemonSpecification as PokemonSpecificationCtor,
    createOrShowPokemonPanel: (_extensionUri, _spec) => void 0,
    createPokemonPlayground: async (_context) => void 0,
    getConfiguredSize: () => PokemonSize.small,
    getConfiguredTheme: () => Theme.none,
    getConfiguredThemeKind: () => vscode.ColorThemeKind.Dark,
    getConfigurationPosition: () => ExtPosition.panel,
    getPokemonPanel: () => undefined,
    getSessionPokemonCollection: (_context) => [],
    getThrowWithMouseConfiguration: () => false,
    getWebview: () => undefined,
    hasWebviewViewProvider: () => false,
    maybeMakeShiny: (_possibleColors) => PokemonColor.default,
    spawnAndPersistCollection: async (_context, _panel, _collection) => void 0,
    storeCollectionAsMemento: async (_context, _collection) => void 0,
    ...overrides,
  };
}

export function createPanelRecorder(): {
  panel: PokemonPanelLike;
  calls: {
    resetPokemon: number;
    deletePokemon: number;
    listPokemon: number;
    rollCall: number;
    spawnPokemon: number;
  };
  deletedPokemonName: string | undefined;
  getSpawnedPokemon: () => PokemonSpecificationLike | undefined;
} {
  const calls = {
    resetPokemon: 0,
    deletePokemon: 0,
    listPokemon: 0,
    rollCall: 0,
    spawnPokemon: 0,
  };
  let deletedPokemonName: string | undefined;
  let spawnedPokemon: PokemonSpecificationLike | undefined;

  return {
    panel: {
      resetPokemon: () => {
        calls.resetPokemon += 1;
      },
      deletePokemon: (pokemonName: string) => {
        calls.deletePokemon += 1;
        deletedPokemonName = pokemonName;
      },
      listPokemon: () => {
        calls.listPokemon += 1;
      },
      rollCall: () => {
        calls.rollCall += 1;
      },
      spawnPokemon: (spec: PokemonSpecificationLike) => {
        calls.spawnPokemon += 1;
        spawnedPokemon = spec;
      },
    },
    calls,
    get deletedPokemonName() {
      return deletedPokemonName;
    },
    getSpawnedPokemon: () => spawnedPokemon,
  };
}

export function createWebviewRecorder(): {
  webview: vscode.Webview;
  emitMessage: (message: unknown) => void;
  hasListener: () => boolean;
} {
  let listener: ((message: unknown) => void) | undefined;

  return {
    webview: {
      onDidReceiveMessage: (handler: (message: unknown) => void) => {
        listener = handler;
        return { dispose: () => void 0 };
      },
    } as unknown as vscode.Webview,
    emitMessage: (message: unknown) => {
      listener?.(message);
    },
    hasListener: () => listener !== undefined,
  };
}

export function createCommandTestHarness(): {
  invokeRegisteredCommand: (commandId: string) => Promise<void>;
  setInputBoxResult: (value: string | undefined) => void;
  setQuickPickResult: (value: unknown) => void;
  setOpenDialogResult: (value: vscode.Uri[] | undefined) => void;
  useAutoSelectQuickPickForSpawn: () => void;
  setConfigurationValue: (key: string, value: unknown) => void;
  setExecuteCommandHandler: (
    commandId: string,
    handler: (...args: unknown[]) => unknown,
  ) => void;
  getExecutedCommands: () => Array<{ command: string; args: unknown[] }>;
  getInfoMessages: () => string[];
  getErrorMessages: () => string[];
  getInsertedText: () => string;
  getConfigUpdates: () => Array<{
    key: string;
    value: unknown;
    target: unknown;
  }>;
  restore: () => Promise<void>;
} {
  const originalShowInformationMessage = vscode.window.showInformationMessage;
  const originalShowErrorMessage = vscode.window.showErrorMessage;
  const originalShowQuickPick = vscode.window.showQuickPick;
  const originalShowInputBox = vscode.window.showInputBox;
  const originalShowOpenDialog = vscode.window.showOpenDialog;
  const originalCreateQuickPick = vscode.window.createQuickPick;
  const originalShowTextDocument = vscode.window.showTextDocument;
  const originalRegisterCommand = vscode.commands.registerCommand;
  const originalExecuteCommand = vscode.commands.executeCommand;
  const originalOpenTextDocument = vscode.workspace.openTextDocument;
  const originalGetConfiguration = vscode.workspace.getConfiguration;

  let inputBoxResult: string | undefined = 'Unit Test Pokemon';
  let quickPickResult: unknown;
  let openDialogResult: vscode.Uri[] | undefined;
  let insertedText = '';

  const infoMessages: string[] = [];
  const errorMessages: string[] = [];
  const configValues = new Map<string, unknown>();
  const configUpdates: Array<{ key: string; value: unknown; target: unknown }> =
    [];

  const commandMap = new Map<string, RegisteredCommand>();
  const executeHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const executedCommands: Array<{ command: string; args: unknown[] }> = [];

  const windowApi = vscode.window as unknown as {
    showInformationMessage: typeof vscode.window.showInformationMessage;
    showErrorMessage: typeof vscode.window.showErrorMessage;
    showQuickPick: typeof vscode.window.showQuickPick;
    showInputBox: typeof vscode.window.showInputBox;
    showOpenDialog: typeof vscode.window.showOpenDialog;
    createQuickPick: typeof vscode.window.createQuickPick;
    showTextDocument: typeof vscode.window.showTextDocument;
  };
  const commandsApi = vscode.commands as unknown as {
    registerCommand: typeof vscode.commands.registerCommand;
    executeCommand: typeof vscode.commands.executeCommand;
  };
  const workspaceApi = vscode.workspace as unknown as {
    openTextDocument: typeof vscode.workspace.openTextDocument;
    getConfiguration: typeof vscode.workspace.getConfiguration;
  };

  commandsApi.registerCommand = ((
    commandId: string,
    callback: (...args: unknown[]) => unknown,
    _thisArg?: unknown,
  ) => {
    commandMap.set(commandId, callback);
    return { dispose: () => commandMap.delete(commandId) };
  }) as typeof vscode.commands.registerCommand;

  commandsApi.executeCommand = (async (
    command: string,
    ...args: unknown[]
  ): Promise<unknown> => {
    executedCommands.push({ command, args });

    const commandHandler = commandMap.get(command);
    if (commandHandler) {
      return await commandHandler(...args);
    }

    const executeHandler = executeHandlers.get(command);
    if (executeHandler) {
      return executeHandler(...args);
    }

    return undefined;
  }) as typeof vscode.commands.executeCommand;

  windowApi.showInformationMessage = (async (
    message: string,
  ): Promise<string | undefined> => {
    infoMessages.push(message);
    return undefined;
  }) as typeof vscode.window.showInformationMessage;

  windowApi.showErrorMessage = (async (
    message: string,
  ): Promise<string | undefined> => {
    errorMessages.push(message);
    return undefined;
  }) as typeof vscode.window.showErrorMessage;

  windowApi.showQuickPick = (async () =>
    quickPickResult) as typeof vscode.window.showQuickPick;

  windowApi.showInputBox = (async () =>
    inputBoxResult) as typeof vscode.window.showInputBox;

  windowApi.showOpenDialog = (async () =>
    openDialogResult) as typeof vscode.window.showOpenDialog;

  windowApi.createQuickPick = (<T extends vscode.QuickPickItem>() => {
    throw new Error('createQuickPick mock not configured in this test');
  }) as typeof vscode.window.createQuickPick;

  workspaceApi.openTextDocument = (async (uri: vscode.Uri) => ({
    uri,
    getText: () => '',
  })) as unknown as typeof vscode.workspace.openTextDocument;

  windowApi.showTextDocument = (async () => {
    return {
      edit: async (
        callback: (edit: {
          insert: (position: vscode.Position, text: string) => void;
        }) => void,
      ) => {
        callback({
          insert: (_position: vscode.Position, text: string) => {
            insertedText += text;
          },
        });
        return true;
      },
    } as unknown as vscode.TextEditor;
  }) as typeof vscode.window.showTextDocument;

  workspaceApi.getConfiguration = ((section?: string) => {
    const cfg = {
      get: ((key: string, defaultValue?: unknown) => {
        const fullKey = section ? `${section}.${key}` : key;
        if (configValues.has(fullKey)) return configValues.get(fullKey);
        return defaultValue;
      }) as vscode.WorkspaceConfiguration['get'],

      has: (key: string): boolean => {
        const fullKey = section ? `${section}.${key}` : key;
        return configValues.has(fullKey);
      },

      inspect: ((key: string) => {
        const fullKey = section ? `${section}.${key}` : key;
        if (!configValues.has(fullKey)) return undefined;

        const value = configValues.get(fullKey);
        return {
          key: fullKey,
          defaultValue: undefined,
          globalValue: value,
          workspaceValue: undefined,
          workspaceFolderValue: undefined,
        };
      }) as vscode.WorkspaceConfiguration['inspect'],

      update: async (
        key: string,
        value: unknown,
        _configurationTarget?: boolean | null | vscode.ConfigurationTarget,
        _overrideInLanguage?: boolean,
      ): Promise<void> => {
        const fullKey = section ? `${section}.${key}` : key;
        configValues.set(fullKey, value);
      },
    } satisfies vscode.WorkspaceConfiguration;

    return cfg;
  }) as typeof vscode.workspace.getConfiguration;

  return {
    invokeRegisteredCommand: async (commandId: string) => {
      const callback = commandMap.get(commandId);
      assert.ok(callback, `Expected command '${commandId}' to be registered`);
      await callback?.();
    },
    setInputBoxResult: (value: string | undefined) => {
      inputBoxResult = value;
    },
    setQuickPickResult: (value: unknown) => {
      quickPickResult = value;
    },
    setOpenDialogResult: (value: vscode.Uri[] | undefined) => {
      openDialogResult = value;
    },
    useAutoSelectQuickPickForSpawn: () => {
      windowApi.createQuickPick = (<T extends vscode.QuickPickItem>() =>
        new AutoSelectQuickPick<T>() as unknown as vscode.QuickPick<T>) as typeof vscode.window.createQuickPick;
    },
    setConfigurationValue: (key: string, value: unknown) => {
      configValues.set(key, value);
    },
    setExecuteCommandHandler: (
      commandId: string,
      handler: (...args: unknown[]) => unknown,
    ) => {
      executeHandlers.set(commandId, handler);
    },
    getExecutedCommands: () => [...executedCommands],
    getInfoMessages: () => [...infoMessages],
    getErrorMessages: () => [...errorMessages],
    getInsertedText: () => insertedText,
    getConfigUpdates: () => [...configUpdates],
    restore: async () => {
      windowApi.showInformationMessage = originalShowInformationMessage;
      windowApi.showErrorMessage = originalShowErrorMessage;
      windowApi.showQuickPick = originalShowQuickPick;
      windowApi.showInputBox = originalShowInputBox;
      windowApi.showOpenDialog = originalShowOpenDialog;
      windowApi.createQuickPick = originalCreateQuickPick;
      windowApi.showTextDocument = originalShowTextDocument;

      commandsApi.registerCommand = originalRegisterCommand;
      commandsApi.executeCommand = originalExecuteCommand;

      workspaceApi.openTextDocument = originalOpenTextDocument;
      workspaceApi.getConfiguration = originalGetConfiguration;

      await vscode.commands.executeCommand(
        'setContext',
        'vscode-pokemon.position',
        undefined,
      );
    },
  };
}
