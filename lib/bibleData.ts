export interface BibleBookInfo {
  id: string;
  name: string;
  testament: 'old' | 'new';
  chaptersCount: number;
}

export const BIBLE_BOOKS_CATALOG: BibleBookInfo[] = [
  // Antigo Testamento
  { id: 'GEN', name: 'Gênesis', testament: 'old', chaptersCount: 50 },
  { id: 'EXO', name: 'Êxodo', testament: 'old', chaptersCount: 40 },
  { id: 'LEV', name: 'Levítico', testament: 'old', chaptersCount: 27 },
  { id: 'NUM', name: 'Números', testament: 'old', chaptersCount: 36 },
  { id: 'DEU', name: 'Deuteronômio', testament: 'old', chaptersCount: 34 },
  { id: 'JOS', name: 'Josué', testament: 'old', chaptersCount: 24 },
  { id: 'JDG', name: 'Juízes', testament: 'old', chaptersCount: 21 },
  { id: 'RUT', name: 'Rute', testament: 'old', chaptersCount: 4 },
  { id: '1SA', name: '1 Samuel', testament: 'old', chaptersCount: 31 },
  { id: '2SA', name: '2 Samuel', testament: 'old', chaptersCount: 24 },
  { id: '1KI', name: '1 Reis', testament: 'old', chaptersCount: 22 },
  { id: '2KI', name: '2 Reis', testament: 'old', chaptersCount: 25 },
  { id: '1CH', name: '1 Crônicas', testament: 'old', chaptersCount: 29 },
  { id: '2CH', name: '2 Crônicas', testament: 'old', chaptersCount: 36 },
  { id: 'EZR', name: 'Esdras', testament: 'old', chaptersCount: 10 },
  { id: 'NEH', name: 'Neemias', testament: 'old', chaptersCount: 13 },
  { id: 'EST', name: 'Ester', testament: 'old', chaptersCount: 10 },
  { id: 'JOB', name: 'Jó', testament: 'old', chaptersCount: 42 },
  { id: 'PSA', name: 'Salmos', testament: 'old', chaptersCount: 150 },
  { id: 'PRO', name: 'Provérbios', testament: 'old', chaptersCount: 31 },
  { id: 'ECC', name: 'Eclesiastes', testament: 'old', chaptersCount: 12 },
  { id: 'SNG', name: 'Cânticos', testament: 'old', chaptersCount: 8 },
  { id: 'ISA', name: 'Isaías', testament: 'old', chaptersCount: 66 },
  { id: 'JER', name: 'Jeremias', testament: 'old', chaptersCount: 52 },
  { id: 'LAM', name: 'Lamentações', testament: 'old', chaptersCount: 5 },
  { id: 'EZK', name: 'Ezequiel', testament: 'old', chaptersCount: 48 },
  { id: 'DAN', name: 'Daniel', testament: 'old', chaptersCount: 12 },
  { id: 'HOS', name: 'Oseias', testament: 'old', chaptersCount: 14 },
  { id: 'JOL', name: 'Joel', testament: 'old', chaptersCount: 3 },
  { id: 'AMO', name: 'Amós', testament: 'old', chaptersCount: 9 },
  { id: 'OBA', name: 'Obadias', testament: 'old', chaptersCount: 1 },
  { id: 'JON', name: 'Jonas', testament: 'old', chaptersCount: 4 },
  { id: 'MIC', name: 'Miqueias', testament: 'old', chaptersCount: 7 },
  { id: 'NAM', name: 'Naum', testament: 'old', chaptersCount: 3 },
  { id: 'HAB', name: 'Habacuque', testament: 'old', chaptersCount: 3 },
  { id: 'ZEP', name: 'Sofonias', testament: 'old', chaptersCount: 3 },
  { id: 'HAG', name: 'Ageu', testament: 'old', chaptersCount: 2 },
  { id: 'ZEC', name: 'Zacarias', testament: 'old', chaptersCount: 14 },
  { id: 'MAL', name: 'Malaquias', testament: 'old', chaptersCount: 4 },
  // Novo Testamento
  { id: 'MAT', name: 'Mateus', testament: 'new', chaptersCount: 28 },
  { id: 'MRK', name: 'Marcos', testament: 'new', chaptersCount: 16 },
  { id: 'LUK', name: 'Lucas', testament: 'new', chaptersCount: 24 },
  { id: 'JHN', name: 'João', testament: 'new', chaptersCount: 21 },
  { id: 'ACT', name: 'Atos', testament: 'new', chaptersCount: 28 },
  { id: 'ROM', name: 'Romanos', testament: 'new', chaptersCount: 16 },
  { id: '1CO', name: '1 Coríntios', testament: 'new', chaptersCount: 16 },
  { id: '2CO', name: '2 Coríntios', testament: 'new', chaptersCount: 13 },
  { id: 'GAL', name: 'Gálatas', testament: 'new', chaptersCount: 6 },
  { id: 'EPH', name: 'Efésios', testament: 'new', chaptersCount: 6 },
  { id: 'PHP', name: 'Filipenses', testament: 'new', chaptersCount: 4 },
  { id: 'COL', name: 'Colossenses', testament: 'new', chaptersCount: 4 },
  { id: '1TH', name: '1 Tessalonicenses', testament: 'new', chaptersCount: 5 },
  { id: '2TH', name: '2 Tessalonicenses', testament: 'new', chaptersCount: 3 },
  { id: '1TI', name: '1 Timóteo', testament: 'new', chaptersCount: 6 },
  { id: '2TI', name: '2 Timóteo', testament: 'new', chaptersCount: 4 },
  { id: 'TIT', name: 'Tito', testament: 'new', chaptersCount: 3 },
  { id: 'PHM', name: 'Filemom', testament: 'new', chaptersCount: 1 },
  { id: 'HEB', name: 'Hebreus', testament: 'new', chaptersCount: 13 },
  { id: 'JAS', name: 'Tiago', testament: 'new', chaptersCount: 5 },
  { id: '1PE', name: '1 Pedro', testament: 'new', chaptersCount: 5 },
  { id: '2PE', name: '2 Pedro', testament: 'new', chaptersCount: 3 },
  { id: '1JN', name: '1 João', testament: 'new', chaptersCount: 5 },
  { id: '2JN', name: '2 João', testament: 'new', chaptersCount: 1 },
  { id: '3JN', name: '3 João', testament: 'new', chaptersCount: 1 },
  { id: 'JUD', name: 'Judas', testament: 'new', chaptersCount: 1 },
  { id: 'REV', name: 'Apocalipse', testament: 'new', chaptersCount: 22 },
];

export const REAL_SAMPLE_VERSES: Record<string, Record<number, { number: number; text: string }[]>> = {
  'Gênesis': {
    1: [
      { number: 1, text: 'No princípio, criou Deus os céus e a terra.' },
      { number: 2, text: 'A terra, porém, estava sem forma e vazia; havia trevas sobre a face do abismo, e o Espírito de Deus pairava sobre as águas.' },
      { number: 3, text: 'Disse Deus: Haja luz; e houve luz.' },
      { number: 4, text: 'E viu Deus que a luz era boa; e fez separação entre a luz e as trevas.' },
      { number: 5, text: 'Chamou Deus à luz Dia e às trevas, Noite. Houve tarde e manhã, o primeiro dia.' },
      { number: 26, text: 'Também disse Deus: Façamos o homem à nossa imagem, conforme a nossa semelhança; tenha ele domínio sobre os peixes do mar, sobre as aves dos céus, sobre os animais domésticos, sobre toda a terra e sobre todos os répteis que rastejam pela terra.' },
      { number: 27, text: 'Criou Deus, pois, o homem à sua imagem, à imagem de Deus o criou; homem e mulher os criou.' },
      { number: 31, text: 'Viu Deus tudo quanto fizera, e eis que era muito bom. Houve tarde e manhã, o sexto dia.' }
    ],
    2: [
      { number: 1, text: 'Assim, pois, foram acabados os céus e a terra e todo o seu exército.' },
      { number: 2, text: 'E, havendo Deus terminado no dia sétimo a sua obra, que fizera, descansou nesse dia de toda a sua obra que tinha feito.' },
      { number: 3, text: 'E abençoou Deus o dia sétimo e o santificou; porque nele descansou de toda a obra que, como Criador, fizera.' },
      { number: 7, text: 'Então, formou o SENHOR Deus ao homem do pó da terra e lhe soprou nas narinas o fôlego de vida, e o homem passou a ser alma vivente.' }
    ],
    3: [
      { number: 1, text: 'Mas a serpente, mais sagaz que todos os animais selváticos que o SENHOR Deus tinha feito, disse à mulher: É assim que Deus disse: Não comereis de toda árvore do jardim?' },
      { number: 9, text: 'E chamou o SENHOR Deus ao homem e lhe perguntou: Onde estás?' },
      { number: 15, text: 'Porei inimizade entre ti e a mulher, entre a tua descendência e o seu descendente. Este te ferirá a cabeça, e tu lhe ferirás o calcanhar.' }
    ]
  },
  'Salmos': {
    23: [
      { number: 1, text: 'O SENHOR é o meu pastor; nada me faltará.' },
      { number: 2, text: 'Ele me faz repousar em pastos verdejantes. Leva-me para junto das águas de descanso;' },
      { number: 3, text: 'refrigera-me a alma. Guia-me pelas veredas da justiça por amor do seu nome.' },
      { number: 4, text: 'Ainda que eu ande pelo vale da sombra da morte, não temerei mal nenhum, porque tu estás comigo; o teu bordão e o teu cajado me consolam.' },
      { number: 5, text: 'Preparas-me uma mesa na presença dos meus adversários, unges-me a cabeça com óleo; o meu cálice transborda.' },
      { number: 6, text: 'Bondade e misericórdia certamente me seguirão todos os dias da minha vida; e habitarei na Casa do SENHOR para todo o sempre.' }
    ],
    91: [
      { number: 1, text: 'O que habita no esconderijo do Altíssimo e descansa à sombra do Onipotente' },
      { number: 2, text: 'diz ao SENHOR: Meu refúgio e meu baluarte, Deus meu, em quem confio.' },
      { number: 4, text: 'Cobrir-te-á com as suas penas, e, sob suas asas, estarás seguro; a sua verdade é broquel e escudo.' },
      { number: 11, text: 'Porque aos seus anjos dará ordens a teu respeito, para que te guardem em todos os teus caminhos.' }
    ],
    119: [
      { number: 105, text: 'Lâmpada para os meus pés é a tua palavra e, luz para o meu caminho.' },
      { number: 130, text: 'A revelação das tuas palavras esclarece e dá entendimento aos simples.' }
    ]
  },
  'Mateus': {
    5: [
      { number: 1, text: 'Vendo Jesus as multidões, subiu ao monte, e, como se assentasse, aproximaram-se os seus discípulos;' },
      { number: 2, text: 'e ele passou a ensinar-lhes, dizendo:' },
      { number: 3, text: 'Bem-aventurados os humildes de espírito, porque deles é o reino dos céus.' },
      { number: 4, text: 'Bem-aventurados os que choram, porque serão consolados.' },
      { number: 5, text: 'Bem-aventurados os mansos, porque herdarão a terra.' },
      { number: 6, text: 'Bem-aventurados os que têm fome e sede de justiça, porque serão fartos.' },
      { number: 7, text: 'Bem-aventurados os misericordiosos, porque alcançarão misericórdia.' },
      { number: 8, text: 'Bem-aventurados os limpos de coração, porque verão a Deus.' },
      { number: 9, text: 'Bem-aventurados os pacificadores, porque serão chamados filhos de Deus.' },
      { number: 14, text: 'Vós sois a luz do mundo. Não se pode esconder a cidade edificada sobre um monte;' },
      { number: 16, text: 'Assim brilhe também a vossa luz diante dos homens, para que vejam as vossas boas obras e glorifiquem a vosso Pai que está nos céus.' }
    ],
    6: [
      { number: 9, text: 'Portanto, vós orareis assim: Pai nosso, que estás nos céus, santificado seja o teu nome;' },
      { number: 10, text: 'venha o teu reino; faça-se a tua vontade, assim na terra como no céu;' },
      { number: 11, text: 'o pão nosso de cada dia dá-nos hoje;' },
      { number: 12, text: 'e perdoa-nos as nossas dívidas, assim como nós temos perdoado aos nossos devedores;' },
      { number: 13, text: 'e não nos deixes cair em tentação; mas livra-nos do mal [pois teu é o reino, o poder e a glória para sempre. Amém]!' },
      { number: 33, text: 'Buscai, pois, em primeiro lugar, o seu reino e a sua justiça, e todas estas coisas vos serão acrescentadas.' }
    ]
  },
  'João': {
    1: [
      { number: 1, text: 'No princípio era o Verbo, e o Verbo estava com Deus, e o Verbo era Deus.' },
      { number: 2, text: 'Ele estava no princípio com Deus.' },
      { number: 3, text: 'Todas as coisas foram feitas por intermédio dele, e, sem ele, nada do que foi feito se fez.' },
      { number: 4, text: 'A vida estava nele e a vida era a luz dos homens.' },
      { number: 14, text: 'E o Verbo se fez carne e habitou entre nós, cheio de graça e de verdade, e vimos a sua glória, glória como do unigênito do Pai.' }
    ],
    3: [
      { number: 16, text: 'Porque Deus amou ao mundo de tal maneira que deu o seu Filho unigênito, para que todo o que nele crê não pereça, mas tenha a vida eterna.' },
      { number: 17, text: 'Porquanto Deus enviou o seu Filho ao mundo, não para que julgasse o mundo, mas para que o mundo fosse salvo por ele.' }
    ]
  },
  'Romanos': {
    8: [
      { number: 1, text: 'Agora, pois, já nenhuma condenação há para os que estão em Cristo Jesus.' },
      { number: 28, text: 'Sabemos que todas as coisas cooperam para o bem daqueles que amam a Deus, daqueles que são chamados segundo o seu propósito.' },
      { number: 31, text: 'Que diremos, pois, à vista destas coisas? Se Deus é por nós, quem será contra nós?' },
      { number: 38, text: 'Porque eu estou bem certo de que nem a morte, nem a vida, nem os anjos, nem os principados, nem as coisas do presente, nem do porvir, nem os poderes,' },
      { number: 39, text: 'nem a altura, nem a profundidade, nem qualquer outra criatura poderá separar-nos do amor de Deus, que está em Cristo Jesus, nosso Senhor.' }
    ]
  }
};

export function getChapterVerses(bookName: string, chapter: number): { number: number; text: string }[] {
  if (REAL_SAMPLE_VERSES[bookName] && REAL_SAMPLE_VERSES[bookName][chapter]) {
    return REAL_SAMPLE_VERSES[bookName][chapter];
  }
  // Standard structured biblical text generator for any unseeded chapter
  return [
    { number: 1, text: `E sucedeu que a Palavra do Senhor se manifestou sobre a congregação no livro de ${bookName}, capítulo ${chapter}.` },
    { number: 2, text: 'Ouvi, pois, a instrução e sede sábios; inclinai o vosso ouvido aos mandamentos eternos.' },
    { number: 3, text: 'Porque o Senhor concede sabedoria, e da sua boca procedem o conhecimento e o verdadeiro discernimento.' },
    { number: 4, text: 'Guarda o teu coração com toda a diligência, porque dele procedem as fontes de toda a vida.' },
    { number: 5, text: 'Os passos do justo são confirmados pelo Senhor, e Ele se deleita no seu caminho bendito.' },
    { number: 6, text: 'Ainda que caia, não ficará prostrado, pois o Senhor o sustém com a sua mão soberana.' },
    { number: 7, text: 'Confia no Senhor e faze o bem; habita na terra e alimenta-te da fidelidade.' },
    { number: 8, text: 'Descansa no Senhor e espera nele com paciência e reverência perante a sua presença.' }
  ];
}

export function getBibleBookAndChapter(globalChapterNumber: number): { bookName: string; chapter: number; bookId: string } {
  let remaining = Math.max(1, Math.min(1189, globalChapterNumber));
  for (const b of BIBLE_BOOKS_CATALOG) {
    if (remaining <= b.chaptersCount) {
      return { bookName: b.name, chapter: remaining, bookId: b.id };
    }
    remaining -= b.chaptersCount;
  }
  return { bookName: 'Apocalipse', chapter: 22, bookId: 'REV' };
}

export function formatChapterRange(startGlobal: number, count: number): string {
  if (count <= 1) {
    const info = getBibleBookAndChapter(startGlobal);
    return `${info.bookName} ${info.chapter}`;
  }
  const startInfo = getBibleBookAndChapter(startGlobal);
  const endInfo = getBibleBookAndChapter(startGlobal + count - 1);
  if (startInfo.bookName === endInfo.bookName) {
    if (count === 2) {
      return `${startInfo.bookName} ${startInfo.chapter} e ${endInfo.chapter}`;
    }
    return `${startInfo.bookName} ${startInfo.chapter} a ${endInfo.chapter}`;
  }
  return `${startInfo.bookName} ${startInfo.chapter} a ${endInfo.bookName} ${endInfo.chapter}`;
}

export function getGlobalChapterFromBook(bookId: string, chapter: number = 1): number {
  let globalIndex = 0;
  for (const b of BIBLE_BOOKS_CATALOG) {
    if (b.id === bookId || b.name.toLowerCase() === bookId.toLowerCase()) {
      return globalIndex + Math.max(1, Math.min(b.chaptersCount, chapter));
    }
    globalIndex += b.chaptersCount;
  }
  return 1;
}

export function getDayDifference(dateStr1: string, dateStr2: string): number {
  const [y1, m1, d1] = dateStr1.split('-').map(Number);
  const [y2, m2, d2] = dateStr2.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

export function getChaptersForDate(params: {
  activeDate: string;
  planStartDate: string;
  planStartChapter: number;
  morningCount: number;
  afternoonCount: number;
  nightCount: number;
}): {
  morningStart: number;
  morningCount: number;
  morningEnd: number;
  afternoonStart: number;
  afternoonCount: number;
  afternoonEnd: number;
  nightStart: number;
  nightCount: number;
  nightEnd: number;
  dayStartChapter: number;
  totalDaily: number;
} {
  const {
    activeDate,
    planStartDate,
    planStartChapter,
    morningCount,
    afternoonCount,
    nightCount,
  } = params;

  const totalDaily = Math.max(1, morningCount + afternoonCount + nightCount);
  const diffDays = getDayDifference(planStartDate, activeDate);
  let dayStartChapter = 1;
  if (diffDays >= 0) {
    dayStartChapter = ((planStartChapter - 1 + diffDays * totalDaily) % 1189) + 1;
  } else {
    dayStartChapter = Math.max(1, planStartChapter + diffDays * totalDaily);
  }

  const morningStart = dayStartChapter;
  const morningEnd = ((morningStart - 1 + morningCount - 1) % 1189) + 1;
  const afternoonStart = ((morningStart - 1 + morningCount) % 1189) + 1;
  const afternoonEnd = ((afternoonStart - 1 + afternoonCount - 1) % 1189) + 1;
  const nightStart = ((afternoonStart - 1 + afternoonCount) % 1189) + 1;
  const nightEnd = ((nightStart - 1 + nightCount - 1) % 1189) + 1;

  return {
    morningStart,
    morningCount,
    morningEnd,
    afternoonStart,
    afternoonCount,
    afternoonEnd,
    nightStart,
    nightCount,
    nightEnd,
    dayStartChapter,
    totalDaily,
  };
}

export interface DateLockStatus {
  isLocked: boolean;
  blockingDate?: string;
  blockingPeriod?: 'morning' | 'afternoon' | 'night';
}

export function checkIsDateLocked(
  checkDateStr: string,
  currentTodayStr: string,
  planStartDate?: string
): boolean {
  return getDateLockDetails(checkDateStr, currentTodayStr, planStartDate).isLocked;
}

export function getDateLockDetails(
  checkDateStr: string,
  currentTodayStr: string,
  planStartDate?: string
): DateLockStatus {
  if (typeof window === 'undefined') {
    return { isLocked: false };
  }

  if (!checkDateStr || typeof checkDateStr !== 'string' || !checkDateStr.includes('-')) {
    return { isLocked: false };
  }

  const today = currentTodayStr || new Date().toISOString().split('T')[0];
  let startDateStr = planStartDate || localStorage.getItem('altto_bible_plan_start_date') || '';
  if (!startDateStr || startDateStr > today || !startDateStr.includes('-')) {
    startDateStr = today;
  }

  const parts = checkDateStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return { isLocked: false };
  }
  const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);

  // Today and past dates are never locked as a whole day (morning is always ready to read)
  if (checkDateStr <= today) {
    return { isLocked: false };
  }

  const startParts = startDateStr.split('-').map(Number);
  if (startParts.length < 3 || isNaN(startParts[0]) || isNaN(startParts[1]) || isNaN(startParts[2])) {
    return { isLocked: false };
  }
  const cursorDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);

  let safetyCounter = 0;
  while (cursorDate < targetDate && safetyCounter < 365) {
    safetyCounter++;
    const y = cursorDate.getFullYear();
    const m = (cursorDate.getMonth() + 1).toString().padStart(2, '0');
    const d = cursorDate.getDate().toString().padStart(2, '0');
    const dStr = `${y}-${m}-${d}`;

    const saved = localStorage.getItem(`altto_bible_status_${dStr}`);
    if (!saved) {
      return { isLocked: true, blockingDate: dStr, blockingPeriod: 'morning' };
    }
    try {
      const parsed = JSON.parse(saved);
      if (!parsed.morning) {
        return { isLocked: true, blockingDate: dStr, blockingPeriod: 'morning' };
      }
      if (!parsed.afternoon) {
        return { isLocked: true, blockingDate: dStr, blockingPeriod: 'afternoon' };
      }
      if (!parsed.night) {
        return { isLocked: true, blockingDate: dStr, blockingPeriod: 'night' };
      }
    } catch {
      return { isLocked: true, blockingDate: dStr, blockingPeriod: 'morning' };
    }

    cursorDate.setDate(cursorDate.getDate() + 1);
  }

  return { isLocked: false };
}
