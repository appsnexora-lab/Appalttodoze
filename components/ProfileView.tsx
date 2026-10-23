'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  MessageSquare,
  Bookmark,
  Highlighter,
  Download,
  Upload,
  Calendar,
  Search,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  Smartphone,
  Cloud,
  FileJson,
  Camera,
  Check,
  Edit3,
  Flame,
  LogIn,
  LogOut,
  RefreshCw,
  Loader2,
  AlertCircle,
  Bell,
  Copy,
  Clock,
  Sparkles,
} from 'lucide-react';
import { BibleReflection, Bookmark as BookmarkType, Highlight, Annotation } from '@/types';
import { getAllBibleReflections } from '@/lib/bibleService';
import { getBookmarks, getHighlights, getAnnotations, deleteBookmark, deleteHighlight, deleteAnnotation } from '@/lib/readerService';
import { exportAllDataAsJSON, importDataFromJSON } from '@/lib/indexedDB';
import {
  getUserProfile,
  saveUserProfile,
  processAvatarImage,
  AVATAR_PRESETS,
  UserProfile,
  calculateReadingStreak,
  getReadingReminders,
  saveReadingReminders,
  requestNotificationPermission,
  ReadingRemindersConfig,
  ReadingStreakData,
} from '@/lib/userService';
import { auth, loginWithGoogle, logoutUser } from '@/lib/firebase';
import { subscribeSyncState, getSyncState, syncLibraryWithCloud, SyncState } from '@/lib/syncService';

export const ProfileView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'diary' | 'bookmarks' | 'highlights' | 'backup'>(
    'profile'
  );

  const [profile, setProfile] = useState<UserProfile>(getUserProfile());
  const [nameInput, setNameInput] = useState<string>(profile.name);
  const [verseInput, setVerseInput] = useState<string>(profile.favoriteVerse || '');
  const [bioInput, setBioInput] = useState<string>(profile.bio || '');
  const [avatarPreview, setAvatarPreview] = useState<string>(profile.avatarUrl || '');
  const [selectedPreset, setSelectedPreset] = useState<string>(profile.avatarPreset || 'gold');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reflections, setReflections] = useState<BibleReflection[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [searchFilter, setSearchFilter] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [syncState, setSyncState] = useState<SyncState>(getSyncState());
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [streakData, setStreakData] = useState<ReadingStreakData>(() => calculateReadingStreak());
  const [reminders, setReminders] = useState<ReadingRemindersConfig>(() => getReadingReminders());
  const [highlightCategoryFilter, setHighlightCategoryFilter] = useState<string>('all');
  const [isCopiedHighlights, setIsCopiedHighlights] = useState<boolean>(false);

  const handleToggleReminders = () => {
    const updated = saveReadingReminders({ enabled: !reminders.enabled });
    setReminders(updated);
    showToast(updated.enabled ? '✓ Lembretes de leitura ativados!' : 'Lembretes de leitura desativados.');
  };

  const handleUpdateReminderTime = (period: 'morning' | 'afternoon' | 'night', time: string) => {
    const updated = saveReadingReminders({ [period]: time });
    setReminders(updated);
    showToast(`✓ Horário da ${period === 'morning' ? 'Manhã' : period === 'afternoon' ? 'Tarde' : 'Noite'} atualizado para ${time}`);
  };

  const handleRequestPushNotifications = async () => {
    const perm = await requestNotificationPermission();
    if (perm === 'granted') {
      showToast('✓ Notificações do ALTTO autorizadas com sucesso!');
    } else if (perm === 'unsupported') {
      showToast('Lembretes ativos no app! Notificações do sistema não suportadas nesta visualização.');
    } else {
      showToast('Permissão de notificações não concedida no navegador.');
    }
  };

  const handleExportHighlights = () => {
    const activeHighlights = highlights.filter((h) => {
      if (highlightCategoryFilter === 'all') return true;
      return h.category === highlightCategoryFilter;
    });

    if (activeHighlights.length === 0) {
      showToast('Nenhum destaque para exportar nesta categoria.');
      return;
    }

    const lines = activeHighlights.map((h, i) => {
      const catLabel =
        h.category === 'meditation'
          ? 'Meditação'
          : h.category === 'promise'
          ? 'Promessa'
          : h.category === 'action'
          ? 'Prática/Ação'
          : h.category === 'doctrine'
          ? 'Doutrina'
          : h.category === 'prayer'
          ? 'Oração'
          : 'Geral';
      return `${i + 1}. [${catLabel}] "${h.text}"\n   — Localização: ${h.location}${h.note ? `\n   — Nota: ${h.note}` : ''}\n`;
    });

    const outputText = `ALTTO · Memorial de Destaques & Citações\nData: ${new Date().toLocaleDateString('pt-BR')}\nTotal: ${activeHighlights.length} trecho(s)\n\n` + lines.join('\n');

    if (navigator.clipboard) {
      navigator.clipboard.writeText(outputText).then(() => {
        setIsCopiedHighlights(true);
        showToast('✓ Todas as citações foram copiadas!');
        setTimeout(() => setIsCopiedHighlights(false), 3000);
      }).catch(() => {
        showToast('Erro ao copiar citações.');
      });
    } else {
      showToast('Área de transferência indisponível.');
    }
  };

  useEffect(() => {
    const unsub = subscribeSyncState(() => setSyncState(getSyncState()));
    return () => unsub();
  }, []);

  const handleLoginGoogle = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const user = await loginWithGoogle();
      if (user) {
        showToast(`✓ Conectado como ${user.email}! Sincronizando com a nuvem...`);
        await syncLibraryWithCloud();
        await loadData();
      }
    } catch (err: any) {
      showToast('Erro ao conectar com Google. Tente novamente.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      showToast('Desconectado da conta da nuvem.');
    } catch {
      showToast('Erro ao desconectar.');
    }
  };

  const handleManualCloudSync = async () => {
    if (isSyncingCloud) return;
    setIsSyncingCloud(true);
    try {
      const res = await syncLibraryWithCloud();
      showToast(`✓ Sincronização concluída! ${res.syncedBooks} livro(s) sincronizados.`);
      await loadData();
    } catch {
      showToast('Falha na sincronização. Verifique sua conexão.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const loadData = async () => {
    const p = getUserProfile();
    setProfile(p);
    setNameInput(p.name);
    setVerseInput(p.favoriteVerse || '');
    setBioInput(p.bio || '');
    setAvatarPreview(p.avatarUrl || '');
    setSelectedPreset(p.avatarPreset || 'gold');

    const r = await getAllBibleReflections();
    setReflections(r);
    const b = await getBookmarks();
    setBookmarks(b);
    const h = await getHighlights();
    setHighlights(h);
    const a = await getAnnotations();
    setAnnotations(a);
  };

  useEffect(() => {
    let isCancelled = false;
    async function fetchData() {
      const p = getUserProfile();
      if (!isCancelled) {
        setProfile(p);
        setNameInput(p.name);
        setVerseInput(p.favoriteVerse || '');
        setBioInput(p.bio || '');
        setAvatarPreview(p.avatarUrl || '');
        setSelectedPreset(p.avatarPreset || 'gold');
      }

      const r = await getAllBibleReflections();
      if (isCancelled) return;
      setReflections(r);

      const b = await getBookmarks();
      if (isCancelled) return;
      setBookmarks(b);

      const h = await getHighlights();
      if (isCancelled) return;
      setHighlights(h);

      const a = await getAnnotations();
      if (!isCancelled) setAnnotations(a);
    }
    fetchData();
    return () => {
      isCancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await processAvatarImage(file);
      setAvatarPreview(base64);
      const updated = saveUserProfile({ avatarUrl: base64 });
      setProfile(updated);
      showToast('✓ Foto de perfil atualizada com sucesso!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao processar imagem.');
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    const updated = saveUserProfile({ avatarUrl: '' });
    setProfile(updated);
    showToast('Foto removida. Monograma clássico restaurado.');
  };

  const handleSaveProfile = () => {
    setIsSavingProfile(true);
    const updated = saveUserProfile({
      name: nameInput.trim() || 'Anderson',
      avatarUrl: avatarPreview,
      avatarPreset: selectedPreset,
      favoriteVerse: verseInput.trim(),
      bio: bioInput.trim(),
    });
    setProfile(updated);
    setTimeout(() => {
      setIsSavingProfile(false);
      showToast(`✓ Perfil de ${updated.name} salvo com sucesso!`);
    }, 400);
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const jsonStr = await exportAllDataAsJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ALTTO-Backup-Cristao-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup completo baixado com sucesso!');
    } catch (err) {
      console.error(err);
      showToast('Erro ao gerar backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importDataFromJSON(text);
      await loadData();
      showToast('Backup restaurado com sucesso! Todos os dados foram atualizados.');
    } catch (err) {
      console.error(err);
      showToast('Erro ao importar backup. Verifique se o arquivo JSON é válido.');
    }
  };

  const filteredReflections = reflections.filter((r) =>
    r.text.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.bookName.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.date.includes(searchFilter)
  );

  return (
    <div id="profile-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 bg-white min-h-screen text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
        <div>
          <span className="text-xs font-bold text-[#A58ADB] uppercase tracking-wider">
            Meu Espaço Espiritual
          </span>
          <h1 className="text-2xl font-bold font-serif text-[#29243A] tracking-tight">Histórico Espiritual & Perfil</h1>
          <p className="text-xs text-[#827A96] mt-0.5">
            Suas reflexões com Deus, marcadores, trechos destacados e backup seguro.
          </p>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sub tabs - Perfectly screen-fitted 5-column grid without horizontal scrolling */}
      <div className="grid grid-cols-5 gap-1 sm:gap-2 border-b border-[#EAE5F4] pb-2 text-[11px] sm:text-xs">
        <button
          id="profile-tab-btn-me"
          onClick={() => setActiveTab('profile')}
          className={`py-2 px-1 rounded-xl font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[#F0EAFE] text-[#A58ADB] border border-[#EAE5F4] shadow-xs'
              : 'text-[#827A96] hover:text-[#29243A] hover:bg-[#FAF9FD] border border-transparent'
          }`}
        >
          <User className="w-3.5 h-3.5 text-[#A58ADB] shrink-0" />
          <span className="truncate">Perfil</span>
        </button>

        <button
          id="profile-tab-btn-diary"
          onClick={() => setActiveTab('diary')}
          className={`py-2 px-1 rounded-xl font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer ${
            activeTab === 'diary'
              ? 'bg-[#F0EAFE] text-[#A58ADB] border border-[#EAE5F4] shadow-xs'
              : 'text-[#827A96] hover:text-[#29243A] hover:bg-[#FAF9FD] border border-transparent'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-[#A58ADB] shrink-0" />
          <span className="truncate">Diário</span>
        </button>

        <button
          id="profile-tab-btn-bookmarks"
          onClick={() => setActiveTab('bookmarks')}
          className={`py-2 px-1 rounded-xl font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer ${
            activeTab === 'bookmarks'
              ? 'bg-[#F0EAFE] text-[#A58ADB] border border-[#EAE5F4] shadow-xs'
              : 'text-[#827A96] hover:text-[#29243A] hover:bg-[#FAF9FD] border border-transparent'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5 text-[#A58ADB] shrink-0" />
          <span className="truncate">Marcas</span>
        </button>

        <button
          id="profile-tab-btn-highlights"
          onClick={() => setActiveTab('highlights')}
          className={`py-2 px-1 rounded-xl font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer ${
            activeTab === 'highlights'
              ? 'bg-[#F0EAFE] text-[#A58ADB] border border-[#EAE5F4] shadow-xs'
              : 'text-[#827A96] hover:text-[#29243A] hover:bg-[#FAF9FD] border border-transparent'
          }`}
        >
          <Highlighter className="w-3.5 h-3.5 text-[#A58ADB] shrink-0" />
          <span className="truncate">Notas</span>
        </button>

        <button
          id="profile-tab-btn-backup"
          onClick={() => setActiveTab('backup')}
          className={`py-2 px-1 rounded-xl font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-center cursor-pointer ${
            activeTab === 'backup'
              ? 'bg-[#F0EAFE] text-[#A58ADB] border border-[#EAE5F4] shadow-xs'
              : 'text-[#827A96] hover:text-[#29243A] hover:bg-[#FAF9FD] border border-transparent'
          }`}
        >
          <Cloud className="w-3.5 h-3.5 text-[#A58ADB] shrink-0" />
          <span className="truncate">Backup</span>
        </button>
      </div>

      {/* SECTION 0: MEU PERFIL */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="p-5 sm:p-6 rounded-3xl bg-white border border-[#EAE5F4] shadow-[0_2px_12px_rgba(165,138,219,0.06)] relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 relative z-10">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="relative group">
                  <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl overflow-hidden bg-[#FAF9FD] border-2 border-[#C4B1F0] shadow-md flex items-center justify-center relative">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt={nameInput || 'Usuário'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#F0EAFE] flex items-center justify-center text-4xl sm:text-5xl font-serif font-bold text-[#A58ADB]">
                        {(nameInput.trim() || 'A').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <label
                    htmlFor="avatar-upload-input"
                    className="absolute -bottom-2 -right-2 p-2 rounded-2xl btn-lilas shadow-md cursor-pointer border-2 border-white hover:scale-110 transition-transform"
                    title="Carregar foto do seu dispositivo"
                  >
                    <Camera className="w-4 h-4" />
                    <input
                      id="avatar-upload-input"
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <label
                  htmlFor="avatar-upload-input"
                  className="mt-1 px-3 py-1.5 rounded-xl bg-[#F0EAFE] hover:bg-[#E8DFFC] text-[#A58ADB] border border-[#EAE5F4] text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{avatarPreview ? 'Trocar Imagem' : 'Adicionar Foto'}</span>
                </label>

                {avatarPreview && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="text-[11px] font-medium text-[#827A96] hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    Remover foto
                  </button>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F0EAFE] border border-[#EAE5F4] text-[11px] font-bold text-[#A58ADB]">
                  <User className="w-3 h-3 text-[#A58ADB]" />
                  <span>Saudação Personalizada</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold font-serif text-[#29243A] tracking-tight">
                  {(() => {
                    const hour = new Date().getHours();
                    const g =
                      hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
                    return `${g}, ${nameInput.trim() || 'Anderson'}!`;
                  })()}
                </h2>
                <p className="text-xs sm:text-sm text-[#827A96] italic font-serif max-w-lg">
                  &ldquo;{verseInput.trim() || 'O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)'}&rdquo;
                </p>
                {bioInput && (
                  <p className="text-xs text-[#827A96] max-w-lg">
                    {bioInput}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Form to Edit Profile */}
          <div className="p-6 rounded-3xl bg-white border border-[#EFE8D8] shadow-xs space-y-5">
            <div className="flex items-center gap-2 border-b border-[#F2ECE1] pb-3">
              <Edit3 className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-bold font-serif text-stone-900">
                Personalizar Meu Nome & Perfil
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-stone-800 flex items-center justify-between">
                  <span>Seu Nome ou Como deseja ser chamado:</span>
                  <span className="text-[10px] text-amber-800 font-semibold">Usado nas saudações do Início</span>
                </label>
                <input
                  id="user-profile-name-input"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ex: Anderson, Maria, José, etc."
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F2] border border-[#E8DFC9] text-sm text-stone-900 focus:bg-white focus:outline-none focus:border-amber-500 font-medium transition-all"
                />
                <p className="text-[11px] text-stone-500">
                  Toda vez que você abrir o app, ele irá cumprimentá-lo com &ldquo;Bom dia, {nameInput.trim() || 'Anderson'}&rdquo;, &ldquo;Boa tarde, {nameInput.trim() || 'Anderson'}&rdquo; ou &ldquo;Boa noite, {nameInput.trim() || 'Anderson'}&rdquo;.
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-stone-800">
                  Versículo ou Lema Espiritual Favorito:
                </label>
                <input
                  id="user-profile-verse-input"
                  type="text"
                  value={verseInput}
                  onChange={(e) => setVerseInput(e.target.value)}
                  placeholder="Ex: O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)"
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F2] border border-[#E8DFC9] text-xs text-stone-900 focus:bg-white focus:outline-none focus:border-amber-500 transition-all"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-stone-800">
                  Sobre minha caminhada com Deus (Opcional):
                </label>
                <textarea
                  id="user-profile-bio-input"
                  rows={2}
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="Ex: Dedicado a ler a Bíblia todos os dias pela manhã, tarde e noite."
                  className="w-full px-4 py-2 rounded-2xl bg-[#FAF8F2] border border-[#E8DFC9] text-xs text-stone-900 focus:bg-white focus:outline-none focus:border-amber-500 transition-all resize-none"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-bold text-stone-800">
                  Estilo de Cor do Monograma (caso não use foto):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {AVATAR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`p-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                        selectedPreset === preset.id
                          ? 'border-amber-500 bg-amber-50/50 shadow-2xs'
                          : 'border-[#EFE8D8] bg-[#FAF8F2] hover:bg-white'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-lg ${preset.bg} ${preset.text} font-bold text-[10px] flex items-center justify-center border ${preset.border}`}>
                        {(nameInput.trim() || 'A').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[11px] text-stone-700 truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EAE5F4]">
              <button
                id="btn-save-user-profile"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="px-6 py-2.5 rounded-2xl btn-lilas font-bold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvar Alterações no Perfil</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Spiritual Milestones */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#EAE5F4] text-center space-y-1 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                <Flame className="w-4 h-4 text-amber-600 fill-amber-500 animate-pulse" />
              </div>
              <span className="text-xl font-bold font-serif text-[#29243A] block">
                {streakData.currentStreak}
              </span>
              <span className="text-[10px] font-semibold text-[#827A96] uppercase tracking-wider block">
                {streakData.currentStreak === 1 ? 'Dia de Foco' : 'Dias Seguidos'}
              </span>
              <span className="text-[9px] text-amber-700 font-bold block">
                Recorde: {streakData.bestStreak}d
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#EAE5F4] text-center space-y-1 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center mx-auto">
                <MessageSquare className="w-4 h-4 text-[#A58ADB]" />
              </div>
              <span className="text-xl font-bold font-serif text-[#29243A] block">
                {reflections.length}
              </span>
              <span className="text-[10px] font-semibold text-[#827A96] uppercase tracking-wider block">
                Reflexões com Deus
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#EAE5F4] text-center space-y-1 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center mx-auto">
                <Bookmark className="w-4 h-4 text-[#A58ADB]" />
              </div>
              <span className="text-xl font-bold font-serif text-[#29243A] block">
                {bookmarks.length}
              </span>
              <span className="text-[10px] font-semibold text-[#827A96] uppercase tracking-wider block">
                Marcadores
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#EAE5F4] text-center space-y-1 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center mx-auto">
                <Highlighter className="w-4 h-4 text-[#A58ADB]" />
              </div>
              <span className="text-xl font-bold font-serif text-[#29243A] block">
                {highlights.length + annotations.length}
              </span>
              <span className="text-[10px] font-semibold text-[#827A96] uppercase tracking-wider block">
                Trechos Salvos
              </span>
            </div>
          </div>

          {/* Lembretes dos Turnos de Leitura (PWA) */}
          <div className="p-5 rounded-3xl bg-white border border-[#EAE5F4] shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#EAE5F4] flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-serif text-[#29243A]">
                    Lembretes dos Turnos de Leitura (PWA)
                  </h3>
                  <p className="text-[11px] text-[#827A96]">
                    Configure os horários para ser avisado sobre seus momentos diários de leitura.
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleReminders}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  reminders.enabled
                    ? 'bg-[#F0EAFE] text-[#A58ADB] border-[#C4B1F0]'
                    : 'bg-[#FAF9FD] text-[#827A96] border-[#EAE5F4]'
                }`}
              >
                {reminders.enabled ? 'Ativos ✓' : 'Desativados'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#29243A]">Turno da Manhã</span>
                  <Clock className="w-3.5 h-3.5 text-[#A58ADB]" />
                </div>
                <input
                  type="time"
                  value={reminders.morning}
                  onChange={(e) => handleUpdateReminderTime('morning', e.target.value)}
                  className="w-full bg-white border border-[#EAE5F4] rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-[#29243A] focus:outline-none focus:border-[#A58ADB]"
                />
              </div>

              <div className="p-3 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#29243A]">Turno da Tarde</span>
                  <Clock className="w-3.5 h-3.5 text-[#A58ADB]" />
                </div>
                <input
                  type="time"
                  value={reminders.afternoon}
                  onChange={(e) => handleUpdateReminderTime('afternoon', e.target.value)}
                  className="w-full bg-white border border-[#EAE5F4] rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-[#29243A] focus:outline-none focus:border-[#A58ADB]"
                />
              </div>

              <div className="p-3 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#29243A]">Turno da Noite</span>
                  <Clock className="w-3.5 h-3.5 text-[#A58ADB]" />
                </div>
                <input
                  type="time"
                  value={reminders.night}
                  onChange={(e) => handleUpdateReminderTime('night', e.target.value)}
                  className="w-full bg-white border border-[#EAE5F4] rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-[#29243A] focus:outline-none focus:border-[#A58ADB]"
                />
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] text-[#827A96]">
                Notificações locais funcionam offline e no app instalado.
              </span>
              <button
                onClick={handleRequestPushNotifications}
                className="py-1.5 px-3 rounded-xl bg-white border border-[#EAE5F4] hover:border-[#A58ADB] text-[#A58ADB] font-bold text-xs cursor-pointer shadow-2xs hover:bg-[#F0EAFE] transition-colors flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Permitir Notificações no Dispositivo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1: DIÁRIO ESPIRITUAL */}
      {activeTab === 'diary' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar em reflexões antigas..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-amber-500"
            />
          </div>

          {filteredReflections.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-amber-600/60 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">
                Nenhuma reflexão espiritual encontrada.
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Após ler seus capítulos na aba Bíblia, registre no campo &ldquo;O que Deus falou ao meu coração&rdquo; para construir seu memorial de fé.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReflections.map((r) => (
                <div
                  key={r.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-800 font-serif">
                        {r.bookName} {r.chapterNumber}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 uppercase font-semibold">
                        {r.period === 'morning'
                          ? '🌅 Manhã'
                          : r.period === 'afternoon'
                          ? '🌇 Tarde'
                          : '🌙 Noite'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {r.date}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed italic bg-amber-50/40 p-3.5 rounded-xl border border-amber-200/50">
                    &ldquo;{r.text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: MARCADORES */}
      {activeTab === 'bookmarks' && (
        <div className="space-y-3">
          {bookmarks.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              Nenhum marcador salvo ainda. Toque no ícone de marcador durante a leitura para salvar sua posição.
            </div>
          ) : (
            bookmarks.map((b, bIdx) => (
              <div
                key={`bookmark-${b.id}-${bIdx}`}
                className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-xs"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900 font-serif">{b.title}</h4>
                  <p className="text-[11px] text-amber-700 font-semibold mt-0.5">{b.location}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await deleteBookmark(b.id);
                    await loadData();
                    showToast('Marcador removido');
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* SECTION 3: DESTAQUES & ANOTAÇÕES */}
      {activeTab === 'highlights' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#EAE5F4]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[#827A96] mr-1">Filtrar:</span>
              {[
                { id: 'all', label: 'Todos' },
                { id: 'meditation', label: 'Meditação (Lilás)' },
                { id: 'promise', label: 'Promessa (Ouro)' },
                { id: 'action', label: 'Prática (Verde)' },
                { id: 'doctrine', label: 'Doutrina (Azul)' },
                { id: 'prayer', label: 'Oração (Rosa)' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setHighlightCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                    highlightCategoryFilter === cat.id
                      ? 'bg-[#A58ADB] text-white shadow-2xs font-bold'
                      : 'bg-[#FAF9FD] text-[#827A96] hover:bg-[#F0EAFE] hover:text-[#29243A] border border-[#EAE5F4]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleExportHighlights}
              className="self-end sm:self-auto py-1.5 px-3 rounded-xl bg-white border border-[#EAE5F4] hover:border-[#A58ADB] hover:bg-[#F0EAFE] text-xs font-bold text-[#29243A] flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              title="Copiar todas as citações e destaques selecionados"
            >
              {isCopiedHighlights ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#A58ADB]" />}
              <span>{isCopiedHighlights ? 'Copiado!' : 'Copiar Citações'}</span>
            </button>
          </div>

          {highlights.length === 0 && annotations.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white border border-[#EAE5F4] text-center text-xs text-[#827A96]">
              Nenhum destaque ou anotação registrado. Selecione qualquer texto no leitor para destacar por cor temática ou adicionar notas espirituais.
            </div>
          ) : (
            <>
              {highlights
                .filter((h) => {
                  if (highlightCategoryFilter === 'all') return true;
                  if (highlightCategoryFilter === 'meditation') return h.color === 'purple' || h.category === 'meditation';
                  if (highlightCategoryFilter === 'promise') return h.color === 'gold' || h.category === 'promise';
                  if (highlightCategoryFilter === 'action') return h.color === 'emerald' || h.category === 'action';
                  if (highlightCategoryFilter === 'doctrine') return h.color === 'sky' || h.category === 'doctrine';
                  if (highlightCategoryFilter === 'prayer') return h.color === 'rose' || h.category === 'prayer';
                  return true;
                })
                .map((h) => (
                  <div
                    key={h.id}
                    className="p-4 rounded-2xl bg-white border border-[#EAE5F4] space-y-2.5 shadow-2xs"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#29243A] font-serif">{h.location}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          h.color === 'purple' || h.category === 'meditation'
                            ? 'bg-[#F0EAFE] text-[#A58ADB]'
                            : h.color === 'emerald' || h.category === 'action'
                            ? 'bg-emerald-50 text-emerald-800'
                            : h.color === 'sky' || h.category === 'doctrine'
                            ? 'bg-sky-50 text-sky-800'
                            : h.color === 'rose' || h.category === 'prayer'
                            ? 'bg-rose-50 text-rose-800'
                            : 'bg-amber-50 text-amber-900'
                        }`}>
                          {h.category === 'meditation'
                            ? 'Meditação'
                            : h.category === 'promise'
                            ? 'Promessa'
                            : h.category === 'action'
                            ? 'Prática'
                            : h.category === 'doctrine'
                            ? 'Doutrina'
                            : h.category === 'prayer'
                            ? 'Oração'
                            : 'Destaque'}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          await deleteHighlight(h.id);
                          await loadData();
                          showToast('Destaque removido');
                        }}
                        className="text-slate-400 hover:text-rose-600 rounded-lg p-1 hover:bg-rose-50 cursor-pointer"
                        title="Excluir destaque"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div
                      className={`p-3 rounded-xl text-xs italic ${
                        h.color === 'purple' || h.category === 'meditation'
                          ? 'bg-[#F0EAFE] text-[#29243A] border-l-3 border-[#A58ADB]'
                          : h.color === 'emerald' || h.category === 'action'
                          ? 'bg-emerald-50 text-emerald-950 border-l-3 border-emerald-500'
                          : h.color === 'sky' || h.category === 'doctrine'
                          ? 'bg-sky-50 text-sky-950 border-l-3 border-sky-500'
                          : h.color === 'rose' || h.category === 'prayer'
                          ? 'bg-rose-50 text-rose-950 border-l-3 border-rose-400'
                          : 'bg-amber-50 text-amber-950 border-l-3 border-amber-500'
                      }`}
                    >
                      &ldquo;{h.text}&rdquo;
                    </div>
                    {h.note && <p className="text-xs text-[#827A96] font-medium pl-1">Nota: {h.note}</p>}
                  </div>
                ))}

              {annotations.map((a) => (
                <div
                  key={a.id}
                  className="p-4 rounded-2xl bg-white border border-[#EAE5F4] space-y-2 shadow-2xs"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#29243A] font-serif">{a.title || a.location}</span>
                    <button
                      onClick={async () => {
                        await deleteAnnotation(a.id);
                        await loadData();
                        showToast('Anotação removida');
                      }}
                      className="text-slate-400 hover:text-rose-600 rounded-lg p-1 hover:bg-rose-50 cursor-pointer"
                      title="Excluir anotação"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[#29243A] bg-[#FAF9FD] border border-[#EAE5F4] p-3 rounded-xl">{a.text}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* SECTION 4: SINCRONIZAÇÃO EM NUVEM (FIREBASE) & BACKUP */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          {/* Cloud Sync Card */}
          <div className="p-6 rounded-3xl bg-white border border-[#EAE5F4] shadow-xs space-y-5">
            <div className="flex items-start justify-between flex-wrap gap-3 pb-4 border-b border-[#EAE5F4]">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#F0EAFE] text-[#A58ADB] flex items-center justify-center shrink-0 shadow-xs">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-serif text-[#29243A]">
                    Sincronização na Nuvem (Firebase Cloud Sync)
                  </h3>
                  <p className="text-xs text-[#827A96] mt-0.5">
                    Mantenha sua biblioteca, capas, livros e progresso de leitura sincronizados entre todos os seus dispositivos.
                  </p>
                </div>
              </div>

              {syncState.isAuthenticated && (
                <div className="flex items-center gap-2">
                  <button
                    id="btn-sync-cloud-now"
                    onClick={handleManualCloudSync}
                    disabled={isSyncingCloud}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold btn-lilas transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                    <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
                  </button>
                  <button
                    id="btn-logout-cloud"
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 transition-all cursor-pointer"
                    title="Desconectar da conta Google"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sync Account Status */}
            <div className="p-4 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-3">
              {syncState.isAuthenticated ? (
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[#29243A] font-semibold">
                      Conectado como <strong className="text-[#A58ADB]">{syncState.userEmail}</strong>
                    </span>
                  </div>
                  <span className="text-[11px] text-[#827A96]">
                    {syncState.lastSyncedAt
                      ? `Última sincronização: ${new Date(syncState.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Sincronização ativa'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-[#29243A]">
                      Conecte sua Conta Google
                    </h4>
                    <p className="text-[11px] text-[#827A96] mt-0.5">
                      Faça login com Google para salvar seus livros e continuar sua leitura em qualquer celular, tablet ou computador.
                    </p>
                  </div>
                  <button
                    id="btn-login-google"
                    onClick={handleLoginGoogle}
                    disabled={isLoggingIn}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs bg-white text-[#29243A] border border-[#C4B1F0] hover:bg-[#FAF9FD] hover:border-[#A58ADB] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#A58ADB]" />
                    ) : (
                      <LogIn className="w-4 h-4 text-[#A58ADB]" />
                    )}
                    <span>{isLoggingIn ? 'Conectando...' : 'Entrar com Google'}</span>
                  </button>
                </div>
              )}

              {syncState.message && (
                <div className="text-[11px] text-[#827A96] bg-white p-2.5 rounded-xl border border-[#EAE5F4] flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#A58ADB] shrink-0" />
                  <span>{syncState.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Local Sovereignty Card */}
          <div className="p-6 rounded-3xl bg-white border border-[#EAE5F4] space-y-6 shadow-xs">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-1" />
              <div>
                <h3 className="text-base font-bold font-serif text-[#29243A]">
                  Soberania dos Dados & Armazenamento Local
                </h3>
                <p className="text-xs text-[#827A96] mt-1 leading-relaxed">
                  O ALTTO combina armazenamento local no dispositivo (IndexedDB) com a nuvem (Firebase). Seus livros e progresso abrem instantaneamente e funcionam perfeitamente sem conexão com a internet.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-[#A58ADB]" />
                  <h4 className="text-xs font-bold text-[#29243A] uppercase">Exportar Backup JSON</h4>
                </div>
                <p className="text-xs text-[#827A96]">
                  Gera um arquivo .json seguro com todas as suas leituras, reflexões, marcadores e configurações.
                </p>
                <button
                  disabled={isExporting}
                  onClick={handleExportBackup}
                  className="w-full py-2.5 rounded-xl btn-lilas font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <FileJson className="w-4 h-4" />
                  <span>{isExporting ? 'Exportando...' : 'Baixar Arquivo JSON'}</span>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF9FD] border border-[#EAE5F4] space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#A58ADB]" />
                  <h4 className="text-xs font-bold text-[#29243A] uppercase">Restaurar Backup JSON</h4>
                </div>
                <p className="text-xs text-[#827A96]">
                  Restaure seus dados locais ao trocar de aparelho ou recuperar um ponto anterior.
                </p>
                <label className="w-full py-2.5 rounded-xl bg-white hover:bg-[#FAF9FD] text-[#29243A] border border-[#C4B1F0] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                  <Upload className="w-4 h-4 text-[#A58ADB]" />
                  <span>Selecionar Arquivo JSON</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="pt-2 border-t border-[#EAE5F4] flex items-center justify-between text-xs text-[#827A96]">
              <span className="flex items-center gap-1.5 font-medium">
                <Smartphone className="w-4 h-4 text-[#A58ADB]" />
                <span>Armazenamento local ativo (IndexedDB + PWA)</span>
              </span>
              <span className="text-emerald-700 font-bold">✓ Pronto para leitura offline</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
