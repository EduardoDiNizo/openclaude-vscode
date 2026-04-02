import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenClaude VS Code extension activated');

  // Register the "Open in New Tab" command as a basic smoke test
  const openInTab = vscode.commands.registerCommand('openclaude.editor.open', () => {
    vscode.window.showInformationMessage('OpenClaude: Coming soon!');
  });

  // Register the "Open" command (hidden, used by editor title button)
  const openLast = vscode.commands.registerCommand('openclaude.editor.openLast', () => {
    vscode.window.showInformationMessage('OpenClaude: Coming soon!');
  });

  // Register remaining commands as no-ops for now (prevents "command not found" errors)
  const commandIds = [
    'openclaude.primaryEditor.open',
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

  for (const id of commandIds) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        vscode.window.showInformationMessage('OpenClaude: Coming soon!');
      }),
    );
  }

  context.subscriptions.push(openInTab, openLast);
}

export function deactivate() {
  console.log('OpenClaude VS Code extension deactivated');
}
