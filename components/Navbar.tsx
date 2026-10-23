'use client';

import React, { useState } from 'react';
import {
  Home,
  BookOpen,
  BookMarked,
  Library,
  User,
  Menu,
  X,
  Star,
  Bookmark,
  Highlighter,
  Settings,
  Share2,
  ChevronRight,
  CalendarCheck,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { useUserProfile } from '@/lib/userService';
import { useSyncState, syncLibraryWithCloud } from '@/lib/syncService';

export type ActiveTab =
  | 'home'
  | 'bible'
  | 'devotional'
  | 'library'
  | 'profile'
  | 'plans'
  | 'favorites'
  | 'notes'
  | 'highlights'
  | 'settings';

interface TopBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab, filterParam?: string) => void;
  onOpenSearch?: () => void;
  isOffline?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onTabChange,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const profile = useUserProfile();
  const syncState = useSyncState();
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const userInitial = (profile.name || 'A').charAt(0).toUpperCase();

  const userName = (profile.name || 'Anderson').trim();

  const handleQuickSync = async () => {
    if (isManualSyncing) return;
    if (!syncState.isAuthenticated) {
      onTabChange('profile', 'backup');
      return;
    }
    setIsManualSyncing(true);
    try {
      await syncLibraryWithCloud();
    } catch {}
    finally {
      setIsManualSyncing(false);
    }
  };

  const handleShareApp = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: 'ALTTO — Leitura Cristã',
        text: 'Conheça o ALTTO, o leitor de Bíblia, devocionais e e-books cristãos.',
        url: window.location.href,
      }).catch(() => {});
    } else {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href);
      }
    }
  };

  const navMenuItems = [
    { id: 'home' as ActiveTab, label: 'Início', icon: Home },
    { id: 'library' as ActiveTab, label: 'Biblioteca', icon: Library },
    { id: 'bible' as ActiveTab, label: 'Bíblia Sagrada', icon: BookOpen },
    { id: 'devotional' as ActiveTab, label: 'Devocional', icon: CalendarCheck },
    { id: 'favorites' as ActiveTab, label: 'Favoritos', icon: Star, filter: 'favorites' },
    { id: 'notes' as ActiveTab, label: 'Notas & Diário', icon: Bookmark, filter: 'diary' },
    { id: 'highlights' as ActiveTab, label: 'Destaques', icon: Highlighter, filter: 'highlights' },
    { id: 'settings' as ActiveTab, label: 'Configurações', icon: Settings, filter: 'settings' },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-[#EAE5F4] px-4 py-2.5 sm:px-6 shadow-[0_1px_6px_rgba(165,138,219,0.06)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Hamburger Menu + Altto Logo */}
          <div className="flex items-center gap-3">
            <button
              id="btn-sidebar-drawer"
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 rounded-xl text-[#29243A] hover:bg-[#F0EAFE] hover:text-[#A58ADB] transition-colors cursor-pointer"
              title="Abrir menu lateral"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div
              id="altto-logo-brand"
              className="flex items-center gap-2.5 cursor-pointer select-none group"
              onClick={() => onTabChange('home')}
            >
              <div className="w-8 h-8 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(165,138,219,0.35)] group-hover:scale-105 transition-transform flex items-center justify-center bg-white border border-[#EAE5F4]">
                <img src="/apple-touch-icon.png" alt="ALTTO" className="w-full h-full object-cover" />
              </div>
              <span className="text-xl font-bold tracking-tight text-[#29243A] font-serif">
                ALTTO
              </span>
            </div>
          </div>

          {/* Center: Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-[#FAF9FD] p-1 rounded-2xl border border-[#EAE5F4]">
            <button
              id="nav-desktop-home"
              onClick={() => onTabChange('home')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                  : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Início</span>
            </button>
            <button
              id="nav-desktop-bible"
              onClick={() => onTabChange('bible')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'bible'
                  ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                  : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Bíblia</span>
            </button>
            <button
              id="nav-desktop-devotional"
              onClick={() => onTabChange('devotional')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'devotional'
                  ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                  : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Devocional</span>
            </button>
            <button
              id="nav-desktop-library"
              onClick={() => onTabChange('library')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'library'
                  ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                  : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
              }`}
            >
              <Library className="w-3.5 h-3.5" />
              <span>Biblioteca</span>
            </button>
            <button
              id="nav-desktop-profile"
              onClick={() => onTabChange('profile')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'profile' || activeTab === 'settings'
                  ? 'bg-white text-[#A58ADB] shadow-xs border border-[#EAE5F4]'
                  : 'text-[#827A96] hover:text-[#29243A] hover:bg-white/60'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Perfil</span>
            </button>
          </nav>

          {/* Right: Cloud Sync Status & User Profile Capsule */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              id="btn-topbar-sync"
              onClick={handleQuickSync}
              disabled={isManualSyncing}
              className={`p-2 rounded-full border transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                !syncState.isOnline
                  ? 'bg-stone-50 border-stone-200 text-stone-400'
                  : syncState.status === 'syncing' || isManualSyncing
                  ? 'bg-[#F0EAFE] border-[#C4B1F0] text-[#A58ADB]'
                  : syncState.isAuthenticated
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-700 hover:bg-emerald-100/70'
                  : 'bg-white border-[#EAE5F4] text-[#827A96] hover:text-[#29243A] hover:bg-[#FAF9FD]'
              }`}
              title={
                !syncState.isOnline
                  ? 'Modo Offline: Leitura local disponível'
                  : syncState.status === 'syncing' || isManualSyncing
                  ? 'Sincronizando com a Nuvem...'
                  : syncState.isAuthenticated
                  ? `Nuvem Sincronizada (${syncState.userEmail || 'Conectado'}). Clique para sincronizar.`
                  : 'Conectar à Nuvem (Firebase Cloud Sync)'
              }
            >
              {syncState.status === 'syncing' || isManualSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#A58ADB]" />
              ) : !syncState.isOnline ? (
                <CloudOff className="w-4 h-4" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              {syncState.activeUploads > 0 && (
                <span className="text-[10px] font-bold px-1 rounded-full bg-[#A58ADB] text-white">
                  {syncState.activeUploads}
                </span>
              )}
            </button>

            <button
              id="btn-topbar-profile"
              onClick={() => onTabChange('profile')}
              className="p-0.5 rounded-full bg-white border border-[#EAE5F4] hover:border-[#A58ADB] hover:bg-[#FAF9FD] shadow-xs transition-all cursor-pointer group flex items-center justify-center"
              title={`Perfil de ${userName}`}
              aria-label="Abrir Perfil do Usuário"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-[#F0EAFE] to-[#E8DFFC] border-2 border-[#C4B1F0] overflow-hidden flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold font-serif text-[#A58ADB]">{userInitial}</span>
                )}
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* LATERAL DRAWER MENU */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#29243A]/30 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Sidebar Drawer */}
          <aside
            id="altto-sidebar-drawer"
            className="relative w-full max-w-xs h-full bg-white border-r border-[#EAE5F4] shadow-2xl z-10 flex flex-col justify-between p-5 animate-in slide-in-from-left duration-200"
          >
            <div className="space-y-5 overflow-y-auto pr-1">
              {/* Header inside drawer */}
              <div className="flex items-center justify-between pb-4 border-b border-[#EAE5F4]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl overflow-hidden shadow-xs flex items-center justify-center bg-white border border-[#EAE5F4]">
                    <img src="/apple-touch-icon.png" alt="ALTTO" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-xl font-bold font-serif text-[#29243A]">ALTTO</span>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-[#827A96] hover:text-[#29243A] hover:bg-[#F0EAFE] transition-colors cursor-pointer"
                  title="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile Card */}
              <div
                onClick={() => {
                  setIsDrawerOpen(false);
                  onTabChange('profile');
                }}
                className="p-3.5 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] flex items-center gap-3 cursor-pointer hover:border-[#C4B1F0] transition-colors"
              >
                <div className="w-11 h-11 rounded-full bg-[#F0EAFE] border border-[#C4B1F0] flex items-center justify-center text-[#A58ADB] font-bold text-base font-serif overflow-hidden shrink-0">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{userInitial}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-[#29243A] truncate font-serif">
                    {profile.name || 'Anderson Ramos'}
                  </h4>
                  <p className="text-[11px] text-[#827A96] truncate">
                    {profile.email || 'anderson@email.com'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#C4B1F0] shrink-0" />
              </div>

              {/* Navigation Items */}
              <div className="space-y-1">
                {navMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isCurrent = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setIsDrawerOpen(false);
                        if (item.filter) {
                          if (item.id === 'favorites') {
                            onTabChange('library', 'favorites');
                          } else if (item.id === 'notes') {
                            onTabChange('profile', 'diary');
                          } else if (item.id === 'highlights') {
                            onTabChange('profile', 'highlights');
                          } else if (item.id === 'settings') {
                            onTabChange('profile', 'backup');
                          }
                        } else {
                          onTabChange(item.id);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-[#F0EAFE] text-[#A58ADB] font-bold'
                          : 'text-[#29243A] hover:bg-[#FAF9FD]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isCurrent ? 'text-[#A58ADB]' : 'text-[#827A96]'}`} />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 ${isCurrent ? 'text-[#A58ADB]' : 'text-[#827A96]/50'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Card: "Compartilhe o ALTTO" */}
            <div className="pt-4 border-t border-[#EAE5F4] mt-4">
              <div className="p-3.5 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shrink-0">
                    <Share2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-[#29243A]">Compartilhe o ALTTO</h5>
                    <p className="text-[10px] text-[#827A96] leading-relaxed mt-0.5">
                      Indique para seus amigos e ajude mais pessoas a conhecerem a Palavra.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleShareApp}
                  className="w-full py-1.5 px-3 rounded-xl bg-white border border-[#EAE5F4] hover:border-[#A58ADB] hover:bg-[#F0EAFE] text-[#29243A] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Share2 className="w-3 h-3 text-[#A58ADB]" />
                  <span>Compartilhar</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export const BottomNav: React.FC<{
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isOffline?: boolean;
}> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-lg border-t border-[#EAE5F4] px-2 py-1.5 pb-safe shadow-[0_-2px_12px_rgba(165,138,219,0.06)]">
      <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
        <button
          id="tab-btn-home"
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'home'
              ? 'text-[#A58ADB] font-bold bg-[#F0EAFE]'
              : 'text-[#827A96] hover:text-[#29243A]'
          }`}
        >
          <Home className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Início</span>
        </button>

        <button
          id="tab-btn-bible"
          onClick={() => onTabChange('bible')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'bible'
              ? 'text-[#A58ADB] font-bold bg-[#F0EAFE]'
              : 'text-[#827A96] hover:text-[#29243A]'
          }`}
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Bíblia</span>
        </button>

        <button
          id="tab-btn-library"
          onClick={() => onTabChange('library')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'library'
              ? 'text-[#A58ADB] font-bold bg-[#F0EAFE]'
              : 'text-[#827A96] hover:text-[#29243A]'
          }`}
        >
          <Library className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Biblioteca</span>
        </button>

        <button
          id="tab-btn-devotional"
          onClick={() => onTabChange('devotional')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'devotional'
              ? 'text-[#A58ADB] font-bold bg-[#F0EAFE]'
              : 'text-[#827A96] hover:text-[#29243A]'
          }`}
        >
          <CalendarCheck className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Devocional</span>
        </button>

        <button
          id="tab-btn-profile"
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'profile' || activeTab === 'settings'
              ? 'text-[#A58ADB] font-bold bg-[#F0EAFE]'
              : 'text-[#827A96] hover:text-[#29243A]'
          }`}
        >
          <User className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Mais</span>
        </button>
      </div>
    </nav>
  );
};
