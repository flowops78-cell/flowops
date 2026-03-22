import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ContextPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export default function ContextPanel({ isOpen, onClose, children, title }: ContextPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle click outside for mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node) && isOpen) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for mobile */}
      <div 
        className="fixed inset-0 h-[100dvh] bg-black/20 backdrop-blur-sm z-[60] sm:hidden animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div 
        ref={panelRef}
        className="fixed top-0 bottom-0 right-0 h-[100dvh] max-h-[100dvh] w-[92vw] max-w-[420px] sm:w-96 bg-white dark:bg-stone-900 shadow-2xl border-l border-stone-200 dark:border-stone-800 transform transition-transform duration-300 ease-in-out z-[70] flex flex-col animate-in slide-in-from-right"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </>
  );
}
