import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GermanNoun, Folder } from '../types';
import nounsData from '../data/nouns.json';
import {
  initializeRevenueCat,
  presentRevenueCatPaywall,
  purchasePlan,
  restoreRevenueCatPurchases,
  syncSubscriptionStatus,
} from '../services/revenuecat';

const BUNDLED_NOUNS: GermanNoun[] = nounsData as GermanNoun[];

const KEYS = {
  favorites: '@derdiadas_favorites',
  learned: '@derdiadas_learned',
  recentlyViewed: '@derdiadas_recent',
  customNouns: '@derdiadas_custom_nouns',
  quizStats: '@derdiadas_quiz_stats',
  folders: '@derdiadas_folders',
  streak: '@derdiadas_streak',
  performance: '@derdiadas_performance',
  aiLookupCount: '@derdiadas_ai_lookup_count',
  subscriptionPlan: '@derdiadas_subscription_plan',
};

export interface QuizStats {
  total: number;
  correct: number;
  bestStreak: number;
  currentStreak: number;
}

export interface Streak {
  current: number;
  best: number;
  lastDate: string; // "YYYY-M-D"
}

export interface NounPerf {
  c: number;        // total correct
  w: number;        // total wrong
  t: number;        // last seen (ms timestamp)
  interval: number; // days until next review (0 = due now)
  due: number;      // when due (ms timestamp)
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Interval-based weighted shuffle for spaced repetition.
 *
 * Weight logic:
 *   - Never seen          → 10  (highest priority)
 *   - Overdue             → 5 + min(daysOverdue, 10)  (max 15)
 *   - Due today           → 5
 *   - Not yet due         → 0.1  (very low; kept in pool so the session can still fill)
 */
export function weightedShuffle(nouns: GermanNoun[], perf: Record<string, NounPerf>): GermanNoun[] {
  const now = Date.now();
  const DAY = 86_400_000;

  const weighted = nouns.map((n) => {
    const p = perf[`${n.noun}::${n.article}`];
    let w: number;
    if (!p) {
      w = 10;
    } else {
      const overdueByDays = (now - (p.due ?? 0)) / DAY;
      if (overdueByDays >= 0) {
        w = 5 + Math.min(overdueByDays, 10);
      } else {
        w = 0.1; // not yet due — very rarely sampled
      }
    }
    return { n, w };
  });

  const result: GermanNoun[] = [];
  const pool = [...weighted];
  while (pool.length > 0) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) { idx = i; break; }
    }
    result.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return result;
}

interface AppContextType {
  isReady: boolean;
  aiLookupCount: number;
  remainingFreeLookups: number;
  isSubscribed: boolean;
  subscriptionPlan: 'monthly' | 'yearly' | null;
  canUseAiLookup: () => boolean;
  consumeAiLookup: () => boolean;
  presentSubscriptionPaywall: () => Promise<boolean>;
  purchaseSubscription: (plan: 'monthly' | 'yearly') => Promise<boolean>;
  restoreSubscription: () => Promise<boolean>;
  favorites: GermanNoun[];
  isFavorite: (noun: string, article: string) => boolean;
  toggleFavorite: (item: GermanNoun) => void;

  learnedKeys: Set<string>;
  isLearned: (noun: string, article: string) => boolean;
  toggleLearned: (item: GermanNoun) => void;

  recentlyViewed: GermanNoun[];
  addRecentlyViewed: (item: GermanNoun) => void;

  customNouns: GermanNoun[];
  addCustomNoun: (noun: GermanNoun) => void;
  findCustomNoun: (query: string) => GermanNoun[];

  quizStats: QuizStats;
  recordQuizAnswer: (wasCorrect: boolean) => void;
  resetQuizStreak: () => void;

  folders: Folder[];
  createFolder: (name: string, color: string) => Folder;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  addNounToFolder: (folderId: string, noun: GermanNoun) => void;
  removeNounFromFolder: (folderId: string, noun: GermanNoun) => void;
  isNounInFolder: (folderId: string, noun: string, article: string) => boolean;
  getNounsInFolder: (folderId: string) => GermanNoun[];
  getFolderIdsForNoun: (noun: string, article: string) => string[];

  folderPickerNoun: GermanNoun | null;
  showFolderPicker: (noun: GermanNoun) => void;
  hideFolderPicker: () => void;

  // Streak
  streak: Streak;
  recordAppOpen: () => void;

  // Per-noun performance
  quizPerformance: Record<string, NounPerf>;
  updateNounPerformance: (noun: GermanNoun, correct: boolean) => void;
  getSpacedRepNouns: (pool: GermanNoun[]) => GermanNoun[];
}

const AppContext = createContext<AppContextType | null>(null);
const FREE_LOOKUPS = 10;

function withFallbackExamples(noun: GermanNoun): GermanNoun {
  const hasExample = Boolean(noun.example && noun.example.trim());
  const hasExampleEn = Boolean(noun.exampleEn && noun.exampleEn.trim());
  if (hasExample && hasExampleEn) return noun;

  const english = noun.english?.trim() || noun.noun;
  return {
    ...noun,
    example: hasExample ? noun.example : `${noun.article} ${noun.noun} ist wichtig.`,
    exampleEn: hasExampleEn ? noun.exampleEn : `The ${english} is important.`,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [aiLookupCount, setAiLookupCount] = useState(0);
  const [subscriptionPlan, setSubscriptionPlan] = useState<'monthly' | 'yearly' | null>(null);
  const [favorites, setFavorites] = useState<GermanNoun[]>([]);
  const [learnedKeys, setLearnedKeys] = useState<Set<string>>(new Set());
  const [recentlyViewed, setRecentlyViewed] = useState<GermanNoun[]>([]);
  const [customNouns, setCustomNouns] = useState<GermanNoun[]>([]);
  const [quizStats, setQuizStats] = useState<QuizStats>({ total: 0, correct: 0, bestStreak: 0, currentStreak: 0 });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPickerNoun, setFolderPickerNoun] = useState<GermanNoun | null>(null);
  const [streak, setStreak] = useState<Streak>({ current: 0, best: 0, lastDate: '' });
  const [quizPerformance, setQuizPerformance] = useState<Record<string, NounPerf>>({});

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(KEYS.favorites),
      AsyncStorage.getItem(KEYS.learned),
      AsyncStorage.getItem(KEYS.recentlyViewed),
      AsyncStorage.getItem(KEYS.customNouns),
      AsyncStorage.getItem(KEYS.quizStats),
      AsyncStorage.getItem(KEYS.folders),
      AsyncStorage.getItem(KEYS.streak),
      AsyncStorage.getItem(KEYS.performance),
      AsyncStorage.getItem(KEYS.aiLookupCount),
      AsyncStorage.getItem(KEYS.subscriptionPlan),
    ]).then(([fav, learned, recent, custom, quiz, folds, strk, perf, aiCount, subPlan]) => {
      if (fav) try { setFavorites(JSON.parse(fav)); } catch {}
      if (learned) try { setLearnedKeys(new Set(JSON.parse(learned))); } catch {}
      if (recent) try { setRecentlyViewed(JSON.parse(recent)); } catch {}
      if (custom) {
        try {
          const parsed = JSON.parse(custom) as GermanNoun[];
          const normalized = parsed.map(withFallbackExamples);
          setCustomNouns(normalized);
          AsyncStorage.setItem(KEYS.customNouns, JSON.stringify(normalized));
        } catch {}
      }
      if (quiz) try { setQuizStats(JSON.parse(quiz)); } catch {}
      if (folds) try { setFolders(JSON.parse(folds)); } catch {}
      if (strk) try { setStreak(JSON.parse(strk)); } catch {}
      if (perf) try { setQuizPerformance(JSON.parse(perf)); } catch {}
      if (aiCount) try { setAiLookupCount(Number(JSON.parse(aiCount))); } catch {}
      if (subPlan) try {
        const parsed = JSON.parse(subPlan);
        if (parsed === 'monthly' || parsed === 'yearly') setSubscriptionPlan(parsed);
      } catch {}

      // Try syncing real subscription state from RevenueCat.
      // If active, keep plan from storage or default to monthly label.
      initializeRevenueCat()
        .then(() => syncSubscriptionStatus())
        .then((active) => {
          if (active) {
            setSubscriptionPlan((prev) => {
              const next = prev ?? 'monthly';
              AsyncStorage.setItem(KEYS.subscriptionPlan, JSON.stringify(next));
              return next;
            });
          }
        })
        .finally(() => setIsReady(true));
    });
  }, []);

  // ── Monetization ────────────────────────────────────────────────────────
  const isSubscribed = subscriptionPlan !== null;
  const remainingFreeLookups = Math.max(0, FREE_LOOKUPS - aiLookupCount);
  const canUseAiLookup = useCallback(() => isSubscribed || aiLookupCount < FREE_LOOKUPS, [isSubscribed, aiLookupCount]);
  const consumeAiLookup = useCallback(() => {
    if (isSubscribed) return true;
    if (aiLookupCount >= FREE_LOOKUPS) return false;
    setAiLookupCount((prev) => {
      const next = prev + 1;
      AsyncStorage.setItem(KEYS.aiLookupCount, JSON.stringify(next));
      return next;
    });
    return true;
  }, [isSubscribed, aiLookupCount]);
  const purchaseSubscription = useCallback(async (plan: 'monthly' | 'yearly') => {
    const success = await purchasePlan(plan);
    if (!success) return false;
    setSubscriptionPlan(plan);
    AsyncStorage.setItem(KEYS.subscriptionPlan, JSON.stringify(plan));
    return true;
  }, []);
  const presentSubscriptionPaywall = useCallback(async () => {
    const success = await presentRevenueCatPaywall();
    if (!success) return false;
    const active = await syncSubscriptionStatus();
    if (!active) return false;
    setSubscriptionPlan((prev) => {
      const next = prev ?? 'monthly';
      AsyncStorage.setItem(KEYS.subscriptionPlan, JSON.stringify(next));
      return next;
    });
    return true;
  }, []);
  const restoreSubscription = useCallback(async () => {
    const success = await restoreRevenueCatPurchases();
    if (!success) return false;
    setSubscriptionPlan((prev) => {
      const next = prev ?? 'monthly';
      AsyncStorage.setItem(KEYS.subscriptionPlan, JSON.stringify(next));
      return next;
    });
    return true;
  }, []);

  // ── Favorites ──────────────────────────────────────────────────────────
  const isFavorite = useCallback(
    (noun: string, article: string) => favorites.some((f) => f.noun === noun && f.article === article),
    [favorites]
  );
  const toggleFavorite = useCallback((item: GermanNoun) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.noun === item.noun && f.article === item.article);
      const next = exists ? prev.filter((f) => !(f.noun === item.noun && f.article === item.article)) : [...prev, item];
      AsyncStorage.setItem(KEYS.favorites, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Learned ────────────────────────────────────────────────────────────
  const isLearned = useCallback(
    (noun: string, article: string) => learnedKeys.has(`${noun}::${article}`),
    [learnedKeys]
  );
  const toggleLearned = useCallback((item: GermanNoun) => {
    setLearnedKeys((prev) => {
      const key = `${item.noun}::${item.article}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      AsyncStorage.setItem(KEYS.learned, JSON.stringify([...next]));
      return next;
    });
  }, []);

  // ── Recently viewed ────────────────────────────────────────────────────
  const addRecentlyViewed = useCallback((item: GermanNoun) => {
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((n) => !(n.noun === item.noun && n.article === item.article));
      const next = [item, ...filtered].slice(0, 20);
      AsyncStorage.setItem(KEYS.recentlyViewed, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Custom nouns ───────────────────────────────────────────────────────
  const addCustomNoun = useCallback((noun: GermanNoun) => {
    setCustomNouns((prev) => {
      const normalized = withFallbackExamples(noun);
      if (prev.some((n) => n.noun.toLowerCase() === normalized.noun.toLowerCase() && n.article === normalized.article)) return prev;
      const next = [...prev, normalized];
      AsyncStorage.setItem(KEYS.customNouns, JSON.stringify(next));
      return next;
    });
  }, []);
  const findCustomNoun = useCallback(
    (query: string) => customNouns.filter((n) => n.noun.toLowerCase().startsWith(query.toLowerCase())),
    [customNouns]
  );

  // ── Quiz stats ─────────────────────────────────────────────────────────
  const recordQuizAnswer = useCallback((wasCorrect: boolean) => {
    setQuizStats((prev) => {
      const newStreak = wasCorrect ? prev.currentStreak + 1 : 0;
      const next: QuizStats = {
        total: prev.total + 1,
        correct: wasCorrect ? prev.correct + 1 : prev.correct,
        bestStreak: Math.max(prev.bestStreak, newStreak),
        currentStreak: newStreak,
      };
      AsyncStorage.setItem(KEYS.quizStats, JSON.stringify(next));
      return next;
    });
  }, []);
  const resetQuizStreak = useCallback(() => {
    setQuizStats((prev) => {
      const next = { ...prev, currentStreak: 0 };
      AsyncStorage.setItem(KEYS.quizStats, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Folders ────────────────────────────────────────────────────────────
  const createFolder = useCallback((name: string, color: string): Folder => {
    const folder: Folder = { id: Date.now().toString(), name, color, nounKeys: [] };
    setFolders((prev) => {
      const next = [...prev, folder];
      AsyncStorage.setItem(KEYS.folders, JSON.stringify(next));
      return next;
    });
    return folder;
  }, []);
  const deleteFolder = useCallback((id: string) => {
    setFolders((prev) => {
      const next = prev.filter((f) => f.id !== id);
      AsyncStorage.setItem(KEYS.folders, JSON.stringify(next));
      return next;
    });
  }, []);
  const renameFolder = useCallback((id: string, name: string) => {
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, name } : f));
      AsyncStorage.setItem(KEYS.folders, JSON.stringify(next));
      return next;
    });
  }, []);
  const addNounToFolder = useCallback((folderId: string, noun: GermanNoun) => {
    const key = `${noun.noun}::${noun.article}`;
    setFolders((prev) => {
      const next = prev.map((f) => {
        if (f.id !== folderId || f.nounKeys.includes(key)) return f;
        return { ...f, nounKeys: [...f.nounKeys, key] };
      });
      AsyncStorage.setItem(KEYS.folders, JSON.stringify(next));
      return next;
    });
  }, []);
  const removeNounFromFolder = useCallback((folderId: string, noun: GermanNoun) => {
    const key = `${noun.noun}::${noun.article}`;
    setFolders((prev) => {
      const next = prev.map((f) =>
        f.id === folderId ? { ...f, nounKeys: f.nounKeys.filter((k) => k !== key) } : f
      );
      AsyncStorage.setItem(KEYS.folders, JSON.stringify(next));
      return next;
    });
  }, []);
  const isNounInFolder = useCallback(
    (folderId: string, noun: string, article: string) =>
      folders.find((f) => f.id === folderId)?.nounKeys.includes(`${noun}::${article}`) ?? false,
    [folders]
  );
  const getNounsInFolder = useCallback(
    (folderId: string): GermanNoun[] => {
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return [];
      const allNouns = [...customNouns, ...BUNDLED_NOUNS];
      return folder.nounKeys.map((key) => {
        const sep = key.lastIndexOf('::');
        const noun = key.slice(0, sep);
        const article = key.slice(sep + 2);
        return allNouns.find((n) => n.noun === noun && n.article === article);
      }).filter((n): n is GermanNoun => n !== undefined);
    },
    [folders, customNouns]
  );
  const getFolderIdsForNoun = useCallback(
    (noun: string, article: string) =>
      folders.filter((f) => f.nounKeys.includes(`${noun}::${article}`)).map((f) => f.id),
    [folders]
  );

  // ── Folder picker ──────────────────────────────────────────────────────
  const showFolderPicker = useCallback((noun: GermanNoun) => setFolderPickerNoun(noun), []);
  const hideFolderPicker = useCallback(() => setFolderPickerNoun(null), []);

  // ── Streak ─────────────────────────────────────────────────────────────
  const recordAppOpen = useCallback(() => {
    setStreak((prev) => {
      const today = todayStr();
      if (prev.lastDate === today) return prev; // already recorded today
      const newCurrent = prev.lastDate === yesterdayStr() ? prev.current + 1 : 1;
      const next: Streak = { current: newCurrent, best: Math.max(prev.best, newCurrent), lastDate: today };
      AsyncStorage.setItem(KEYS.streak, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Per-noun quiz performance ──────────────────────────────────────────
  const updateNounPerformance = useCallback((noun: GermanNoun, correct: boolean) => {
    const key = `${noun.noun}::${noun.article}`;
    setQuizPerformance((prev) => {
      const now = Date.now();
      const DAY = 86_400_000;
      const existing = prev[key] ?? { c: 0, w: 0, t: 0, interval: 0, due: 0 };
      // Correct: double the interval (1 → 2 → 4 → 8 … days, capped at 60)
      // Wrong:   reset interval to 0 so the word is due immediately next session
      const newInterval = correct
        ? existing.interval === 0 ? 1 : Math.min(existing.interval * 2, 60)
        : 0;
      const newDue = correct ? now + newInterval * DAY : now;
      const next = {
        ...prev,
        [key]: {
          c: existing.c + (correct ? 1 : 0),
          w: existing.w + (correct ? 0 : 1),
          t: now,
          interval: newInterval,
          due: newDue,
        },
      };
      AsyncStorage.setItem(KEYS.performance, JSON.stringify(next));
      return next;
    });
  }, []);

  const getSpacedRepNouns = useCallback(
    (pool: GermanNoun[]) => weightedShuffle(pool, quizPerformance),
    [quizPerformance]
  );

  return (
    <AppContext.Provider value={{
      isReady,
      aiLookupCount,
      remainingFreeLookups,
      isSubscribed,
      subscriptionPlan,
      canUseAiLookup,
      consumeAiLookup,
      presentSubscriptionPaywall,
      purchaseSubscription,
      restoreSubscription,
      favorites, isFavorite, toggleFavorite,
      learnedKeys, isLearned, toggleLearned,
      recentlyViewed, addRecentlyViewed,
      customNouns, addCustomNoun, findCustomNoun,
      quizStats, recordQuizAnswer, resetQuizStreak,
      folders, createFolder, deleteFolder, renameFolder,
      addNounToFolder, removeNounFromFolder, isNounInFolder,
      getNounsInFolder, getFolderIdsForNoun,
      folderPickerNoun, showFolderPicker, hideFolderPicker,
      streak, recordAppOpen,
      quizPerformance, updateNounPerformance, getSpacedRepNouns,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
