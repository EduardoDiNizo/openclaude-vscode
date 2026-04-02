import * as vscode from 'vscode';
import { OpenClaudeWebviewProvider } from './webview/webviewProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenClaude VS Code extension activated');

  const provider = new OpenClaudeWebviewProvider(context.extensionUri);

  // Register sidebar webview provider (secondary sidebar)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebarSecondary', provider),
  );

  // Register sidebar webview provider (primary sidebar — older VS Code)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebar', provider),
  );

  // Open in New Tab
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.open', () => {
      provider.createPanel();
    }),
  );

  // Open (last location)
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.openLast', () => {
      provider.createPanel();
    }),
  );

  // Open in Primary Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.primaryEditor.open', () => {
      provider.createPanel();
    }),
  );

  // Register remaining commands as no-ops for now
  const noopCommands = [
    'openclaude.window.open',
    'openclaude.sidebar.open',
    'openclaude.terminal.open',
    'openclaude.terminal.open.keyboard',
    'openclaude.createWorktree',
    'openclaude.newConversation',
    'openclaude.focus',
    'openclaude.blur',
    'openclaude.insertAtMention',
    'openclaude.insertAtMentioned',
    'openclaude.acceptProposedDiff',
    'openclaude.rejectProposedDiff',
    'openclaude.showLogs',
    'openclaude.openWalkthrough',
    'openclaude.update',
    'openclaude.installPlugin',
    'openclaude.logout',
  ];

  for (const id of noopCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        vscode.window.showInformationMessage('OpenClaude: Coming soon!');
      }),
    );
  }
}

export function deactivate() {
  console.log('OpenClaude VS Code extension deactivated');
}
