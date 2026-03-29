import React, { useState } from 'react';
import { X, Plus, Tag, User } from 'lucide-react';
import { Entity } from '../types';
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { useLabels } from '../lib/labels';

interface EntitySnapshotProps {
  entity: Entity;
  type?: 'entity';
  onClose: () => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  /** Applied ledger net only (increases − decreases), excluding `starting_total`. Must match `entity_balances.net − entity.starting_total`. */
  activityNet?: number;
  variant?: 'modal' | 'sidebar';
}

export default function EntitySnapshot({ entity, type = 'entity', onClose, onUpdateTags, activityNet, variant = 'modal' }: EntitySnapshotProps) {
  const [newTag, setNewTag] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const { tx } = useLabels();

  const tags = entity.tags || [];

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    
    const updatedTags = [...tags, newTag.trim()];
    onUpdateTags(entity.id, updatedTags);
    setNewTag('');
    setIsAddingTag(false);
  };

  const removeTag = (tagToRemove: string) => {
    const updatedTags = tags.filter(t => t !== tagToRemove);
    onUpdateTags(entity.id, updatedTags);
  };


  const Content = (
    <div className={cn(
      "bg-white dark:bg-stone-900 overflow-hidden flex flex-col h-full",
      variant === 'modal' ? "w-full max-w-md rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 animate-in zoom-in-95 duration-200" : "w-full h-full"
    )}>
      
      {/* Header */}
      <div className="relative h-24 bg-stone-900 dark:bg-stone-800 flex items-center justify-center shrink-0">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
        
        <div className="absolute -bottom-10 w-20 h-20 rounded-full bg-white dark:bg-stone-900 border-4 border-white dark:border-stone-900 flex items-center justify-center shadow-lg">
          <User size={32} className="text-stone-400" />
        </div>
      </div>

      <div className="pt-12 pb-6 px-6 text-center flex-1 overflow-y-auto">
        <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">{entity.name}</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 capitalize flex items-center justify-center gap-1 mt-1">
          <User size={12} className="mr-1" />
          Entity
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <>
            <div className="bg-stone-50 dark:bg-stone-800 p-3 rounded-xl border border-stone-200 dark:border-stone-700">
              <p className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Genesis</p>
              <p className="text-sm font-mono font-medium text-stone-900 dark:text-stone-100">
                {formatValue(entity.starting_total || 0)}
              </p>
            </div>
            <div className="bg-stone-50 dark:bg-stone-800 p-3 rounded-xl border border-stone-200 dark:border-stone-700">
              <p className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Ledger Net</p>
              <p className={`text-sm font-mono font-medium ${activityNet! >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {activityNet! >= 0 ? '+' : ''}{formatValue(activityNet || 0)}
              </p>
            </div>
            {activityNet !== undefined && (
              <div className="col-span-2 bg-stone-900 dark:bg-stone-100 p-4 rounded-xl shadow-inner mt-2">
                <p className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1 font-bold">Total Economic Balance</p>
                <div className="flex items-center justify-center gap-2">
                    <span className={`text-2xl font-mono font-black ${(entity.starting_total || 0) + activityNet >= 0 ? 'text-emerald-400 dark:text-emerald-600' : 'text-rose-400 dark:text-rose-600'}`}>
                      {formatValue((entity.starting_total || 0) + activityNet)}
                    </span>
                </div>
              </div>
            )}
          </>
        </div>

        {/* Tags Section */}
        <div className="mt-6 text-left">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Tag size={14} />
              Tags
            </h3>
            {!isAddingTag && (
              <button 
                onClick={() => setIsAddingTag(true)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
              >
                <Plus size={12} />
                Add Tag
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 min-h-[40px]">
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded text-xs font-medium group">
                {tag}
                <button 
                  onClick={() => removeTag(tag)}
                  className="text-stone-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {tags.length === 0 && !isAddingTag && (
              <p className="text-xs text-stone-400 italic">No tags added.</p>
            )}
          </div>

          {isAddingTag && (
            <div className="mt-3 bg-stone-50 dark:bg-stone-800 p-3 rounded-lg animate-in fade-in slide-in-from-top-2">
              <form onSubmit={handleAddTag} className="flex gap-2 mb-2">
                <input
                  type="text"
                  className="flex-1 px-2 py-1 text-sm border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Enter tag..."
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  autoFocus
                />
                <button 
                  type="submit"
                  className="px-3 py-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded text-xs font-medium"
                >
                  Add
                </button>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  );

  if (variant === 'sidebar') {
    return Content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      {Content}
    </div>
  );
}
