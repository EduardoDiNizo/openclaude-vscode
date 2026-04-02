// Minimal VS Code API mock for unit testing outside Extension Development Host

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export class Disposable {
  private callOnDispose: () => void;
  constructor(callOnDispose: () => void) {
    this.callOnDispose = callOnDispose;
  }
  dispose(): void {
    this.callOnDispose();
  }
  static from(...disposables: { dispose: () => void }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }
}

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => defaultValue,
    has: (key: string) => false,
    inspect: (key: string) => undefined,
    update: async (key: string, value: unknown) => {},
  }),
  workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
};

export const window = {
  showErrorMessage: async (message: string) => undefined,
  showWarningMessage: async (message: string) => undefined,
  showInformationMessage: async (message: string) => undefined,
  createOutputChannel: (name: string) => ({
    appendLine: (value: string) => {},
    append: (value: string) => {},
    show: () => {},
    dispose: () => {},
  }),
};

export enum LogLevel {
  Off = 0,
  Trace = 1,
  Debug = 2,
  Info = 3,
  Warning = 4,
  Error = 5,
}

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  parse: (value: string) => ({ fsPath: value, scheme: 'file' }),
};
