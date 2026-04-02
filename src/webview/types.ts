/**
 * PostMessage types for webview <-> extension host communication.
 *
 * Pattern extracted from Claude Code extension.js (DQ class):
 * - Webview sends messages via vscode.postMessage({ type: '...', ...payload })
 * - Extension host receives via webview.onDidReceiveMessage
 * - Extension host sends via webview.postMessage({ type: '...', ...payload })
 * - Webview receives via window.addEventListener('message', ...)
 */

// ============================================================
// Webview -> Extension Host messages
// ============================================================

/** Webview signals it has loaded and is ready to receive data */
export interface ReadyMessage {
  type: 'ready';
}

/** User submits a chat prompt */
export interface SendPromptMessage {
  type: 'send_prompt';
  text: string;
  attachments?: Attachment[];
  mentions?: Mention[];
}

/** User wants to interrupt/cancel current generation */
export interface InterruptMessage {
  type: 'interrupt';
}

/** User responds to a permission request */
export interface PermissionResponseMessage {
  type: 'permission_response';
  requestId: string;
  allowed: boolean;
  alwaysAllow?: boolean;
}

/** User responds to an elicitation request */
export interface ElicitationResponseMessage {
  type: 'elicitation_response';
  requestId: string;
  response: Record<string, unknown>;
}

/** User wants to start a new conversation */
export interface NewConversationMessage {
  type: 'new_conversation';
}

/** User wants to resume a session */
export interface ResumeSessionMessage {
  type: 'resume_session';
  sessionId: string;
}

/** User changes the AI model */
export interface SetModelMessage {
  type: 'set_model';
  model: string;
}

/** User changes permission mode */
export interface SetPermissionModeMessage {
  type: 'set_permission_mode';
  mode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk';
}

/** User requests context usage info */
export interface GetContextUsageMessage {
  type: 'get_context_usage';
}

/** User copies text to clipboard */
export interface CopyToClipboardMessage {
  type: 'copy_to_clipboard';
  text: string;
}

/** User clicks a file reference to open in editor */
export interface OpenFileMessage {
  type: 'open_file';
  filePath: string;
  line?: number;
  column?: number;
}

/** User accepts/rejects a proposed diff */
export interface DiffResponseMessage {
  type: 'diff_response';
  accepted: boolean;
  filePath: string;
}

/** User requests to open plugins dialog */
export interface OpenPluginsMessage {
  type: 'open_plugins';
  pluginName?: string;
  marketplace?: string;
}

/** User requests logout */
export interface LogoutMessage {
  type: 'logout';
}

/** User requests session list */
export interface GetSessionsMessage {
  type: 'get_sessions';
}

/** Webview requests state restore after re-show */
export interface RestoreStateMessage {
  type: 'restore_state';
}

/** User executes a slash command */
export interface SlashCommandMessage {
  type: 'slash_command';
  command: string;
  args?: string;
}

/** User changes effort level */
export interface SetEffortLevelMessage {
  type: 'set_effort_level';
  level: 'low' | 'medium' | 'high' | 'max';
}

/** User requests rewind to a checkpoint */
export interface RewindMessage {
  type: 'rewind';
  messageId: string;
  dryRun?: boolean;
}

/** All messages the webview can send to the extension host */
export type WebviewToHostMessage =
  | ReadyMessage
  | SendPromptMessage
  | InterruptMessage
  | PermissionResponseMessage
  | ElicitationResponseMessage
  | NewConversationMessage
  | ResumeSessionMessage
  | SetModelMessage
  | SetPermissionModeMessage
  | GetContextUsageMessage
  | CopyToClipboardMessage
  | OpenFileMessage
  | DiffResponseMessage
  | OpenPluginsMessage
  | LogoutMessage
  | GetSessionsMessage
  | RestoreStateMessage
  | SlashCommandMessage
  | SetEffortLevelMessage
  | RewindMessage;

// ============================================================
// Extension Host -> Webview messages
// ============================================================

/** Initial state sent to webview after 'ready' */
export interface InitStateMessage {
  type: 'init_state';
  isSidebar: boolean;
  isFullEditor: boolean;
  isSessionListOnly: boolean;
  theme: 'dark' | 'light' | 'high-contrast';
  initialSessionId?: string;
  initialPrompt?: string;
  extensionVersion: string;
}

/** Forwarded CLI stdout message (NDJSON line) */
export interface CliOutputMessage {
  type: 'cli_output';
  data: unknown; // Raw NDJSON message from CLI — webview parses by subtype
}

/** Permission request from CLI → show dialog in webview */
export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel?: string;
}

/** Cancel a stale permission/elicitation dialog */
export interface CancelRequestMessage {
  type: 'cancel_request';
  requestId: string;
}

/** Elicitation request from CLI → show structured question */
export interface ElicitationRequestMessage {
  type: 'elicitation_request';
  requestId: string;
  question: string;
  responseFormat: unknown;
}

/** Session state changed (for multi-panel badge updates) */
export interface SessionStateMessage {
  type: 'session_state';
  sessions: SessionInfo[];
  activeSessionId?: string;
}

/** Context usage response */
export interface ContextUsageMessage {
  type: 'context_usage';
  utilization: number;
  error?: string;
}

/** Theme changed in VS Code */
export interface ThemeChangedMessage {
  type: 'theme_changed';
  theme: 'dark' | 'light' | 'high-contrast';
}

/** At-mention inserted from editor */
export interface AtMentionInsertedMessage {
  type: 'at_mention_inserted';
  text: string;
}

/** Session list data */
export interface SessionListMessage {
  type: 'session_list';
  sessions: SessionSummary[];
}

/** CLI process state changed */
export interface ProcessStateMessage {
  type: 'process_state';
  state: 'starting' | 'running' | 'stopped' | 'crashed' | 'restarting';
}

/** Font configuration changed */
export interface FontConfigMessage {
  type: 'font_config';
  editorFontFamily: string;
  editorFontSize: number;
  editorFontWeight: string;
  chatFontSize: number;
  chatFontFamily: string;
}

/** All messages the extension host can send to the webview */
export type HostToWebviewMessage =
  | InitStateMessage
  | CliOutputMessage
  | PermissionRequestMessage
  | CancelRequestMessage
  | ElicitationRequestMessage
  | SessionStateMessage
  | ContextUsageMessage
  | ThemeChangedMessage
  | AtMentionInsertedMessage
  | SessionListMessage
  | ProcessStateMessage
  | FontConfigMessage;

// ============================================================
// Shared types
// ============================================================

export interface Attachment {
  type: 'file' | 'image' | 'url' | 'text';
  name: string;
  content: string; // base64 for images, path for files, raw for text/url
}

export interface Mention {
  type: 'file' | 'folder' | 'line_range' | 'terminal' | 'browser';
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface SessionInfo {
  sessionId: string;
  state: 'running' | 'waiting_input' | 'idle' | 'stopped';
  title?: string;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  model?: string;
  timestamp: number;
  messageCount: number;
  isStarred?: boolean;
}

// ============================================================
// Panel identification
// ============================================================

export type PanelLocation = 'sidebar' | 'editor-tab' | 'new-window';

export interface PanelInfo {
  id: string;
  location: PanelLocation;
  sessionId?: string;
  isVisible: boolean;
}
