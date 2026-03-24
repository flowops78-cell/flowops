import React, { useState } from 'react';
import { X, Plus, Tag, User, Circle, Clock, Award, Activity } from 'lucide-react';
import { Entity, Member } from '../types';
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { useLabels } from '../lib/labels';

interface EntitySnapshotProps {
  entity: Entity | Member;
  type: 'entity' | 'member';
  onClose: () => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  // Optional context data
  workspaceNet?: number;
  currentMemberActivity?: any;
  variant?: 'modal' | 'sidebar';
}

export default function EntitySnapshot({ entity, type, onClose, onUpdateTags, workspaceNet, currentMemberActivity, variant = 'modal' }: EntitySnapshotProps) {
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
          {type === 'entity' ? <User size={12} /> : <Activity size={12} />}
          {type === 'entity' ? 'Participant' : (entity as Member).role}
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          {type === 'entity' ? (
            <>
              <div className="bg-stone-50 dark:bg-stone-800 p-3 rounded-xl">
                <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Total Net</p>
                <p className={`text-lg font-mono font-medium ${(entity as Entity).total_net && (entity as Entity).total_net! > 0 ? 'text-emerald-600' : 'text-stone-900 dark:text-stone-100'}`}>
                  {formatValue((entity as Entity).total_net || 0)}
                </p>
              </div>
              <div className="bg-stone-50 dark:bg-stone-800 p-3 rounded-xl">
                <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Last Active</p>
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 mt-1">
                  {(entity as Entity).last_active_at ? formatDate((entity as Entity).last_active_at!) : 'Never'}
                </p>
              </div>
              {workspaceNet !== undefined && (
                <div className="col-span-2 bg-stone-50 dark:bg-stone-800 p-3 rounded-xl border border-stone-200 dark:border-stone-700">
                  <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Current Activity</p>
                  <div className="flex items-center justify-center gap-2">
                      <span className={`text-xl font-mono font-bold ${workspaceNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {workspaceNet >= 0 ? '+' : ''}{formatValue(workspaceNet)}
                      </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bg-stone-50 dark:bg-stone-800 p-3 rounded-xl">
                <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Status</p>
                <p className={`text-sm font-medium mt-1 capitalize ${(entity as Member).status === 'active' ? 'text-emerald-600' : 'text-stone-500'}`}>
                  {(entity as Member).status}
                </p>
              </div>
            </>
          )}
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

        {/* Contact Info */}
        {type === 'member' && (entity as Member).member_id && (
          <div className="mt-6 pt-6 border-t border-stone-100 dark:border-stone-800 text-left">
            <h3 className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">Team Member Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500 dark:text-stone-400">Handle / ID</span>
                <span className="text-stone-900 dark:text-stone-100 font-mono">{(entity as Member).member_id}</span>
              </div>
            </div>
          </div>
        )}
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
