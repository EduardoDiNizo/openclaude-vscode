# Story 7: Permission System & Dialogs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full permission system — handle `can_use_tool` control requests from the CLI, show a PermissionDialog in the webview, collect allow/deny/always-allow responses, send `control_response` back to CLI, display a permission mode indicator in the footer with mode switching, handle auto/bypass/plan modes, and support `control_cancel_request` to dismiss stale dialogs.

**Architecture:** The CLI sends `control_request` with `subtype: 'can_use_tool'` to the extension host. The `PermissionHandler` (extension host) receives this via the `ControlRouter` (Story 2), forwards it to the webview via `WebviewBridge` (Story 3) as a `permission_request` postMessage. The webview renders a `PermissionDialog` modal. User clicks Allow/Deny/Always Allow. The response flows back via `permission_response` postMessage to the extension host, which sends a `control_response` NDJSON to the CLI's stdin. Permission mode changes flow in the opposite direction: user clicks the mode indicator in `ContextFooter`, selects a new mode, webview sends `set_permission_mode` postMessage, extension host sends `set_permission_mode` control_request to CLI.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, React 18, Tailwind CSS 3

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 7, Sections 2.3.4, 3.4, 4.3

**Dependencies:**
- Story 2: `ControlRouter` (routes `control_request` by subtype), `NdjsonTransport` (writes `control_response` to CLI stdin)
- Story 3: `WebviewBridge` (postMessage bridge between extension host and webview)
- Story 4: Chat UI shell (message list, streaming — provides the webview context where dialogs render)

**Key protocol schemas (source of truth):**
- `openclaude/src/entrypoints/sdk/controlSchemas.ts` — `SDKControlPermissionRequestSchema`, `SDKControlSetPermissionModeRequestSchema`, `SDKControlCancelRequestSchema`
- `openclaude/src/entrypoints/sdk/coreSchemas.ts` — `PermissionModeSchema`, `PermissionResultSchema`, `PermissionUpdateSchema`, `PermissionDecisionClassificationSchema`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/permissions/permissionHandler.ts` | Extension host module — receives `can_use_tool` from CLI, forwards to webview, collects response, sends `control_response` back. Tracks pending requests for cancellation. |
| `webview/src/components/dialogs/PermissionDialog.tsx` | Webview modal — shows tool name, formatted input, Allow/Deny/Always Allow buttons. |
| `webview/src/components/dialogs/PlanViewer.tsx` | Webview component — renders plan document from CLI when in plan mode. |
| `webview/src/components/input/PermissionModeIndicator.tsx` | Webview component — footer badge showing current permission mode with click-to-switch dropdown. |
| `webview/src/hooks/usePermissions.ts` | React hook — manages permission dialog state, pending requests queue, mode state. |
| `src/types/messages.ts` | Update — add `permission_suggestions`, `title`, `display_name`, `description`, `blocked_path`, `decision_reason` fields to `PermissionRequestMessage`. |
| `src/webview/types.ts` | Update — add `permissionMode` to `InitStateMessage`, add `PermissionModeChangedMessage`, expand `PermissionResponseMessage` with `updatedPermissions`. |

---

## Task 1: Extend PostMessage Types for Rich Permission Data

**Files:**
- Modify: `src/webview/types.ts`
- Modify: `src/types/messages.ts` (verify existing types are sufficient)

The existing `PermissionRequestMessage` is too thin — it only has `toolName`, `toolInput`, `riskLevel`. The CLI sends much richer data: `permission_suggestions`, `title`, `display_name`, `description`, `blocked_path`, `decision_reason`, `tool_use_id`, `agent_id`. We need to pass all of this through to the webview.

Similarly, the `PermissionResponseMessage` going back needs to carry `updatedPermissions` for "Always Allow" and `decisionClassification` for telemetry.

- [ ] **Step 1: Update PermissionRequestMessage in src/webview/types.ts**

Replace the existing `PermissionRequestMessage` with the full fields:

```typescript
/** Permission request from CLI -> show dialog in webview */
export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  toolName: string;
  displayName?: string;
  toolInput: Record<string, unknown>;
  title?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  permissionSuggestions?: PermissionSuggestion[];
  toolUseId: string;
  agentId?: string;
}

/** A suggested permission rule that "Always Allow" can apply */
export interface PermissionSuggestion {
  type: 'addRules' | 'replaceRules' | 'removeRules';
  rules: Array<{ toolName: string; ruleContent?: string }>;
  behavior: 'allow' | 'deny' | 'ask';
  destination: 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';
}
```

- [ ] **Step 2: Update PermissionResponseMessage in src/webview/types.ts**

Replace the existing `PermissionResponseMessage`:

```typescript
/** User responds to a permission request */
export interface PermissionResponseMessage {
  type: 'permission_response';
  requestId: string;
  behavior: 'allow' | 'deny';
  updatedPermissions?: PermissionSuggestion[];
  decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject';
}
```

- [ ] **Step 3: Add PermissionModeChangedMessage (host -> webview)**

Add to the host-to-webview messages section:

```typescript
/** Permission mode changed (from CLI status update or user action) */
export interface PermissionModeChangedMessage {
  type: 'permission_mode_changed';
  mode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk';
}
```

Add it to the `HostToWebviewMessage` union.

- [ ] **Step 4: Add permissionMode to InitStateMessage**

Add to the existing `InitStateMessage`:

```typescript
export interface InitStateMessage {
  type: 'init_state';
  isSidebar: boolean;
  isFullEditor: boolean;
  isSessionListOnly: boolean;
  theme: 'dark' | 'light' | 'high-contrast';
  initialSessionId?: string;
  initialPrompt?: string;
  extensionVersion: string;
  permissionMode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk';
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/webview/types.ts
git commit -m "feat(permissions): extend PostMessage types with rich permission data"
```

---

## Task 2: PermissionHandler (Extension Host)

**Files:**
- Create: `src/permissions/permissionHandler.ts`

This is the core orchestrator. It:
1. Registers as a handler for `can_use_tool` control_request subtypes on the ControlRouter
2. When a `can_use_tool` arrives, checks the current permission mode — if auto, immediately responds with allow
3. Otherwise, forwards to all active webview bridges as a `permission_request` postMessage
4. Listens for `permission_response` from webview bridges
5. Constructs the correct `control_response` NDJSON and writes it to CLI stdin
6. Handles `control_cancel_request` by dismissing pending dialogs
7. Handles `set_permission_mode` webview messages by sending to CLI

- [ ] **Step 1: Create src/permissions/permissionHandler.ts**

```typescript
import * as vscode from 'vscode';
import type { WebviewBridge } from '../webview/webviewBridge';
import type {
  PermissionRequestMessage,
  PermissionResponseMessage,
  PermissionModeChangedMessage,
  PermissionSuggestion,
  SetPermissionModeMessage,
  CancelRequestMessage,
} from '../webview/types';
import type {
  ControlRequestPermission,
  SDKControlRequest,
  SDKControlCancelRequest,
  SDKControlResponse,
  SDKControlRequest as StdinControlRequest,
} from '../types/messages';
import type { PermissionMode, PermissionResult, PermissionUpdate } from '../types/session';

interface PendingPermissionRequest {
  requestId: string;
  request: ControlRequestPermission;
  timestamp: number;
}

/**
 * PermissionHandler — orchestrates the permission flow between CLI and webview.
 *
 * Flow:
 *   CLI stdout -> control_request(can_use_tool) -> PermissionHandler
 *     -> postMessage(permission_request) -> Webview PermissionDialog
 *     -> postMessage(permission_response) -> PermissionHandler
 *     -> CLI stdin <- control_response(allow/deny)
 *
 * Pattern extracted from Claude Code extension.js permission handling.
 */
export class PermissionHandler implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingRequests = new Map<string, PendingPermissionRequest>();
  private readonly bridges: Set<WebviewBridge> = new Set();
  private currentMode: PermissionMode = 'default';

  /** Callback to write a message to CLI stdin (injected by ProcessManager) */
  private writeToStdin: ((message: unknown) => void) | null = null;

  constructor() {}

  /**
   * Set the function used to write NDJSON to the CLI's stdin.
   * Called by ProcessManager after spawn.
   */
  setStdinWriter(writer: (message: unknown) => void): void {
    this.writeToStdin = writer;
  }

  /**
   * Clear the stdin writer (called when CLI process exits).
   */
  clearStdinWriter(): void {
    this.writeToStdin = null;
    // Reject all pending requests since the CLI is gone
    this.rejectAllPending('CLI process exited');
  }

  /**
   * Register a webview bridge to receive permission dialogs and send responses.
   * Returns a Disposable that unregisters the bridge.
   */
  registerBridge(bridge: WebviewBridge): vscode.Disposable {
    this.bridges.add(bridge);

    // Listen for permission responses from this bridge
    const responseSub = bridge.onMessage('permission_response', (msg) => {
      this.handlePermissionResponse(msg as PermissionResponseMessage);
    });

    // Listen for permission mode change requests from this bridge
    const modeSub = bridge.onMessage('set_permission_mode', (msg) => {
      this.handleSetPermissionMode(msg as SetPermissionModeMessage);
    });

    this.disposables.push(responseSub, modeSub);

    return {
      dispose: () => {
        this.bridges.delete(bridge);
        responseSub.dispose();
        modeSub.dispose();
      },
    };
  }

  /**
   * Handle a can_use_tool control_request from the CLI.
   * Called by the ControlRouter when it receives this subtype.
   */
  handlePermissionRequest(controlRequest: SDKControlRequest): void {
    const request = controlRequest.request as ControlRequestPermission;
    const requestId = controlRequest.request_id;

    // In auto mode (bypassPermissions), immediately allow without showing dialog
    if (this.currentMode === 'bypassPermissions') {
      this.sendPermissionResponse(requestId, {
        behavior: 'allow',
        toolUseID: request.tool_use_id,
        decisionClassification: 'user_temporary',
      });
      return;
    }

    // In dontAsk mode, deny if not pre-approved (CLI handles pre-approved rules)
    // If it reaches us, it means CLI couldn't auto-approve, so we deny.
    if (this.currentMode === 'dontAsk') {
      this.sendPermissionResponse(requestId, {
        behavior: 'deny',
        message: 'Permission denied: dontAsk mode is active',
        toolUseID: request.tool_use_id,
        decisionClassification: 'user_reject',
      });
      return;
    }

    // Store pending request
    this.pendingRequests.set(requestId, {
      requestId,
      request,
      timestamp: Date.now(),
    });

    // Convert permission_suggestions to the webview format
    const permissionSuggestions: PermissionSuggestion[] | undefined =
      request.permission_suggestions?.map((s) => {
        if (s.type === 'addRules' || s.type === 'replaceRules' || s.type === 'removeRules') {
          return {
            type: s.type,
            rules: s.rules,
            behavior: s.behavior,
            destination: s.destination,
          } as PermissionSuggestion;
        }
        // setMode, addDirectories, removeDirectories are not permission suggestions
        // for the dialog — filter them out
        return null;
      }).filter((s): s is PermissionSuggestion => s !== null);

    // Forward to all active webview bridges
    const msg: PermissionRequestMessage = {
      type: 'permission_request',
      requestId,
      toolName: request.tool_name,
      displayName: request.display_name,
      toolInput: request.input,
      title: request.title,
      description: request.description,
      decisionReason: request.decision_reason,
      blockedPath: request.blocked_path,
      permissionSuggestions: permissionSuggestions?.length ? permissionSuggestions : undefined,
      toolUseId: request.tool_use_id,
      agentId: request.agent_id,
    };

    for (const bridge of this.bridges) {
      bridge.postMessage(msg);
    }
  }

  /**
   * Handle a control_cancel_request from the CLI.
   * Dismisses the corresponding permission dialog in the webview.
   */
  handleCancelRequest(cancelRequest: SDKControlCancelRequest): void {
    const requestId = cancelRequest.request_id;

    if (this.pendingRequests.has(requestId)) {
      this.pendingRequests.delete(requestId);

      // Tell all bridges to dismiss the dialog
      const cancelMsg: CancelRequestMessage = {
        type: 'cancel_request',
        requestId,
      };

      for (const bridge of this.bridges) {
        bridge.postMessage(cancelMsg);
      }
    }
  }

  /**
   * Update the current permission mode.
   * Called when CLI sends a status message with permissionMode, or on init.
   */
  setPermissionMode(mode: PermissionMode): void {
    this.currentMode = mode;

    // Notify all bridges of the mode change
    const msg: PermissionModeChangedMessage = {
      type: 'permission_mode_changed',
      mode,
    };

    for (const bridge of this.bridges) {
      bridge.postMessage(msg);
    }
  }

  /**
   * Get the current permission mode.
   */
  getPermissionMode(): PermissionMode {
    return this.currentMode;
  }

  /**
   * Handle a permission_response from the webview.
   */
  private handlePermissionResponse(msg: PermissionResponseMessage): void {
    const pending = this.pendingRequests.get(msg.requestId);
    if (!pending) {
      console.warn(`PermissionHandler: No pending request for ID ${msg.requestId}`);
      return;
    }

    this.pendingRequests.delete(msg.requestId);

    // Build the PermissionResult for the CLI
    if (msg.behavior === 'allow') {
      const result: PermissionResult = {
        behavior: 'allow',
        toolUseID: pending.request.tool_use_id,
        decisionClassification: msg.decisionClassification ?? 'user_temporary',
      };

      // If "Always Allow" was clicked, include the permission updates
      if (msg.updatedPermissions && msg.updatedPermissions.length > 0) {
        result.updatedPermissions = msg.updatedPermissions.map((s) => ({
          type: s.type,
          rules: s.rules,
          behavior: s.behavior,
          destination: s.destination,
        })) as PermissionUpdate[];
        result.decisionClassification = 'user_permanent';
      }

      this.sendPermissionResponse(msg.requestId, result);
    } else {
      this.sendPermissionResponse(msg.requestId, {
        behavior: 'deny',
        message: 'User denied permission',
        toolUseID: pending.request.tool_use_id,
        decisionClassification: msg.decisionClassification ?? 'user_reject',
      });
    }
  }

  /**
   * Handle set_permission_mode from the webview (user clicked mode picker).
   */
  private handleSetPermissionMode(msg: SetPermissionModeMessage): void {
    const mode = msg.mode;

    // Gate bypass mode behind the setting
    if (mode === 'bypassPermissions') {
      const config = vscode.workspace.getConfiguration('openclaudeCode');
      const allowBypass = config.get<boolean>('allowDangerouslySkipPermissions', false);
      if (!allowBypass) {
        vscode.window.showWarningMessage(
          'Bypass mode requires enabling "openclaudeCode.allowDangerouslySkipPermissions" in settings.',
        );
        return;
      }
    }

    // Update local state
    this.currentMode = mode;

    // Send set_permission_mode control_request to CLI
    if (this.writeToStdin) {
      const controlRequest: SDKControlRequest = {
        type: 'control_request',
        request_id: `perm-mode-${Date.now()}`,
        request: {
          subtype: 'set_permission_mode',
          mode,
        },
      };
      this.writeToStdin(controlRequest);
    }

    // Notify all bridges of the mode change
    const modeMsg: PermissionModeChangedMessage = {
      type: 'permission_mode_changed',
      mode,
    };
    for (const bridge of this.bridges) {
      bridge.postMessage(modeMsg);
    }
  }

  /**
   * Send a control_response back to the CLI with the permission decision.
   */
  private sendPermissionResponse(requestId: string, result: PermissionResult): void {
    if (!this.writeToStdin) {
      console.error('PermissionHandler: No stdin writer — cannot send response');
      return;
    }

    const response: SDKControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: result as unknown as Record<string, unknown>,
      },
    };

    this.writeToStdin(response);
  }

  /**
   * Reject all pending permission requests (e.g., when CLI exits).
   */
  private rejectAllPending(reason: string): void {
    for (const [requestId, pending] of this.pendingRequests) {
      // Tell webview to dismiss dialogs
      const cancelMsg: CancelRequestMessage = {
        type: 'cancel_request',
        requestId,
      };
      for (const bridge of this.bridges) {
        bridge.postMessage(cancelMsg);
      }
    }
    this.pendingRequests.clear();
  }

  dispose(): void {
    this.rejectAllPending('PermissionHandler disposed');
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.bridges.clear();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/permissions/permissionHandler.ts
git commit -m "feat(permissions): add PermissionHandler for CLI-to-webview permission flow"
```

---

## Task 3: usePermissions React Hook

**Files:**
- Create: `webview/src/hooks/usePermissions.ts`

This hook manages all permission state inside the webview:
- Queue of pending permission requests (multiple can stack)
- Current permission mode
- Methods to respond to permission dialogs
- Handles `cancel_request` to dismiss stale dialogs

- [ ] **Step 1: Create webview/src/hooks/usePermissions.ts**

```typescript
import { useState, useCallback, useEffect } from 'react';
import { vscode } from '../vscode';

// ============================================================================
// Types
// ============================================================================

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk';

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  displayName?: string;
  toolInput: Record<string, unknown>;
  title?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  permissionSuggestions?: PermissionSuggestion[];
  toolUseId: string;
  agentId?: string;
  timestamp: number;
}

export interface PermissionSuggestion {
  type: 'addRules' | 'replaceRules' | 'removeRules';
  rules: Array<{ toolName: string; ruleContent?: string }>;
  behavior: 'allow' | 'deny' | 'ask';
  destination: 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';
}

export interface UsePermissionsResult {
  /** The current pending permission request (top of queue), or null */
  currentRequest: PermissionRequest | null;
  /** Number of queued permission requests */
  pendingCount: number;
  /** Current permission mode */
  permissionMode: PermissionMode;
  /** Allow the current tool use (one-time) */
  allow: () => void;
  /** Deny the current tool use */
  deny: () => void;
  /** Allow and persist the permission rule ("Always Allow") */
  alwaysAllow: () => void;
  /** Change the permission mode */
  setPermissionMode: (mode: PermissionMode) => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * usePermissions — manages permission dialog state and mode switching.
 *
 * Listens for:
 * - `permission_request` from extension host (new dialog)
 * - `cancel_request` from extension host (dismiss stale dialog)
 * - `permission_mode_changed` from extension host (mode update)
 *
 * Sends:
 * - `permission_response` to extension host (user's decision)
 * - `set_permission_mode` to extension host (mode change)
 */
export function usePermissions(initialMode?: PermissionMode): UsePermissionsResult {
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [permissionMode, setPermissionModeState] = useState<PermissionMode>(
    initialMode ?? 'default',
  );

  // Listen for messages from the extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;

      switch (msg.type) {
        case 'permission_request':
          setRequests((prev) => [
            ...prev,
            {
              requestId: msg.requestId,
              toolName: msg.toolName,
              displayName: msg.displayName,
              toolInput: msg.toolInput,
              title: msg.title,
              description: msg.description,
              decisionReason: msg.decisionReason,
              blockedPath: msg.blockedPath,
              permissionSuggestions: msg.permissionSuggestions,
              toolUseId: msg.toolUseId,
              agentId: msg.agentId,
              timestamp: Date.now(),
            },
          ]);
          break;

        case 'cancel_request':
          setRequests((prev) => prev.filter((r) => r.requestId !== msg.requestId));
          break;

        case 'permission_mode_changed':
          setPermissionModeState(msg.mode);
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const currentRequest = requests.length > 0 ? requests[0] : null;

  const respondAndDequeue = useCallback(
    (
      behavior: 'allow' | 'deny',
      updatedPermissions?: PermissionSuggestion[],
      decisionClassification?: 'user_temporary' | 'user_permanent' | 'user_reject',
    ) => {
      if (!currentRequest) return;

      vscode.postMessage({
        type: 'permission_response',
        requestId: currentRequest.requestId,
        behavior,
        updatedPermissions,
        decisionClassification,
      });

      setRequests((prev) => prev.slice(1));
    },
    [currentRequest],
  );

  const allow = useCallback(() => {
    respondAndDequeue('allow', undefined, 'user_temporary');
  }, [respondAndDequeue]);

  const deny = useCallback(() => {
    respondAndDequeue('deny', undefined, 'user_reject');
  }, [respondAndDequeue]);

  const alwaysAllow = useCallback(() => {
    if (!currentRequest) return;

    // Use the CLI's suggested permission rules if available,
    // otherwise create a basic "allow this tool" rule
    const updatedPermissions: PermissionSuggestion[] =
      currentRequest.permissionSuggestions && currentRequest.permissionSuggestions.length > 0
        ? currentRequest.permissionSuggestions
        : [
            {
              type: 'addRules',
              rules: [{ toolName: currentRequest.toolName }],
              behavior: 'allow',
              destination: 'session',
            },
          ];

    respondAndDequeue('allow', updatedPermissions, 'user_permanent');
  }, [currentRequest, respondAndDequeue]);

  const setPermissionMode = useCallback((mode: PermissionMode) => {
    setPermissionModeState(mode);
    vscode.postMessage({
      type: 'set_permission_mode',
      mode,
    });
  }, []);

  return {
    currentRequest,
    pendingCount: requests.length,
    permissionMode,
    allow,
    deny,
    alwaysAllow,
    setPermissionMode,
  };
}
```

- [ ] **Step 2: Verify webview TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/hooks/usePermissions.ts
git commit -m "feat(permissions): add usePermissions React hook for dialog state management"
```

---

## Task 4: PermissionDialog Webview Component

**Files:**
- Create: `webview/src/components/dialogs/PermissionDialog.tsx`

The permission dialog is a modal that appears when the CLI needs permission for a tool. It shows:
- Tool name (or display_name if available)
- Title/description from the CLI
- Formatted JSON of the tool input (with syntax highlighting)
- Blocked path warning (if present)
- Decision reason text (if present)
- Agent badge (if from a subagent)
- Three buttons: Allow Once, Deny, Always Allow

- [ ] **Step 1: Create webview/src/components/dialogs/PermissionDialog.tsx**

```tsx
import React, { useMemo } from 'react';
import type { PermissionRequest } from '../../hooks/usePermissions';

interface PermissionDialogProps {
  request: PermissionRequest;
  pendingCount: number;
  onAllow: () => void;
  onDeny: () => void;
  onAlwaysAllow: () => void;
}

/**
 * PermissionDialog — modal overlay requesting user approval for a tool.
 *
 * Visual design extracted from Claude Code extension webview:
 * - Dark overlay backdrop
 * - Centered card with tool name header
 * - JSON-formatted tool input in a scrollable code block
 * - Three action buttons at the bottom
 */
export function PermissionDialog({
  request,
  pendingCount,
  onAllow,
  onDeny,
  onAlwaysAllow,
}: PermissionDialogProps) {
  const formattedInput = useMemo(() => {
    try {
      return JSON.stringify(request.toolInput, null, 2);
    } catch {
      return String(request.toolInput);
    }
  }, [request.toolInput]);

  const displayName = request.displayName ?? request.toolName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg mx-4 rounded-lg border border-vscode-border bg-vscode-bg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <h2 className="text-sm font-semibold text-vscode-fg">
              Permission Request
            </h2>
            {pendingCount > 1 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-vscode-badge-bg text-vscode-badge-fg">
                +{pendingCount - 1} more
              </span>
            )}
          </div>
          {request.agentId && (
            <span className="text-xs px-2 py-0.5 rounded bg-vscode-badge-bg text-vscode-badge-fg">
              Agent: {request.agentId}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Tool name */}
          <div>
            <span className="text-xs uppercase tracking-wider text-vscode-fg/50">Tool</span>
            <p className="text-sm font-medium text-vscode-fg mt-0.5">{displayName}</p>
          </div>

          {/* Title / description */}
          {(request.title || request.description) && (
            <div>
              {request.title && (
                <p className="text-sm text-vscode-fg">{request.title}</p>
              )}
              {request.description && (
                <p className="text-xs text-vscode-fg/70 mt-1">{request.description}</p>
              )}
            </div>
          )}

          {/* Decision reason */}
          {request.decisionReason && (
            <div className="text-xs text-vscode-fg/60 italic">
              {request.decisionReason}
            </div>
          )}

          {/* Blocked path warning */}
          {request.blockedPath && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-yellow-500/10 border border-yellow-500/30">
              <span className="text-yellow-500 text-sm">&#9888;</span>
              <span className="text-xs text-yellow-400">
                Blocked path: <code className="font-mono">{request.blockedPath}</code>
              </span>
            </div>
          )}

          {/* Tool input */}
          <div>
            <span className="text-xs uppercase tracking-wider text-vscode-fg/50">Input</span>
            <pre className="mt-1 p-3 rounded bg-black/20 border border-vscode-border text-xs font-mono text-vscode-fg overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
              {formattedInput}
            </pre>
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-vscode-border">
          <button
            onClick={onDeny}
            className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg hover:bg-vscode-fg/10 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={onAlwaysAllow}
            className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg hover:bg-vscode-fg/10 transition-colors"
          >
            Always Allow
          </button>
          <button
            onClick={onAllow}
            className="px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover transition-colors font-medium"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify webview TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/PermissionDialog.tsx
git commit -m "feat(permissions): add PermissionDialog webview component"
```

---

## Task 5: PermissionModeIndicator Component

**Files:**
- Create: `webview/src/components/input/PermissionModeIndicator.tsx`

This component sits in the `ContextFooter` area of the input toolbar. It shows the current permission mode as a badge. Clicking it opens a dropdown to switch modes.

- [ ] **Step 1: Create webview/src/components/input/PermissionModeIndicator.tsx**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import type { PermissionMode } from '../../hooks/usePermissions';

interface PermissionModeIndicatorProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
}

/** Human-readable labels for each permission mode */
const MODE_LABELS: Record<PermissionMode, string> = {
  default: 'Default',
  plan: 'Plan',
  acceptEdits: 'Accept Edits',
  bypassPermissions: 'Bypass',
  dontAsk: "Don't Ask",
};

/** Short descriptions for the dropdown */
const MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
  default: 'Prompts for dangerous operations',
  plan: 'Planning mode, no tool execution',
  acceptEdits: 'Auto-accept file edits',
  bypassPermissions: 'Bypass all permission checks',
  dontAsk: "Deny if not pre-approved",
};

/** Color indicator for each mode */
const MODE_COLORS: Record<PermissionMode, string> = {
  default: 'bg-blue-500',
  plan: 'bg-purple-500',
  acceptEdits: 'bg-green-500',
  bypassPermissions: 'bg-red-500',
  dontAsk: 'bg-gray-500',
};

/** Shield icon SVG */
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/**
 * PermissionModeIndicator — footer badge showing current mode with dropdown picker.
 *
 * Visual design matches the ModeSelector button in Claude Code's input toolbar:
 * - Small badge with shield icon and mode label
 * - Click opens a dropdown with all modes
 * - Active mode highlighted
 * - Bypass mode shows warning color
 */
export function PermissionModeIndicator({ mode, onModeChange }: PermissionModeIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleSelect = (selectedMode: PermissionMode) => {
    onModeChange(selectedMode);
    setIsOpen(false);
  };

  const modes: PermissionMode[] = ['default', 'plan', 'acceptEdits', 'bypassPermissions', 'dontAsk'];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Badge button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-vscode-fg/70 hover:text-vscode-fg hover:bg-vscode-fg/5 transition-colors"
        title={`Permission mode: ${MODE_LABELS[mode]}`}
      >
        <ShieldIcon className="w-3 h-3" />
        <div className={`w-1.5 h-1.5 rounded-full ${MODE_COLORS[mode]}`} />
        <span>{MODE_LABELS[mode]}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-vscode-border bg-vscode-bg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-vscode-border">
            <span className="text-xs font-semibold text-vscode-fg/50 uppercase tracking-wider">
              Permission Mode
            </span>
          </div>
          <div className="py-1">
            {modes.map((m) => (
              <button
                key={m}
                onClick={() => handleSelect(m)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  m === mode
                    ? 'bg-vscode-button-bg/20 text-vscode-fg'
                    : 'text-vscode-fg/70 hover:bg-vscode-fg/5 hover:text-vscode-fg'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${MODE_COLORS[m]}`} />
                  <span className="font-medium">{MODE_LABELS[m]}</span>
                  {m === mode && (
                    <span className="ml-auto text-vscode-fg/40">&#10003;</span>
                  )}
                </div>
                <p className="text-vscode-fg/50 mt-0.5 ml-4">{MODE_DESCRIPTIONS[m]}</p>
                {m === 'bypassPermissions' && (
                  <p className="text-red-400/70 mt-0.5 ml-4 text-[10px]">
                    Requires allowDangerouslySkipPermissions setting
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify webview TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/input/PermissionModeIndicator.tsx
git commit -m "feat(permissions): add PermissionModeIndicator footer component with mode picker"
```

---

## Task 6: PlanViewer Component

**Files:**
- Create: `webview/src/components/dialogs/PlanViewer.tsx`

When the permission mode is `plan`, the CLI sends a plan document instead of executing tools. The plan arrives as markdown content within the assistant message. The `PlanViewer` renders it in a rich view with Accept/Request Changes buttons. (The full inline comment system is Story 19 — here we build the base viewer.)

- [ ] **Step 1: Create webview/src/components/dialogs/PlanViewer.tsx**

```tsx
import React, { useState } from 'react';

interface PlanViewerProps {
  /** Markdown content of the plan */
  content: string;
  /** Called when user accepts the plan */
  onAccept: () => void;
  /** Called when user requests revision with feedback */
  onRequestRevision: (feedback: string) => void;
  /** Whether the plan is still being streamed */
  isStreaming?: boolean;
}

/**
 * PlanViewer — renders a plan document from the CLI in plan mode.
 *
 * This is the base plan viewer. The full inline comment system (text selection,
 * anchored comments, numbered indicators) is Story 19.
 *
 * For now, this renders the plan as formatted markdown with:
 * - Accept button (sends user message to proceed)
 * - Request Revision textarea + button
 * - Visual indicator that this is a plan, not executed code
 */
export function PlanViewer({
  content,
  onAccept,
  onRequestRevision,
  isStreaming = false,
}: PlanViewerProps) {
  const [isRevising, setIsRevising] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleRequestRevision = () => {
    if (feedback.trim()) {
      onRequestRevision(feedback.trim());
      setFeedback('');
      setIsRevising(false);
    }
  };

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      {/* Plan header */}
      <div className="flex items-center justify-between px-4 py-2 bg-purple-500/10 border-b border-purple-500/20">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
            Plan
          </span>
          {isStreaming && (
            <span className="text-xs text-purple-400/60 animate-pulse">
              Generating...
            </span>
          )}
        </div>
      </div>

      {/* Plan content — rendered as preformatted text for now.
          Story 16 (Content Block Renderers) will add proper markdown rendering.
          Story 19 will add inline comments. */}
      <div className="px-4 py-3 max-h-[50vh] overflow-y-auto">
        <pre className="text-sm text-vscode-fg whitespace-pre-wrap font-mono leading-relaxed">
          {content}
        </pre>
      </div>

      {/* Action bar */}
      {!isStreaming && (
        <div className="px-4 py-3 border-t border-purple-500/20 space-y-2">
          {!isRevising ? (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsRevising(true)}
                className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg hover:bg-vscode-fg/10 transition-colors"
              >
                Request Revision
              </button>
              <button
                onClick={onAccept}
                className="px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover transition-colors font-medium"
              >
                Accept Plan
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what you'd like changed..."
                className="w-full px-3 py-2 text-xs rounded border border-vscode-input-border bg-vscode-input-bg text-vscode-input-fg resize-none focus:outline-none focus:border-vscode-link"
                rows={3}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setIsRevising(false);
                    setFeedback('');
                  }}
                  className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg hover:bg-vscode-fg/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestRevision}
                  disabled={!feedback.trim()}
                  className="px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Feedback
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify webview TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/PlanViewer.tsx
git commit -m "feat(permissions): add PlanViewer component for plan mode rendering"
```

---

## Task 7: Wire PermissionHandler into Extension Host

**Files:**
- Modify: `src/extension.ts`

This task wires the `PermissionHandler` into the extension lifecycle:
1. Creates a `PermissionHandler` instance on activation
2. Registers it to handle `can_use_tool` and `control_cancel_request` from the ControlRouter
3. Connects it to WebviewBridges as they are created
4. Reads `initialPermissionMode` from VS Code settings and passes it to CLI on spawn
5. Updates the mode when CLI sends `system.init` or `system.status` with `permissionMode`

- [ ] **Step 1: Update src/extension.ts to create and wire PermissionHandler**

Add to the `activate` function, after the existing WebviewProvider and Bridge setup:

```typescript
import { PermissionHandler } from './permissions/permissionHandler';

// Inside activate():

// Create permission handler
const permissionHandler = new PermissionHandler();
context.subscriptions.push(permissionHandler);

// Read initial permission mode from settings
const config = vscode.workspace.getConfiguration('openclaudeCode');
const initialMode = config.get<string>('initialPermissionMode', 'default');
if (initialMode && ['default', 'plan', 'acceptEdits', 'bypassPermissions', 'dontAsk'].includes(initialMode)) {
  permissionHandler.setPermissionMode(initialMode as any);
}

// --- Hook into ControlRouter (Story 2 provides this) ---
// When ControlRouter receives a control_request with subtype 'can_use_tool':
//   controlRouter.on('can_use_tool', (req) => permissionHandler.handlePermissionRequest(req));
//
// When ControlRouter receives a control_cancel_request:
//   controlRouter.on('control_cancel_request', (req) => permissionHandler.handleCancelRequest(req));
//
// When ProcessManager spawns the CLI and provides a stdin writer:
//   processManager.on('stdin_ready', (writer) => permissionHandler.setStdinWriter(writer));
//   processManager.on('exit', () => permissionHandler.clearStdinWriter());

// --- Hook into WebviewBridge (Story 3 provides this) ---
// When a new WebviewBridge is created:
//   const bridgeDisposable = permissionHandler.registerBridge(bridge);
//   context.subscriptions.push(bridgeDisposable);

// --- Hook into init/status messages from CLI ---
// When CLI sends system.init message:
//   if (initMsg.permissionMode) permissionHandler.setPermissionMode(initMsg.permissionMode);
// When CLI sends system.status message:
//   if (statusMsg.permissionMode) permissionHandler.setPermissionMode(statusMsg.permissionMode);
```

The above comments show the integration points. The actual wiring depends on how the ControlRouter and ProcessManager are structured from Stories 2/3. The pattern is:

```typescript
// Example full wiring (actual code after Story 2/3 are implemented):

// ControlRouter integration
controlRouter.registerHandler('can_use_tool', (controlRequest) => {
  permissionHandler.handlePermissionRequest(controlRequest);
});

controlRouter.registerCancelHandler((cancelRequest) => {
  permissionHandler.handleCancelRequest(cancelRequest);
});

// ProcessManager integration
processManager.onStdinReady((writer) => {
  permissionHandler.setStdinWriter(writer);
});

processManager.onExit(() => {
  permissionHandler.clearStdinWriter();
});

// WebviewBridge integration (for each bridge created)
function onBridgeCreated(bridge: WebviewBridge) {
  const sub = permissionHandler.registerBridge(bridge);
  context.subscriptions.push(sub);
}

// CLI message integration (in the NDJSON message handler)
function handleCliMessage(msg: StdoutMessage) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    if (msg.permissionMode) {
      permissionHandler.setPermissionMode(msg.permissionMode);
    }
  }
  if (msg.type === 'system' && msg.subtype === 'status') {
    if (msg.permissionMode) {
      permissionHandler.setPermissionMode(msg.permissionMode);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat(permissions): wire PermissionHandler into extension lifecycle"
```

---

## Task 8: Wire Permission Components into Webview App

**Files:**
- Modify: `webview/src/App.tsx`

This task integrates the permission components into the webview's React tree:
1. Uses `usePermissions` hook to manage state
2. Renders `PermissionDialog` when there is a pending request
3. Renders `PermissionModeIndicator` in the footer area
4. Passes initial permission mode from `init_state`

- [ ] **Step 1: Update webview/src/App.tsx to include permission components**

Add the permission system to the existing App component:

```tsx
import { useState, useEffect } from 'react';
import { vscode } from './vscode';
import { usePermissions } from './hooks/usePermissions';
import { PermissionDialog } from './components/dialogs/PermissionDialog';
import { PermissionModeIndicator } from './components/input/PermissionModeIndicator';

function App() {
  const [initState, setInitState] = useState<{
    permissionMode?: string;
  } | null>(null);

  // Listen for init_state to get initial permission mode
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'init_state') {
        setInitState(event.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const {
    currentRequest,
    pendingCount,
    permissionMode,
    allow,
    deny,
    alwaysAllow,
    setPermissionMode,
  } = usePermissions(initState?.permissionMode as any);

  return (
    <div className="flex flex-col h-screen bg-vscode-bg text-vscode-fg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border">
        <h1 className="text-sm font-semibold">OpenClaude</h1>
        <span className="text-xs opacity-50">v0.1.0</span>
      </div>

      {/* Message area (placeholder — Story 4 builds the real chat UI) */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center opacity-50">
          <p className="text-lg font-semibold mb-2">OpenClaude</p>
          <p className="text-sm">AI coding assistant powered by any LLM</p>
          <p className="text-xs mt-4">Extension shell ready. Chat UI coming in Story 4.</p>
        </div>
      </div>

      {/* Input area (placeholder) */}
      <div className="px-4 py-3 border-t border-vscode-border">
        <div className="flex items-center rounded border border-vscode-input-border bg-vscode-input-bg px-3 py-2">
          <input
            type="text"
            placeholder="Type a message... (not connected yet)"
            className="flex-1 bg-transparent text-vscode-input-fg outline-none text-sm"
            disabled
          />
        </div>
        {/* Context footer with permission mode indicator */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <div className="flex items-center gap-2">
            <PermissionModeIndicator
              mode={permissionMode}
              onModeChange={setPermissionMode}
            />
          </div>
          <span className="text-[10px] text-vscode-fg/30">
            {permissionMode === 'plan' ? 'Plan mode active' : ''}
          </span>
        </div>
      </div>

      {/* Permission dialog overlay */}
      {currentRequest && (
        <PermissionDialog
          request={currentRequest}
          pendingCount={pendingCount}
          onAllow={allow}
          onDeny={deny}
          onAlwaysAllow={alwaysAllow}
        />
      )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Build the webview**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx vite build`

Expected: Build succeeds

- [ ] **Step 3: Build the extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Both extension and webview build successfully

- [ ] **Step 4: Commit**

```bash
git add webview/src/App.tsx
git commit -m "feat(permissions): wire PermissionDialog and mode indicator into webview App"
```

---

## Task 9: Permission Mode CLI Flag Integration

**Files:**
- Modify: `src/permissions/permissionHandler.ts` (add getCliFlags method)

The permission mode must be passed to the CLI on spawn via `--permission-mode <mode>`. This task adds a helper that the ProcessManager (Story 2) calls when constructing spawn arguments.

- [ ] **Step 1: Add getCliFlags method to PermissionHandler**

Add this method to the `PermissionHandler` class:

```typescript
  /**
   * Get CLI spawn flags for the current permission mode.
   * Called by ProcessManager when constructing the spawn command.
   *
   * Returns an array of flags, e.g. ['--permission-mode', 'plan'].
   * Returns empty array for 'default' mode (CLI's own default).
   */
  getCliFlags(): string[] {
    if (this.currentMode === 'default') {
      return [];
    }
    return ['--permission-mode', this.currentMode];
  }

  /**
   * Get the initial permission mode from VS Code settings.
   * Static method — can be called before PermissionHandler is instantiated.
   */
  static getInitialModeFromSettings(): PermissionMode {
    const config = vscode.workspace.getConfiguration('openclaudeCode');
    const mode = config.get<string>('initialPermissionMode', 'default');

    const validModes: PermissionMode[] = [
      'default', 'plan', 'acceptEdits', 'bypassPermissions', 'dontAsk',
    ];

    if (validModes.includes(mode as PermissionMode)) {
      // Gate bypassPermissions behind the danger setting
      if (mode === 'bypassPermissions') {
        const allowBypass = config.get<boolean>('allowDangerouslySkipPermissions', false);
        if (!allowBypass) {
          return 'default';
        }
      }
      return mode as PermissionMode;
    }

    return 'default';
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/permissions/permissionHandler.ts
git commit -m "feat(permissions): add CLI flag generation and settings-based initial mode"
```

---

## Task 10: Auto Mode & Bypass Mode Handling

**Files:**
- Modify: `src/permissions/permissionHandler.ts` (already handled in Task 2)
- Verify: The bypass/auto logic is correct

This task verifies and documents the auto mode and bypass mode behavior that was implemented in Task 2's `handlePermissionRequest` method.

- [ ] **Step 1: Verify auto mode (bypassPermissions) behavior**

In `permissionHandler.ts`, the `handlePermissionRequest` method already includes:

```typescript
// In auto mode (bypassPermissions), immediately allow without showing dialog
if (this.currentMode === 'bypassPermissions') {
  this.sendPermissionResponse(requestId, {
    behavior: 'allow',
    toolUseID: request.tool_use_id,
    decisionClassification: 'user_temporary',
  });
  return;
}
```

This means:
- No dialog shown
- All tool_use requests auto-accepted
- Response sent immediately back to CLI

- [ ] **Step 2: Verify bypass mode gating**

In `handleSetPermissionMode`, bypass mode is gated:

```typescript
if (mode === 'bypassPermissions') {
  const config = vscode.workspace.getConfiguration('openclaudeCode');
  const allowBypass = config.get<boolean>('allowDangerouslySkipPermissions', false);
  if (!allowBypass) {
    vscode.window.showWarningMessage(
      'Bypass mode requires enabling "openclaudeCode.allowDangerouslySkipPermissions" in settings.',
    );
    return;
  }
}
```

And in `getInitialModeFromSettings`:

```typescript
if (mode === 'bypassPermissions') {
  const allowBypass = config.get<boolean>('allowDangerouslySkipPermissions', false);
  if (!allowBypass) {
    return 'default';
  }
}
```

This means:
- User cannot enter bypass mode unless `openclaudeCode.allowDangerouslySkipPermissions` is `true`
- If the setting is `false`, a warning is shown and mode stays unchanged
- If `initialPermissionMode` is set to `bypassPermissions` but the danger setting is off, falls back to `default`

- [ ] **Step 3: Verify dontAsk mode behavior**

In `handlePermissionRequest`:

```typescript
if (this.currentMode === 'dontAsk') {
  this.sendPermissionResponse(requestId, {
    behavior: 'deny',
    message: 'Permission denied: dontAsk mode is active',
    toolUseID: request.tool_use_id,
    decisionClassification: 'user_reject',
  });
  return;
}
```

This means: if CLI sends a permission request in dontAsk mode (meaning the tool was not pre-approved), it gets denied immediately without a dialog.

- [ ] **Step 4: Document the mode behavior matrix**

| Mode | Dialog shown? | Default behavior | CLI flag |
|---|---|---|---|
| `default` | Yes | Prompts for dangerous tools | `--permission-mode default` (or omitted) |
| `plan` | No (plan viewer instead) | No tool execution | `--permission-mode plan` |
| `acceptEdits` | Yes (for non-edit tools) | Auto-accept file edits | `--permission-mode acceptEdits` |
| `bypassPermissions` | No | All auto-allowed | `--permission-mode bypassPermissions` |
| `dontAsk` | No | Deny if not pre-approved | `--permission-mode dontAsk` |

Note: In `acceptEdits` mode, the CLI itself handles auto-accepting edits. It only sends `can_use_tool` to the extension for non-edit tools that still need approval. So the extension shows the dialog for those.

No code changes needed — this task is verification only.

- [ ] **Step 5: Commit (no-op, verification only)**

No commit needed for this task.

---

## Task 11: control_cancel_request Integration

**Files:**
- Verify: `src/permissions/permissionHandler.ts` (already implemented in Task 2)
- Verify: `webview/src/hooks/usePermissions.ts` (already handles `cancel_request`)

This task verifies the cancel flow works end-to-end.

- [ ] **Step 1: Verify extension host cancel handling**

In `permissionHandler.ts`, `handleCancelRequest` already:
1. Removes the request from `pendingRequests` map
2. Sends `cancel_request` postMessage to all bridges

```typescript
handleCancelRequest(cancelRequest: SDKControlCancelRequest): void {
  const requestId = cancelRequest.request_id;
  if (this.pendingRequests.has(requestId)) {
    this.pendingRequests.delete(requestId);
    const cancelMsg: CancelRequestMessage = { type: 'cancel_request', requestId };
    for (const bridge of this.bridges) {
      bridge.postMessage(cancelMsg);
    }
  }
}
```

- [ ] **Step 2: Verify webview cancel handling**

In `usePermissions.ts`, the message handler already processes `cancel_request`:

```typescript
case 'cancel_request':
  setRequests((prev) => prev.filter((r) => r.requestId !== msg.requestId));
  break;
```

This removes the canceled request from the queue, causing the `PermissionDialog` to:
- Dismiss if it was the active dialog (and show the next one if queued)
- Remove from queue silently if it wasn't the active dialog

- [ ] **Step 3: Verify CLI exit cleans up all pending requests**

In `permissionHandler.ts`, `clearStdinWriter` calls `rejectAllPending`:

```typescript
clearStdinWriter(): void {
  this.writeToStdin = null;
  this.rejectAllPending('CLI process exited');
}
```

And `rejectAllPending` sends `cancel_request` for each pending request:

```typescript
private rejectAllPending(reason: string): void {
  for (const [requestId, pending] of this.pendingRequests) {
    const cancelMsg: CancelRequestMessage = { type: 'cancel_request', requestId };
    for (const bridge of this.bridges) {
      bridge.postMessage(cancelMsg);
    }
  }
  this.pendingRequests.clear();
}
```

No code changes needed.

- [ ] **Step 4: Commit (no-op, verification only)**

No commit needed for this task.

---

## Task 12: End-to-End Verification

- [ ] **Step 1: Full build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build completes with no errors

- [ ] **Step 2: Verify all new files exist**

Run:
```bash
ls -la src/permissions/permissionHandler.ts \
       webview/src/hooks/usePermissions.ts \
       webview/src/components/dialogs/PermissionDialog.tsx \
       webview/src/components/dialogs/PlanViewer.tsx \
       webview/src/components/input/PermissionModeIndicator.tsx
```

Expected: All 5 files exist

- [ ] **Step 3: TypeScript compilation check (no emit)**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit`

Expected: No type errors

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 4: Package as .vsix**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx @vscode/vsce package --no-dependencies --allow-missing-repository`

Expected: Produces .vsix with no errors

- [ ] **Step 5: Manual verification in VS Code**

Install the extension and verify:
1. Open OpenClaude in sidebar — permission mode indicator visible in footer
2. Click the mode indicator — dropdown appears with 5 modes
3. Select "Plan" mode — indicator changes to purple "Plan"
4. Select "Bypass" mode without the danger setting — warning message appears
5. Enable `openclaudeCode.allowDangerouslySkipPermissions` — bypass mode works

Note: Full end-to-end permission dialog testing requires a running CLI (Stories 2+4), so the dialog will only be testable with a mock or after those stories land.

- [ ] **Step 6: Commit final verification**

```bash
git add -A
git commit -m "chore: Story 7 complete — permission system with dialog, mode indicator, plan viewer"
```

---

## Summary

| Task | What it does | Key files |
|---|---|---|
| 1 | Extend PostMessage types with rich permission data | `src/webview/types.ts` |
| 2 | PermissionHandler (extension host orchestrator) | `src/permissions/permissionHandler.ts` |
| 3 | usePermissions React hook (webview state) | `webview/src/hooks/usePermissions.ts` |
| 4 | PermissionDialog component (webview modal) | `webview/src/components/dialogs/PermissionDialog.tsx` |
| 5 | PermissionModeIndicator component (footer badge) | `webview/src/components/input/PermissionModeIndicator.tsx` |
| 6 | PlanViewer component (plan mode rendering) | `webview/src/components/dialogs/PlanViewer.tsx` |
| 7 | Wire PermissionHandler into extension host | `src/extension.ts` |
| 8 | Wire permission components into webview App | `webview/src/App.tsx` |
| 9 | CLI flag generation for permission mode | `src/permissions/permissionHandler.ts` |
| 10 | Verify auto/bypass/dontAsk mode behavior | (verification only) |
| 11 | Verify control_cancel_request handling | (verification only) |
| 12 | End-to-end build + package + manual test | `.vsix` output |

### Data Flow Summary

```
CLI (stdout)                    Extension Host                     Webview
─────────────────────────────────────────────────────────────────────────────

control_request                 PermissionHandler                  PermissionDialog
  subtype: can_use_tool  ──→    handlePermissionRequest()  ──→    usePermissions hook
  tool_name, input, ...         checks mode (auto→allow)           renders modal
                                stores in pendingRequests
                                postMessage(permission_request)

                                                                   User clicks
                                                                   Allow/Deny/Always Allow
                                                                       │
control_response         ←──    handlePermissionResponse() ←──    postMessage(permission_response)
  behavior: allow/deny          builds PermissionResult             behavior, updatedPermissions,
  updatedPermissions            writes to CLI stdin                  decisionClassification

control_cancel_request   ──→    handleCancelRequest()      ──→    cancel_request message
  request_id                    removes from pending               filters from queue

User clicks mode badge                                             PermissionModeIndicator
                                                                   onModeChange(mode)
                                                                       │
control_request          ←──    handleSetPermissionMode()  ←──    postMessage(set_permission_mode)
  subtype: set_permission_mode  gates bypass behind setting
  mode: ...                     writes to CLI stdin
                                notifies all bridges

system.init/status       ──→    setPermissionMode()        ──→    permission_mode_changed
  permissionMode                updates currentMode                updates hook state
```
