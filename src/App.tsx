'use client';

import React, { useState, useEffect } from 'react';
import { TopBar, BottomNav, ActiveTab } from '@/components/Navbar';
import { HomeView } from '@/components/HomeView';
import { BibleView } from '@/components/BibleView';
import { DevotionalView } from '@/components/DevotionalView';
import { LibraryView } from '@/components/LibraryView';
import { ProfileView } from '@/components/ProfileView';
import { ReaderModal } from '@/components/ReaderModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cleanLegacyAlmeidaBibles, saveBibleReading } from '@/lib/bibleService';
import { saveDevotionalReading } from '@/lib/devotionalService';
import { ContentType, DevotionalDay, Book } from '@/types';

interface ReaderState {
  isOpen: boolean;
  contentType: ContentType;
  contentId: string;
  title: string;
  subtitle?: string;
  bookName?: string;
  chapterNumber?: number;
  initialChapterOrDay?: number;
  targetChapterQuery?: string;
  targetBookName?: string;
  targetChapterNumber?: number;
  bibleBooks?: any[];
  devotionalDays?: DevotionalDay[];
  bookData?: Book;
  isReadAlready?: boolean;
  period?: 'morning' | 'afternoon' | 'night' | string;
}

export default function App() {
  // Always start on the initial menu tab ('home') whenever the app boots or reloads
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');

  const [libraryFilterParam, setLibraryFilterParam] = useState<string | undefined>();
  const [isOffline, setIsOffline] = useState<boolean>(false);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [readerState, setReaderState] = useState<ReaderState>({
    isOpen: false,
    contentType: 'bible',
    contentId: '',
    title: '',
  });

  // Offline detection & clean legacy default data & ensure home tab start
  useEffect(() => {
    try {
      localStorage.removeItem('altto_active_tab');
    } catch {}

    const updateOnlineStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    cleanLegacyAlmeidaBibles().catch(() => {});

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const handleOpenReader = (params: any) => {
    setReaderState({
      isOpen: true,
      contentType: params.contentType,
      contentId: params.contentId,
      title: params.title,
      subtitle: params.subtitle,
      bookName: params.bookName || 'Gênesis',
      chapterNumber: params.chapterNumber || params.initialChapterOrDay || 1,
      initialChapterOrDay: params.initialChapterOrDay || params.chapterNumber || 1,
      targetChapterQuery: params.targetChapterQuery,
      targetBookName: params.targetBookName || params.bookName,
      targetChapterNumber: params.targetChapterNumber || params.chapterNumber,
      bibleBooks: params.bibleBooks,
      devotionalDays: params.devotionalDays,
      bookData: params.bookData,
      isReadAlready: params.isReadAlready || false,
      period: params.period,
    });
  };

  const handleMarkAsReadFromReader = async (details: {
    bookName?: string;
    chapterNumber?: number;
    dayNumber?: number;
  }) => {
    if (readerState.contentType === 'bible' || readerState.period) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
      const hour = now.getHours();
      const fallbackPeriod = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'night';
      const actualPeriod = (readerState.period as 'morning' | 'afternoon' | 'night') || fallbackPeriod;

      await saveBibleReading({
        id: `reading-${selectedDateStr}-${actualPeriod}-${Date.now()}`,
        bibleId: readerState.contentId,
        bookName: details.bookName || readerState.bookName || 'Gênesis',
        chapterNumber: details.chapterNumber || readerState.chapterNumber || 1,
        period: actualPeriod,
        date: selectedDateStr,
        time: timeStr,
        userId: 'local-user',
        status: 'completed',
        completedAt: now.toISOString(),
      });

      try {
        const statusKey = `altto_bible_status_${selectedDateStr}`;
        const saved = localStorage.getItem(statusKey);
        let statusObj = { morning: false, afternoon: false, night: false };
        if (saved) {
          try {
            statusObj = JSON.parse(saved);
          } catch {}
        }
        statusObj[actualPeriod] = true;
        localStorage.setItem(statusKey, JSON.stringify(statusObj));
        window.dispatchEvent(new Event('altto_bible_status_updated'));
      } catch (err) {
        console.warn('Status sync error:', err);
      }
      setReaderState((prev) => ({ ...prev, isReadAlready: true }));
    } else if (readerState.contentType === 'devotional') {
      const day = details.dayNumber || readerState.initialChapterOrDay || 1;
      await saveDevotionalReading({
        id: `dev-read-${readerState.contentId}-day-${day}`,
        devotionalId: readerState.contentId,
        dayNumber: day,
        date: selectedDateStr,
        status: 'completed',
        completedAt: new Date().toISOString(),
        userId: 'local-user',
      });
      setReaderState((prev) => ({ ...prev, isReadAlready: true }));
    }
  };

  const handleTabChange = (tab: ActiveTab, filterParam?: string) => {
    setActiveTab(tab);
    if (filterParam) {
      setLibraryFilterParam(filterParam);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9FD] text-[#29243A] selection:bg-[#E8DFFC] selection:text-[#29243A] font-sans antialiased pb-20 md:pb-6">
      {/* Top Bar */}
      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isOffline={isOffline}
      />

      {/* Main Views */}
      <ErrorBoundary fallbackTitle="Erro ao carregar visualização" onReset={() => handleTabChange('library')}>
        <main className="flex-1 w-full animate-in fade-in duration-200">
          {activeTab === 'home' && (
            <HomeView
              onNavigateTab={handleTabChange}
              onOpenReader={handleOpenReader}
              selectedDateStr={selectedDateStr}
              onDateChange={setSelectedDateStr}
            />
          )}

          {activeTab === 'bible' && (
            <BibleView
              onOpenReader={handleOpenReader}
              selectedDateStr={selectedDateStr}
              onDateChange={setSelectedDateStr}
            />
          )}

          {activeTab === 'devotional' && (
            <DevotionalView
              onOpenReader={handleOpenReader}
              selectedDateStr={selectedDateStr}
              onDateChange={setSelectedDateStr}
            />
          )}

          {activeTab === 'library' && (
            <LibraryView
              onOpenReader={handleOpenReader}
              initialFilter={libraryFilterParam}
            />
          )}

          {activeTab === 'profile' && <ProfileView />}
        </main>
      </ErrorBoundary>

      {/* Central Shared Professional Reader Modal protected by ErrorBoundary */}
      {readerState.isOpen && (
        <ErrorBoundary
          fallbackTitle="Erro ao abrir o leitor"
          onReset={() => setReaderState((prev) => ({ ...prev, isOpen: false }))}
        >
          <ReaderModal
            contentType={readerState.contentType}
            contentId={readerState.contentId}
            title={readerState.title}
            subtitle={readerState.subtitle}
            initialChapterOrDay={readerState.initialChapterOrDay}
            initialBookName={readerState.bookName}
            targetChapterQuery={readerState.targetChapterQuery}
            targetBookName={readerState.targetBookName || readerState.bookName}
            targetChapterNumber={readerState.targetChapterNumber || readerState.chapterNumber}
            bibleBooks={readerState.bibleBooks}
            devotionalDays={readerState.devotionalDays}
            bookData={readerState.bookData}
            period={readerState.period}
            onClose={() => setReaderState((prev) => ({ ...prev, isOpen: false }))}
            onMarkAsRead={handleMarkAsReadFromReader}
            isReadAlready={readerState.isReadAlready}
          />
        </ErrorBoundary>
      )}

      {/* Bottom Navigation for Mobile */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isOffline={isOffline}
      />
    </div>
  );
}
