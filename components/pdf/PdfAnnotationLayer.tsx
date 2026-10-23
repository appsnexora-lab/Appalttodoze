'use client';

import React from 'react';
import { Bookmark } from 'lucide-react';

interface PdfAnnotationLayerProps {
  pageNumber: number;
  isBookmarked?: boolean;
  onToggleBookmark?: (pageNumber: number) => void;
}

export const PdfAnnotationLayer: React.FC<PdfAnnotationLayerProps> = ({
  pageNumber,
  isBookmarked,
  onToggleBookmark,
}) => {
  return (
    <div className="absolute top-2 right-2 z-10 pointer-events-auto">
      {onToggleBookmark && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(pageNumber);
          }}
          title={isBookmarked ? 'Remover Marcador' : 'Adicionar Marcador'}
          className={`p-1.5 rounded-lg backdrop-blur-md transition-all cursor-pointer ${
            isBookmarked
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
              : 'bg-slate-950/40 text-slate-400 hover:text-amber-300 hover:bg-slate-900/80 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Bookmark className="w-4 h-4 fill-current" />
        </button>
      )}
    </div>
  );
};
