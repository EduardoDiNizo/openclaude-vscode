import { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useVSCode, useMessageListener, usePersistedState } from './hooks/useVSCode';

function App() {
  const theme = useTheme();
  const { sendMessage, isVSCode } = useVSCode();
  const [draftText, setDraftText] = usePersistedState('draftText', '');
  const [initState, setInitState] = useState<{
    isSidebar: boolean;
    isFullEditor: boolean;
    extensionVersion: string;
  } | null>(null);
  const [processState, setProcessState] = useState<string>('not connected');

  // Listen for init state from extension host
  useMessageListener('init_state', (msg: Record<string, unknown>) => {
    setInitState({
      isSidebar: msg.isSidebar as boolean,
      isFullEditor: msg.isFullEditor as boolean,
      extensionVersion: msg.extensionVersion as string,
    });
  });

  // Listen for process state changes
  useMessageListener('process_state', (msg: Record<string, unknown>) => {
    setProcessState(msg.state as string);
  });

  const isSidebar = initState?.isSidebar ?? (window as Window).IS_SIDEBAR ?? false;

  return (
    <div className="flex flex-col h-screen bg-vscode-bg text-vscode-fg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border">
        <h1 className="text-sm font-semibold">OpenClaude</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-50">{theme}</span>
          <span className="text-xs opacity-50">
            {initState?.extensionVersion ?? 'v0.1.0'}
          </span>
        </div>
      </div>

      {/* Message area (placeholder — Chat UI comes in Story 4) */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center opacity-70 space-y-3">
          <p className="text-lg font-semibold">OpenClaude</p>
          <p className="text-sm">AI coding assistant powered by any LLM</p>
          <div className="text-xs space-y-1 mt-4 text-left mx-auto inline-block">
            <p>Bridge status: {isVSCode ? 'connected' : 'standalone'}</p>
            <p>Panel type: {isSidebar ? 'sidebar' : initState?.isFullEditor ? 'full editor' : 'editor tab'}</p>
            <p>Process: {processState}</p>
            <p>Theme: {theme}</p>
          </div>
          <p className="text-xs mt-4 opacity-50">
            Chat UI coming in Story 4.
          </p>
        </div>
      </div>

      {/* Input area (placeholder with working draft persistence) */}
      <div className="px-4 py-3 border-t border-vscode-border">
        <div className="flex items-center rounded border border-vscode-input-border bg-vscode-input-bg px-3 py-2">
          <input
            type="text"
            placeholder="Type a message... (not connected yet)"
            className="flex-1 bg-transparent text-vscode-input-fg outline-none text-sm"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draftText.trim()) {
                sendMessage('send_prompt', { text: draftText.trim() });
                setDraftText('');
              }
            }}
          />
        </div>
        <p className="text-xs opacity-30 mt-1 text-center">
          Draft text persists when panel is hidden (try hiding and re-showing)
        </p>
      </div>
    </div>
  );
}

export default App;
