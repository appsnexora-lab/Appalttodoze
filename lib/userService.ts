import { useState, useEffect } from 'react';
import { UserProfile } from '@/types';
import { dbPut } from '@/lib/indexedDB';
import { auth, syncUserProfileToFirestore } from '@/lib/firebase';
export type { UserProfile };

const STORAGE_KEY = 'altto_user_profile';

export const AVATAR_PRESETS = [
  { id: 'gold', name: 'Luz Dourada', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  { id: 'cream', name: 'Creme Alvorada', bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-300' },
  { id: 'emerald', name: 'Oliveira Verde', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  { id: 'sky', name: 'Céu Sagrado', bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300' },
  { id: 'indigo', name: 'Noite de Vigília', bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: 'Anderson',
  email: 'anderson@email.com',
  avatarUrl: '',
  avatarPreset: 'gold',
  favoriteVerse: 'O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)',
  bio: 'Buscando a Deus através da leitura diária da Palavra.',
  dailyGoalChapters: 3,
  streakDays: 1,
};

let cachedProfile: UserProfile = DEFAULT_USER_PROFILE;
let cachedRawString: string | null = null;
let isCacheLoaded = false;

export function getUserProfile(): UserProfile {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_PROFILE;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!isCacheLoaded || saved !== cachedRawString) {
      cachedRawString = saved;
      isCacheLoaded = true;
      if (saved) {
        const parsed = JSON.parse(saved);
        cachedProfile = {
          name: parsed.name || 'Anderson',
          email: parsed.email || 'anderson@email.com',
          avatarUrl: parsed.avatarUrl || '',
          avatarPreset: parsed.avatarPreset || 'gold',
          favoriteVerse: parsed.favoriteVerse || 'O Senhor é o meu pastor; nada me faltará. (Salmo 23:1)',
          bio: parsed.bio || 'Buscando a Deus através da leitura diária da Palavra.',
          dailyGoalChapters: parsed.dailyGoalChapters || 3,
          streakDays: parsed.streakDays || 1,
          updatedAt: parsed.updatedAt,
        };
      } else {
        cachedProfile = DEFAULT_USER_PROFILE;
      }
    }
    return cachedProfile;
  } catch (err) {
    console.warn('Erro ao carregar perfil do usuário:', err);
    return cachedProfile || DEFAULT_USER_PROFILE;
  }
}

export function saveUserProfile(data: Partial<UserProfile>): UserProfile {
  const current = getUserProfile();
  const updated: UserProfile = {
    ...current,
    ...data,
    name: (data.name !== undefined ? data.name.trim() : current.name) || 'Anderson',
    updatedAt: new Date().toISOString(),
  };
  cachedProfile = updated;
  if (typeof window !== 'undefined') {
    try {
      const raw = JSON.stringify(updated);
      cachedRawString = raw;
      isCacheLoaded = true;
      localStorage.setItem(STORAGE_KEY, raw);
      window.dispatchEvent(new Event('altto_profile_updated'));
      
      // Async persist in indexedDB for extra durability
      dbPut('user_profile', { ...updated, id: 'current_user' } as any).catch(() => {});

      // Sync to Firebase Cloud Firestore for persistent storage across devices and deployments
      if (auth.currentUser) {
        syncUserProfileToFirestore(auth.currentUser.uid, updated).catch(() => {});
      }
    } catch (err) {
      console.error('Erro ao salvar perfil no localStorage:', err);
    }
  }
  return updated;
}

export function subscribeUserProfile(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleUpdate = () => {
    isCacheLoaded = false;
    callback();
  };
  window.addEventListener('altto_profile_updated', handleUpdate);
  window.addEventListener('storage', handleUpdate);
  return () => {
    window.removeEventListener('altto_profile_updated', handleUpdate);
    window.removeEventListener('storage', handleUpdate);
  };
}

export function useUserProfile(): UserProfile {
  const [profile, setProfile] = useState<UserProfile>(getUserProfile);

  useEffect(() => {
    const handleUpdate = () => {
      setProfile(getUserProfile());
    };
    window.addEventListener('altto_profile_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('altto_profile_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return profile;
}

export function processAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const TARGET_SIZE = 256;
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Center square crop
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.fillStyle = '#FAF9FD';
        ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, TARGET_SIZE, TARGET_SIZE);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.88);
        canvas.width = 0;
        canvas.height = 0;
        resolve(compressedBase64);
      };
      img.onerror = () => reject(new Error('Erro ao processar imagem de foto.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo da imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

export interface ReadingStreakData {
  currentStreak: number;
  bestStreak: number;
  readToday: boolean;
  totalDaysRead: number;
}

/**
 * Calculates continuous reading streak based on daily interactions
 */
export function calculateReadingStreak(): ReadingStreakData {
  if (typeof window === 'undefined') {
    return { currentStreak: 1, bestStreak: 1, readToday: false, totalDaysRead: 1 };
  }

  const activeDatesSet = new Set<string>();

  // 1. Devotional dates
  try {
    const devDates = localStorage.getItem('altto_devotional_completed_dates');
    if (devDates) {
      const parsed = JSON.parse(devDates);
      if (Array.isArray(parsed)) {
        parsed.forEach((d) => typeof d === 'string' && activeDatesSet.add(d));
      }
    }
  } catch {}

  // 2. Bible status keys
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('altto_bible_status_')) {
        const val = localStorage.getItem(key);
        if (val) {
          const status = JSON.parse(val);
          if (status.morning || status.afternoon || status.night) {
            const dateStr = key.replace('altto_bible_status_', '');
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              activeDatesSet.add(dateStr);
            }
          }
        }
      }
    }
  } catch {}

  const sortedDates = Array.from(activeDatesSet).sort();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  const readToday = activeDatesSet.has(todayStr);

  // Compute current continuous streak
  let currentStreak = 0;
  let checkDate = readToday ? new Date(today) : new Date(yesterday);

  while (true) {
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    if (activeDatesSet.has(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Fallback to profile value if at least 1 day recorded or profile had it
  const profile = getUserProfile();
  const effectiveStreak = Math.max(currentStreak, readToday ? 1 : (profile.streakDays || 1));
  const bestStreak = Math.max(effectiveStreak, profile.bestStreakDays || effectiveStreak);

  // Auto-sync streak to profile if changed
  if (profile.streakDays !== effectiveStreak || profile.bestStreakDays !== bestStreak) {
    setTimeout(() => {
      saveUserProfile({ streakDays: effectiveStreak, bestStreakDays: bestStreak });
    }, 0);
  }

  return {
    currentStreak: effectiveStreak,
    bestStreak,
    readToday,
    totalDaysRead: Math.max(sortedDates.length, effectiveStreak),
  };
}

export interface ReadingRemindersConfig {
  morning: string;
  afternoon: string;
  night: string;
  enabled: boolean;
}

const REMINDERS_KEY = 'altto_reading_reminders';
export const DEFAULT_REMINDERS: ReadingRemindersConfig = {
  morning: '07:00',
  afternoon: '13:00',
  night: '21:00',
  enabled: true,
};

export function getReadingReminders(): ReadingRemindersConfig {
  if (typeof window === 'undefined') return DEFAULT_REMINDERS;
  try {
    const saved = localStorage.getItem(REMINDERS_KEY);
    if (saved) return { ...DEFAULT_REMINDERS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_REMINDERS;
}

export function saveReadingReminders(cfg: Partial<ReadingRemindersConfig>): ReadingRemindersConfig {
  const current = getReadingReminders();
  const updated = { ...current, ...cfg };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(REMINDERS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('altto_reminders_updated'));
    } catch {}
  }
  return updated;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      try {
        new Notification('ALTTO · Lembretes de Leitura Ativados', {
          body: 'Seus turnos da Manhã, Tarde e Noite foram sincronizados com sucesso!',
          icon: '/apple-touch-icon.png',
        });
      } catch {}
    }
    return perm;
  } catch {
    return 'denied';
  }
}
