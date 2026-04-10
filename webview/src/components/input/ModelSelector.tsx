import { useState, useRef, useEffect } from 'react';
import { vscode } from '../../vscode';

interface ModelSelectorProps {
  currentModel: string | null;
  availableModels: Array<{ value: string; displayName: string }>;
  favoriteModels?: string[];
  onModelSelect?: (model: string) => void;
}

export function ModelSelector({ currentModel, availableModels, favoriteModels = [], onModelSelect }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) setSearchQuery('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const displayName = availableModels.find((m) => m.value === currentModel)?.displayName || currentModel || 'Model';
  const shortName = displayName.length > 20 ? displayName.slice(0, 18) + '…' : displayName;

  const displayedModels = searchQuery.trim() === ''
    ? availableModels.slice().sort((a, b) => {
        const aFav = favoriteModels.includes(a.value);
        const bFav = favoriteModels.includes(b.value);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return 0;
      })
    : availableModels.filter(m => 
        m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.value.toLowerCase().includes(searchQuery.toLowerCase())
      );

  if (availableModels.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={`Model: ${displayName}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', fontSize: 11,
          background: 'transparent',
          border: '1px solid var(--app-input-border)',
          borderRadius: 'var(--corner-radius-small)',
          color: 'var(--app-secondary-foreground)',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM7 5v4.5l.5.5H11v-1H8V5H7z"/>
        </svg>
        <span>{shortName}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        </svg>
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
          minWidth: 200, maxHeight: 300, overflowY: 'auto',
          background: 'var(--app-menu-background)',
          border: '1px solid var(--app-input-border)',
          borderRadius: 'var(--corner-radius-medium)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 50,
        }}>
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--app-secondary-foreground)', borderBottom: '1px solid var(--app-input-border)' }}>
            Select Model
          </div>
          <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--app-input-border)' }}>
            <input
              type="text"
              autoFocus
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '4px 8px',
                fontSize: 11,
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: 'var(--corner-radius-small)',
                outline: 'none',
              }}
            />
          </div>
          {displayedModels.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--app-secondary-foreground)' }}>
              No models found.
            </div>
          )}
          {displayedModels.map((m) => {
            const isFav = favoriteModels.includes(m.value);
            return (
            <div
              key={m.value}
              style={{
                display: 'flex', width: '100%', alignItems: 'center',
                background: m.value === currentModel ? 'var(--app-list-active-background)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (m.value !== currentModel) (e.currentTarget as HTMLDivElement).style.background = 'var(--app-list-hover-background)';
              }}
              onMouseLeave={(e) => {
                if (m.value !== currentModel) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <button
                onClick={() => {
                  vscode.postMessage({ type: 'set_model', model: m.value });
                  if (onModelSelect) onModelSelect(m.value);
                  setIsOpen(false);
                }}
                style={{
                  flex: 1, textAlign: 'left',
                  padding: '8px 12px', fontSize: 12,
                  background: 'transparent',
                  color: m.value === currentModel ? 'var(--app-list-active-foreground)' : 'var(--app-primary-foreground)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {m.displayName}
                {m.value === currentModel && <span style={{ marginLeft: 8, opacity: 0.5 }}>✓</span>}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  vscode.postMessage({ type: 'toggle_favorite_model', model: m.value });
                }}
                title={isFav ? "Unfavorite model" : "Favorite model"}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '8px 12px', color: isFav ? 'var(--vscode-charts-yellow)' : 'var(--app-secondary-foreground)',
                  opacity: isFav ? 1 : 0.3,
                  fontSize: 14,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                onMouseLeave={(e) => { if (!isFav) (e.currentTarget as HTMLButtonElement).style.opacity = '0.3'; }}
              >
                {isFav ? '★' : '☆'}
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
