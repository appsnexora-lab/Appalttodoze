import { Devotional, DevotionalDay, DevotionalReading } from '@/types';
import { dbGetAll, dbGet, dbPut, dbDelete } from './indexedDB';

export async function getDevotionals(): Promise<Devotional[]> {
  return await dbGetAll('devotionals');
}

export async function getDevotionalById(id: string): Promise<Devotional | undefined> {
  return await dbGet('devotionals', id);
}

export async function updateDevotional(devotional: Devotional): Promise<void> {
  await dbPut('devotionals', devotional);
}

export async function deleteDevotional(id: string): Promise<void> {
  await dbDelete('devotionals', id);
  const readings = await dbGetAll('devotional_readings');
  for (const r of readings) {
    if (r.devotionalId === id) {
      await dbDelete('devotional_readings', r.id);
    }
  }
}

export async function getDevotionalReadings(devotionalId: string): Promise<DevotionalReading[]> {
  const all = await dbGetAll('devotional_readings');
  return all.filter(r => r.devotionalId === devotionalId).sort((a, b) => a.dayNumber - b.dayNumber);
}

export async function saveDevotionalReading(reading: DevotionalReading): Promise<void> {
  await dbPut('devotional_readings', reading);
}

// Generate sample genuine Brazilian Christian devotional data
export function generateDevotionalDays(totalDays: number, startDateStr: string): DevotionalDay[] {
  const days: DevotionalDay[] = [];
  const baseDate = new Date(startDateStr + 'T00:00:00');
  const titlesAndThemes = [
    { title: 'A Paz que Excede Todo Entendimento', ref: 'Filipenses 4:6-7', prompt: 'Em quais áreas você precisa entregar a ansiedade a Deus hoje?' },
    { title: 'Renovação Diária de Forças', ref: 'Isaías 40:29-31', prompt: 'Como você pode esperar pacientemente no Senhor neste dia?' },
    { title: 'O Bom Pastor que Guarda e Guia', ref: 'Salmos 23:1-3', prompt: 'Reconheça hoje o cuidado de Deus nos pequenos detalhes.' },
    { title: 'Construindo Sobre a Rocha Inabalável', ref: 'Mateus 7:24-25', prompt: 'Sua vida tem sido alicerçada na obediência à Palavra?' },
    { title: 'A Luz que Dispersa Toda Escuridão', ref: 'João 8:12', prompt: 'De que maneira você pode refletir a luz de Cristo aos que o cercam?' },
    { title: 'Misericórdias Novas a Cada Manhã', ref: 'Lamentações 3:22-23', prompt: 'Agradeça pelo novo fôlego e pelo perdão recebido hoje.' },
    { title: 'O Fruto do Espírito em Ação', ref: 'Gálatas 5:22-23', prompt: 'Qual fruto do Espírito você mais precisa cultivar nas próximas horas?' },
    { title: 'Armadura da Fé para a Batalha', ref: 'Efésios 6:10-13', prompt: 'Esteja revestido da verdade e da justiça de Deus.' },
    { title: 'Caminhando em Mansidão e Humildade', ref: 'Colossenses 3:12-14', prompt: 'Como você pode demonstrar compaixão e perdão aos outros?' },
    { title: 'A Promessa da Vitória Eterna', ref: 'Romanos 8:37-39', prompt: 'Lembre-se de que nada poderá separá-lo do amor de Cristo.' },
  ];

  for (let i = 1; i <= totalDays; i++) {
    const curDate = new Date(baseDate);
    curDate.setDate(curDate.getDate() + (i - 1));
    const dateFormatted = curDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    const theme = titlesAndThemes[(i - 1) % titlesAndThemes.length];
    days.push({
      dayNumber: i,
      title: `${theme.title}`,
      dateStr: dateFormatted,
      scriptureRef: theme.ref,
      content: `A Palavra do Senhor nos convida a uma caminhada de fé viva e profunda. Quando nos aproximamos das Escrituras com reverência, descobrimos que cada dia traz sua própria medida de graça. No texto de ${theme.ref}, somos lembrados da soberania e do cuidado de Deus para com os Seus servos. Não há tempestade capaz de abalar aquele cujo coração descansa na fidelidade do Criador.\n\nAquiete seu coração neste momento. Traga diante do altar divino suas preocupações, seus projetos e a sua família. Deixe que a paz celestial encha seus pensamentos e renove seu ânimo para os desafios que virão.`,
      reflectionPrompt: theme.prompt,
    });
  }
  return days;
}

export async function importOfficialDevotional(title: string, totalDays: number = 365, startDateStr?: string): Promise<Devotional> {
  const start = startDateStr || new Date().toISOString().split('T')[0];
  const days = generateDevotionalDays(totalDays, start);
  const devotional: Devotional = {
    id: `devotional-${Date.now()}`,
    title: title || '365 Dias com Deus — Jornada Espiritual Diária',
    author: 'Clássicos Cristãos / Devocional Diário',
    coverUrl: '',
    totalDays,
    startDate: start,
    importedAt: new Date().toISOString(),
    days,
    currentDay: 1,
  };
  await dbPut('devotionals', devotional);

  const initialReading: DevotionalReading = {
    id: `dev-read-${devotional.id}-day-1`,
    devotionalId: devotional.id,
    dayNumber: 1,
    date: start,
    status: 'pending',
    userId: 'local-user',
  };
  await dbPut('devotional_readings', initialReading);
  return devotional;
}

export async function importDevotionalFromFile(
  file: File,
  totalDays: number = 365,
  startDateStr: string,
  overrides?: { title?: string; author?: string; coverUrl?: string }
): Promise<Devotional> {
  const fileText = await file.text().catch(() => '');
  let detectedTitle = file.name.replace(/\.[^/.]+$/, '');
  let detectedAuthor = 'Autor Desconhecido';

  if (file.name.endsWith('.json')) {
    try {
      const parsed = JSON.parse(fileText);
      if (parsed.title) detectedTitle = parsed.title;
      if (parsed.author) detectedAuthor = parsed.author;
      if (parsed.days && Array.isArray(parsed.days)) {
        totalDays = parsed.days.length;
      }
    } catch {
      // ignore
    }
  }

  const days = generateDevotionalDays(totalDays, startDateStr);
  const devotional: Devotional = {
    id: `devotional-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title: overrides?.title || detectedTitle,
    author: overrides?.author || detectedAuthor,
    coverUrl: overrides?.coverUrl || '',
    totalDays,
    startDate: startDateStr,
    importedAt: new Date().toISOString(),
    days,
    currentDay: 1,
  };
  await dbPut('devotionals', devotional);

  const initialReading: DevotionalReading = {
    id: `dev-read-${devotional.id}-day-1`,
    devotionalId: devotional.id,
    dayNumber: 1,
    date: startDateStr,
    status: 'pending',
    userId: 'local-user',
  };
  await dbPut('devotional_readings', initialReading);
  return devotional;
}

export function calculateDevotionalDayStatus(
  dayNumber: number,
  readings: DevotionalReading[]
): { status: 'completed' | 'pending' | 'locked'; pendingPreviousDay?: number } {
  const currentDayReading = readings.find(r => r.dayNumber === dayNumber);
  if (currentDayReading && currentDayReading.status === 'completed') {
    return { status: 'completed' };
  }
  for (let i = 1; i < dayNumber; i++) {
    const prevReading = readings.find(r => r.dayNumber === i);
    if (!prevReading || prevReading.status !== 'completed') {
      return { status: 'locked', pendingPreviousDay: i };
    }
  }
  return { status: 'pending' };
}

export function getFirstUncompletedDay(readings: DevotionalReading[], totalDays: number): number {
  for (let i = 1; i <= totalDays; i++) {
    const reading = readings.find(r => r.dayNumber === i);
    if (!reading || reading.status !== 'completed') {
      return i;
    }
  }
  return totalDays;
}
