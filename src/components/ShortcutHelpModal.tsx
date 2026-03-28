import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useLabels } from '../lib/labels';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string;
  action: string;
}

const shortcutGroups: Array<{ title: string; items: ShortcutItem[] }> = [
  {
    title: 'Global',
    items: [
      { keys: '?', action: 'Open shortcuts help' },
      { keys: 'Esc', action: 'Close shortcuts help or cancel key chord' },
      { keys: 'Arrow Up', action: 'Scroll to top of current page' },
      { keys: 'Shift + F', action: 'Toggle focus fullscreen mode' },
    ],
  },
  {
    title: 'Global Navigation (single letter, not in a text field)',
    items: [
      { keys: 'B', action: 'Overview (Dashboard for admin; Activities home for operator/viewer)' },
      { keys: 'A', action: 'Activities' },
      { keys: 'P', action: 'Entities (admin); operators stay on Activities' },
      { keys: 'C', action: 'Network (admin)' },
      { keys: 'V', action: 'Channels (admin)' },
      { keys: 'T', action: 'Team' },
      { keys: 'S', action: 'Settings (admin)' },
    ],
  },
  {
    title: 'Global Create (N then …)',
    items: [
      { keys: 'N then A', action: 'Create activity' },
      { keys: 'N then E', action: 'Add entry on current activity' },
      { keys: 'N then V', action: 'Add reserve account (Channels, admin)' },
      { keys: 'N then P', action: 'Add entity (admin)' },
    ],
  },
  {
    title: 'Activity Page',
    items: [
      { keys: 'U', action: 'Add entity' },
      { keys: 'E', action: 'Add entry' },
      { keys: 'Shift + Enter', action: 'Complete activity' },
      { keys: 'M', action: 'Toggle activity monitor' },
    ],
  },
  {
    title: 'Team Page',
    items: [
      { keys: 'Delete', action: 'Remove selected team member' },
      { keys: 'L', action: 'View team log' },
    ],
  },
  {
    title: 'Channels Page',
    items: [
      { keys: 'I', action: 'Record inflow' },
      { keys: 'O', action: 'Record outflow' },
      { keys: 'A', action: 'Add account' },
      { keys: 'F', action: 'Toggle filters' },
    ],
  },
  {
    title: 'Section Navigation',
    items: [
      { keys: 'Arrow Right', action: 'Move to next section tab' },
      { keys: 'Arrow Left', action: 'Move to previous section tab' },
    ],
  },
];

export default function ShortcutHelpModal({ isOpen, onClose }: ShortcutHelpModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { tx } = useLabels();

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return shortcutGroups;

    return shortcutGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.keys.toLowerCase().includes(query) || item.action.toLowerCase().includes(query)
        ),
      }))
      .filter(group => group.items.length > 0);
  }, [searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="section-card w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Keyboard Shortcuts</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">Use search to quickly find shortcuts by key or action.</p>
          </div>
          <button
            onClick={onClose}
            className="icon-btn text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Close shortcuts help"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-stone-200 dark:border-stone-800">
          <input
            type="text"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Search shortcuts..."
            className="control-input"
            autoFocus
          />
        </div>

        <div className="overflow-y-auto p-4 space-y-5 max-h-[calc(85vh-9.5rem)]">
          {filteredGroups.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">No shortcuts match your search.</p>
          ) : (
            filteredGroups.map(group => (
              <section key={group.title} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{group.title}</h4>
                <div className="rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                  {group.items.map(item => (
                    <div key={`${group.title}-${item.keys}-${item.action}`} className="px-3 py-2.5 flex items-center justify-between gap-4 border-b border-stone-100 dark:border-stone-800 last:border-b-0">
                      <span className="text-sm text-stone-700 dark:text-stone-300">{tx(item.action)}</span>
                      <span className="text-xs font-mono px-2 py-1 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 whitespace-nowrap">
                        {item.keys}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
