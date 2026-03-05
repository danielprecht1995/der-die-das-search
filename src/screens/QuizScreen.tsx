import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, ScrollView,
  PanResponder, Modal, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { useAppContext } from '../context/AppContext';
import nounsData from '../data/nouns.json';
import type { GermanNoun, Article } from '../types';

const ALL_NOUNS: GermanNoun[] = nounsData as GermanNoun[];
const ARTICLES: Article[] = ['der', 'die', 'das'];
const DAILY_COUNT = 10;
const SESSION_SIZE = 10; // non-daily modes checkpoint every N questions

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function getDailyNouns(): GermanNoun[] {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const rand = mulberry32(seed);
  const indices: number[] = [];
  while (indices.length < DAILY_COUNT) {
    const idx = Math.floor(rand() * ALL_NOUNS.length);
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices.map((i) => ALL_NOUNS[i]);
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DAY_MS = 86_400_000;

function buildSpacedRepQueue(pool: GermanNoun[], perf: Record<string, { c: number; w: number; due: number }>) {
  const now = Date.now();
  let newCount = 0;

  const due: Array<{ noun: GermanNoun; score: number }> = [];
  const later: Array<{ noun: GermanNoun; score: number }> = [];

  for (const n of pool) {
    const key = `${n.noun}::${n.article}`;
    const p = perf[key];

    if (!p) {
      newCount += 1;
      due.push({ noun: n, score: 1000 });
      continue;
    }

    const dueAt = p.due ?? 0;
    if (dueAt <= now) {
      const overdueDays = Math.max(0, (now - dueAt) / DAY_MS);
      const score = 500 + overdueDays * 8 + (p.w ?? 0) * 2 - (p.c ?? 0);
      due.push({ noun: n, score });
      continue;
    }

    // Weak-but-not-due words still appear later in queue.
    const accuracyPenalty = (p.w + 1) / (p.c + 1);
    const dueSoonBonus = Math.max(0, 1 - (dueAt - now) / (7 * DAY_MS));
    later.push({ noun: n, score: accuracyPenalty + dueSoonBonus });
  }

  due.sort((a, b) => b.score - a.score);
  later.sort((a, b) => b.score - a.score);

  return {
    queue: [...due.map((x) => x.noun), ...later.map((x) => x.noun)],
    dueCount: due.length,
    newCount,
  };
}

type QuizMode = 'menu' | 'daily' | 'free' | 'timed' | 'spaced' | 'category' | 'flashcard';
type AnswerState = 'idle' | 'correct' | 'wrong';
type FlashSide = 'front' | 'back';

// ─────────────────────────────────────────────────────────────────────────────
export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { quizStats, recordQuizAnswer, resetQuizStreak, updateNounPerformance,
    quizPerformance, folders, getNounsInFolder, streak, favorites } = useAppContext();

  // ── shared quiz state ──────────────────────────────────────────────────
  const [mode, setMode] = useState<QuizMode>('menu');
  const [nouns, setNouns] = useState<GermanNoun[]>([]);
  const [index, setIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [selected, setSelected] = useState<Article | null>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<GermanNoun[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [isDaily, setIsDaily] = useState(false);
  const [spacedDueCount, setSpacedDueCount] = useState(0);
  const [spacedNewCount, setSpacedNewCount] = useState(0);

  // ── timed mode ─────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(5);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const TIMED_SECS = 5;

  // ── pool selector ──────────────────────────────────────────────────────
  const [poolMode, setPoolMode] = useState<'saved' | 'all'>('saved');

  // ── category picker ─────────────────────────────────────────────────────
  const [categoryModal, setCategoryModal] = useState(false);

  // ── flashcard state ────────────────────────────────────────────────────
  const [flashSide, setFlashSide] = useState<FlashSide>('front');
  const [flashCorrect, setFlashCorrect] = useState(0);
  const [flashTotal, setFlashTotal] = useState(0);
  const panX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Mutable refs so PanResponder callbacks always see current values
  const flashSideRef = useRef(flashSide);
  const indexRef = useRef(0);
  const nounsRef = useRef<GermanNoun[]>([]);
  useEffect(() => { flashSideRef.current = flashSide; }, [flashSide]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { nounsRef.current = nouns; }, [nouns]);

  // The pool used by quiz modes (except Daily Challenge which always uses the full DB)
  const activePool: GermanNoun[] = poolMode === 'saved' && favorites.length > 0
    ? favorites
    : ALL_NOUNS;

  const current = nouns[index];
  const spacedStatsPreview = useMemo(
    () => buildSpacedRepQueue(activePool, quizPerformance),
    [activePool, quizPerformance]
  );

  // ── timer logic ────────────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setTimeLeft(TIMED_SECS);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearTimer();
          // time up → wrong
          setAnswerState('wrong');
          setSelected(null);
          setSessionTotal((n) => n + 1);
          setSessionStreak(0);
          if (nouns[index]) {
            setWrongAnswers((prev) => [...prev, nouns[index]]);
            recordQuizAnswer(false);
            updateNounPerformance(nouns[index], false);
          }
          setTimeout(advanceQuestion, 1400);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [clearTimer, index, nouns, recordQuizAnswer, updateNounPerformance]);

  useEffect(() => { return () => clearTimer(); }, [clearTimer]);

  // ── advance ────────────────────────────────────────────────────────────
  const advanceQuestion = useCallback(() => {
    setAnswerState('idle');
    setSelected(null);
    if (mode === 'timed') startTimer();

    const nextIndex = index + 1;
    if (isDaily && nextIndex >= DAILY_COUNT) {
      setShowSummary(true);
      return;
    }
    if (!isDaily && nextIndex > 0 && nextIndex % SESSION_SIZE === 0) {
      setShowSummary(true);
      return;
    }
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    setIndex(nextIndex % nouns.length);
  }, [index, isDaily, mode, nouns.length, fadeAnim, startTimer]);

  // ── answer ─────────────────────────────────────────────────────────────
  const handleAnswer = useCallback((article: Article) => {
    if (answerState !== 'idle' || !current) return;
    clearTimer();
    const correct = article === current.article;
    setSelected(article);
    setAnswerState(correct ? 'correct' : 'wrong');
    setSessionTotal((n) => n + 1);
    if (correct) {
      setSessionCorrect((n) => n + 1);
      setSessionStreak((s) => s + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setSessionStreak(0);
      setWrongAnswers((prev) => [...prev, current]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    recordQuizAnswer(correct);
    updateNounPerformance(current, correct);
    setTimeout(advanceQuestion, correct ? 700 : 1400);
  }, [answerState, current, clearTimer, recordQuizAnswer, updateNounPerformance, advanceQuestion]);

  // ── start helpers ──────────────────────────────────────────────────────
  const resetSession = () => {
    setIndex(0); setAnswerState('idle'); setSelected(null);
    setSessionCorrect(0); setSessionTotal(0); setSessionStreak(0);
    setWrongAnswers([]); setShowSummary(false);
    resetQuizStreak();
  };

  const startMode = useCallback((m: QuizMode, pool: GermanNoun[], daily = false) => {
    resetSession();
    setNouns(pool);
    setIsDaily(daily);
    setMode(m);
    if (m === 'timed') setTimeout(startTimer, 100);
  }, [startTimer]);

  const startDaily = () => startMode('daily', getDailyNouns(), true);
  const startFree = () => startMode('free', shuffle(activePool));
  const startTimed = () => startMode('timed', shuffle(activePool));
  const startSpaced = () => {
    const spaced = buildSpacedRepQueue(activePool, quizPerformance);
    setSpacedDueCount(spaced.dueCount);
    setSpacedNewCount(spaced.newCount);
    startMode('spaced', spaced.queue.length > 0 ? spaced.queue : shuffle(activePool));
  };
  const startCategory = (pool: GermanNoun[]) => { setCategoryModal(false); startMode('category', shuffle(pool)); };
  const startFlashcard = (pool: GermanNoun[]) => {
    resetSession(); setNouns(shuffle(pool)); setFlashSide('front');
    setFlashCorrect(0); setFlashTotal(0); setMode('flashcard');
    panX.setValue(0);
  };

  const gradeFlashcard = useCallback((knew: boolean) => {
    const curr = nounsRef.current[indexRef.current];
    if (!curr) return;

    setFlashCorrect((n) => n + (knew ? 1 : 0));
    setFlashTotal((n) => n + 1);
    updateNounPerformance(curr, knew);
    Haptics.impactAsync(knew ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    panX.setValue(0);
    setFlashSide('front');

    const nextIdx = indexRef.current + 1;
    if (nextIdx >= nounsRef.current.length) {
      setShowSummary(true);
      return;
    }
    setIndex(nextIdx);
  }, [panX, updateNounPerformance]);

  // ── flashcard swipe ────────────────────────────────────────────────────
  // Using refs inside handlers avoids stale-closure issues with useRef(PanResponder.create(...))
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => flashSideRef.current === 'back',
    onMoveShouldSetPanResponder: (_, g) => flashSideRef.current === 'back' && Math.abs(g.dx) > 8,
    onPanResponderMove: Animated.event([null, { dx: panX }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 100) {
        const dir = g.dx > 0 ? 1 : -1;
        Animated.timing(panX, { toValue: dir * 500, duration: 220, useNativeDriver: false }).start(() => {
          gradeFlashcard(dir > 0);
        });
      } else {
        Animated.spring(panX, { toValue: 0, useNativeDriver: false }).start();
      }
    },
  })).current;

  const cardRotate = panX.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-8deg', '0deg', '8deg'] });

  // ─────────────────────────────────────────────────────────────────────────
  // MENU
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'menu') {
    const accuracy = quizStats.total > 0 ? Math.round((quizStats.correct / quizStats.total) * 100) : 0;
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.menuContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
      >
        {/* Header */}
        <View style={styles.menuHeader}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Practice</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Quiz · Flashcards · Spaced rep</Text>
          </View>
          {streak.current > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: theme.card }]}>
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={[styles.streakNum, { color: theme.text }]}>{streak.current}</Text>
            </View>
          )}
        </View>

        {/* Stats strip */}
        <View style={[styles.statsStrip, { backgroundColor: theme.card }]}>
          <StatItem label="Played" value={quizStats.total} theme={theme} />
          <StatItem label="Correct" value={quizStats.correct} theme={theme} />
          <StatItem label="Accuracy" value={`${accuracy}%`} theme={theme} />
          <StatItem label="Best streak" value={quizStats.bestStreak} theme={theme} />
        </View>

        {/* Pool selector */}
        <View style={[styles.poolToggleRow, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={[styles.poolToggleBtn, poolMode === 'saved' && { backgroundColor: theme.background }]}
            onPress={() => setPoolMode('saved')}
          >
            <Text style={[styles.poolToggleLabel, { color: poolMode === 'saved' ? theme.text : theme.textMuted }]}>
              ⭐ Saved{favorites.length > 0 ? ` (${favorites.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.poolToggleBtn, poolMode === 'all' && { backgroundColor: theme.background }]}
            onPress={() => setPoolMode('all')}
          >
            <Text style={[styles.poolToggleLabel, { color: poolMode === 'all' ? theme.text : theme.textMuted }]}>
              📚 All ({ALL_NOUNS.length})
            </Text>
          </TouchableOpacity>
        </View>
        {poolMode === 'saved' && favorites.length === 0 && (
          <Text style={[styles.poolEmptyNote, { color: theme.textMuted }]}>
            No saved words yet — star some nouns in Search to build your practice set. Using full database for now.
          </Text>
        )}

        {/* Quiz modes */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>QUIZ MODES</Text>
        <ModeCard icon="calendar-outline" title="Daily Challenge" desc={`${DAILY_COUNT} nouns · resets at midnight`} color="#1A56DB" onPress={startDaily} preview={getDailyNouns().slice(0, 4).map(n => n.noun)} />
        <ModeCard icon="infinite-outline" title="Free Play" desc={`${activePool.length} words · endless shuffle`} color={theme.card} titleColor={theme.text} descColor={theme.textSecondary} onPress={startFree} />
        <ModeCard icon="timer-outline" title="Timed Mode" desc={`${TIMED_SECS}s per question · speed + accuracy`} color="#D97706" onPress={startTimed} />
        <ModeCard
          icon="analytics-outline"
          title="Spaced Repetition"
          desc={`${spacedStatsPreview.dueCount} due now · ${spacedStatsPreview.newCount} new`}
          color="#059669"
          onPress={startSpaced}
        />
        <ModeCard icon="folder-open-outline" title="Category Quiz" desc="Pick a folder to quiz" color="#DB2777" onPress={() => setCategoryModal(true)} />

        {/* Flashcard modes */}
        <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 8 }]}>FLASHCARDS</Text>
        <ModeCard icon="layers-outline" title={poolMode === 'saved' ? 'Saved Words' : 'All Words'} desc={`${activePool.length} cards · swipe right = know it`} color="#0891B2" onPress={() => startFlashcard(activePool)} />
        <ModeCard icon="star-outline" title="Starred Words" desc="Your favorites only" color={theme.card} titleColor={theme.text} descColor={theme.textSecondary} onPress={() => startFlashcard(favorites.length ? favorites : ALL_NOUNS)} />
        {folders.slice(0, 3).map(f => (
          <ModeCard key={f.id} icon="folder-outline" title={f.name} desc={`${f.nounKeys.length} words`} color={f.color} onPress={() => startFlashcard(getNounsInFolder(f.id))} />
        ))}

        {/* Category picker modal */}
        <CategoryModal
          visible={categoryModal}
          folders={folders}
          getNounsInFolder={getNounsInFolder}
          theme={theme}
          onClose={() => setCategoryModal(false)}
          onStart={startCategory}
        />
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  if (showSummary) {
    const total = isDaily ? DAILY_COUNT : SESSION_SIZE;
    const pct = Math.round((sessionCorrect / Math.max(1, sessionTotal)) * 100);
    // Deduplicate wrong answers by noun::article
    const uniqueWrong = wrongAnswers.filter(
      (n, i, arr) => arr.findIndex((x) => x.noun === n.noun && x.article === n.article) === i
    );
    return (
      <View style={[styles.container, styles.summaryWrap, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <Text style={{ fontSize: 56, marginBottom: 12 }}>{pct >= 80 ? '🏆' : pct >= 50 ? '🎯' : '📚'}</Text>
        <Text style={[styles.summaryTitle, { color: theme.text }]}>
          {isDaily ? 'Daily complete!' : 'Session done!'}
        </Text>
        <Text style={[styles.summaryScore, { color: theme.textSecondary }]}>
          {sessionCorrect} / {sessionTotal} correct  ({pct}%)
        </Text>
        {uniqueWrong.length > 0 && (
          <View style={[styles.wrongList, { backgroundColor: theme.card }]}>
            <Text style={[styles.wrongTitle, { color: theme.textMuted }]}>REVIEW WRONG ANSWERS</Text>
            {uniqueWrong.slice(0, 6).map((n) => (
              <View key={`${n.noun}::${n.article}`} style={styles.wrongRow}>
                <View style={[styles.wrongBadge, { backgroundColor: theme.articles[n.article].badge }]}>
                  <Text style={styles.wrongBadgeText}>{n.article}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wrongNoun, { color: theme.text }]}>{n.noun}</Text>
                  <Text style={[styles.wrongEn, { color: theme.textMuted }]}>{n.english}</Text>
                </View>
              </View>
            ))}
            {uniqueWrong.length > 6 && (
              <Text style={[styles.wrongMore, { color: theme.textMuted }]}>+{uniqueWrong.length - 6} more</Text>
            )}
          </View>
        )}
        <View style={styles.summaryBtns}>
          {uniqueWrong.length > 0 && (
            <TouchableOpacity
              style={[styles.summaryBtn, { backgroundColor: '#D97706' }]}
              onPress={() => startMode('free', shuffle(uniqueWrong))}
            >
              <Text style={styles.summaryBtnText}>Practice mistakes</Text>
            </TouchableOpacity>
          )}
          {!isDaily && (
            <TouchableOpacity
              style={[styles.summaryBtn, { backgroundColor: '#1A56DB' }]}
              onPress={() => { setShowSummary(false); setWrongAnswers([]); setSessionCorrect(0); setSessionTotal(0); }}
            >
              <Text style={styles.summaryBtnText}>Continue</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.summaryBtn, { backgroundColor: theme.card }]}
            onPress={() => { setMode('menu'); setShowSummary(false); }}
          >
            <Text style={[styles.summaryBtnText, { color: theme.text }]}>Menu</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLASHCARD MODE
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'flashcard') {
    if (!current) return null;
    const ac = theme.articles[current.article];
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        {/* Top bar */}
        <View style={styles.quizTopBar}>
          <TouchableOpacity onPress={() => setMode('menu')} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.progressText, { color: theme.textSecondary }]}>
            {index + 1} / {nouns.length}  ·  ✓ {flashCorrect}
          </Text>
        </View>
        <Text style={[styles.flashInstruction, { color: theme.textMuted }]}>
          {flashSide === 'front' ? 'What is the article?' : 'Swipe  ✓ right  ✗ left'}
        </Text>

        {/* Card */}
        <View style={styles.flashCardArea}>
          {/* Swipe hints */}
          <Animated.View style={[styles.swipeHint, styles.swipeLeft, {
            opacity: panX.interpolate({ inputRange: [-150, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
          }]}>
            <Text style={styles.swipeHintText}>✗</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeHint, styles.swipeRight, {
            opacity: panX.interpolate({ inputRange: [0, 150], outputRange: [0, 1], extrapolate: 'clamp' }),
          }]}>
            <Text style={styles.swipeHintText}>✓</Text>
          </Animated.View>

          <Animated.View
            style={[styles.flashCard, { backgroundColor: theme.card, transform: [{ translateX: panX }, { rotate: cardRotate }] }]}
            {...panResponder.panHandlers}
          >
            {flashSide === 'front' ? (
              <TouchableOpacity style={styles.flashCardInner} onPress={() => setFlashSide('back')} activeOpacity={0.9}>
                <Text style={[styles.flashNoun, { color: theme.text }]}>{current.noun}</Text>
                <Text style={[styles.flashHint, { color: theme.textMuted }]}>Tap to reveal</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.flashCardInner}>
                <View style={[styles.flashBadge, { backgroundColor: ac.badge }]}>
                  <Text style={styles.flashBadgeText}>{current.article}</Text>
                </View>
                <Text style={[styles.flashNoun, { color: ac.text }]}>{current.noun}</Text>
                <Text style={[styles.flashPlural, { color: theme.textSecondary }]}>Pl: {current.plural}</Text>
                <Text style={[styles.flashEnglish, { color: theme.textSecondary }]}>{current.english}</Text>
                {current.example ? (
                  <Text style={[styles.flashExample, { color: theme.textMuted }]} numberOfLines={3}>
                    „{current.example}"
                  </Text>
                ) : null}
              </View>
            )}
          </Animated.View>
        </View>
        {flashSide === 'back' && (
          <View style={styles.flashActions}>
            <TouchableOpacity
              style={[styles.flashActionBtn, { backgroundColor: '#E11D48' }]}
              onPress={() => gradeFlashcard(false)}
              activeOpacity={0.9}
            >
              <Text style={styles.flashActionText}>Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.flashActionBtn, { backgroundColor: '#059669' }]}
              onPress={() => gradeFlashcard(true)}
              activeOpacity={0.9}
            >
              <Text style={styles.flashActionText}>I knew it</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUIZ GAME (all other modes)
  // ─────────────────────────────────────────────────────────────────────────
  if (!current) return null;
  const isTimed = mode === 'timed';
  const isSpaced = mode === 'spaced';
  const progress = isDaily ? `${index + 1} / ${DAILY_COUNT}` : `${sessionCorrect} correct`;

  const btnBg = (article: Article) => {
    const ac = theme.articles[article];
    if (answerState === 'idle') return { backgroundColor: ac.bg, borderColor: ac.badge };
    if (article === current.article) return { backgroundColor: theme.correctBg, borderColor: theme.correct };
    if (article === selected && answerState === 'wrong') return { backgroundColor: theme.incorrectBg, borderColor: theme.incorrect };
    return { backgroundColor: theme.card, borderColor: theme.border };
  };
  const btnTextColor = (article: Article) => {
    if (answerState === 'idle') return theme.articles[article].text;
    if (article === current.article) return theme.correct;
    if (article === selected && answerState === 'wrong') return theme.incorrect;
    return theme.textMuted;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.quizTopBar}>
        <TouchableOpacity onPress={() => setMode('menu')} hitSlop={12}>
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </TouchableOpacity>
        <View style={styles.quizScores}>
          <View style={styles.scorePill}>
            <Ionicons name="flame" size={14} color="#F59E0B" />
            <Text style={[styles.scoreText, { color: theme.text }]}>{sessionStreak}</Text>
          </View>
          <Text style={[styles.progressText, { color: theme.textSecondary }]}>{progress}</Text>
        </View>
      </View>

      {/* Timer bar */}
      {isTimed && (
        <View style={[styles.timerBar, { backgroundColor: theme.border }]}>
          <Animated.View style={[styles.timerFill, {
            backgroundColor: timeLeft <= 2 ? theme.incorrect : '#1A56DB',
            width: `${(timeLeft / TIMED_SECS) * 100}%`,
          }]} />
        </View>
      )}

      {/* Question */}
      <Animated.View style={[styles.questionWrap, { opacity: fadeAnim }]}>
        {isTimed && (
          <Text style={[styles.timerText, { color: timeLeft <= 2 ? theme.incorrect : theme.textMuted }]}>
            {timeLeft}s
          </Text>
        )}
        <Text style={[styles.questionLabel, { color: theme.textMuted }]}>Which article?</Text>
        <Text style={[styles.questionNoun, { color: theme.text }]}>{current.noun}</Text>
        <Text style={[styles.questionEnglish, { color: theme.textSecondary }]}>{current.english}</Text>
        <Text style={[styles.questionPlural, { color: theme.textMuted }]}>Pl: {current.plural}</Text>
        {isSpaced && (
          <Text style={[styles.spacedHint, { color: theme.textMuted }]}>
            Due now: {spacedDueCount}  ·  New: {spacedNewCount}
          </Text>
        )}
      </Animated.View>

      {/* Answer UI */}
      <View style={styles.buttonsWrap}>
        {ARTICLES.map((article) => (
          <TouchableOpacity
            key={article}
            onPress={() => handleAnswer(article)}
            disabled={answerState !== 'idle'}
            style={[styles.answerBtn, btnBg(article)]}
            activeOpacity={0.85}
          >
            <Text style={[styles.answerBtnText, { color: btnTextColor(article) }]}>{article}</Text>
            {answerState !== 'idle' && article === current.article && (
              <Ionicons name="checkmark-circle" size={22} color={theme.correct} style={{ marginLeft: 8 }} />
            )}
            {answerState === 'wrong' && article === selected && (
              <Ionicons name="close-circle" size={22} color={theme.incorrect} style={{ marginLeft: 8 }} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatItem({ label, value, theme }: { label: string; value: number | string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function ModeCard({ icon, title, desc, color, titleColor, descColor, onPress, preview }: {
  icon: string; title: string; desc: string; color: string;
  titleColor?: string; descColor?: string;
  onPress: () => void; preview?: string[];
}) {
  const isLight = !titleColor;
  return (
    <TouchableOpacity style={[styles.modeCard, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.modeCardRow}>
        <Ionicons name={icon as any} size={26} color={isLight ? '#fff' : titleColor} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.modeTitle, { color: isLight ? '#fff' : titleColor }]}>{title}</Text>
          <Text style={[styles.modeDesc, { color: isLight ? 'rgba(255,255,255,0.8)' : descColor }]}>{desc}</Text>
        </View>
      </View>
      {preview && preview.length > 0 && (
        <View style={styles.previewRow}>
          {preview.map(n => (
            <View key={n} style={styles.previewChip}>
              <Text style={styles.previewText}>{n}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function CategoryModal({ visible, folders, getNounsInFolder, theme, onClose, onStart }: {
  visible: boolean; folders: any[]; getNounsInFolder: (id: string) => GermanNoun[];
  theme: ReturnType<typeof useTheme>; onClose: () => void; onStart: (pool: GermanNoun[]) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={catStyles.backdrop} onPress={onClose} />
      <View style={[catStyles.sheet, { backgroundColor: theme.card }]}>
        <View style={[catStyles.handle, { backgroundColor: theme.border }]} />
        <Text style={[catStyles.title, { color: theme.text }]}>Choose a folder</Text>
        {folders.length === 0 ? (
          <Text style={[catStyles.empty, { color: theme.textMuted }]}>
            Create folders in the Favorites tab first.
          </Text>
        ) : (
          <ScrollView>
            {folders.map(f => {
              const pool = getNounsInFolder(f.id);
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[catStyles.row, { borderBottomColor: theme.border }]}
                  onPress={() => onStart(pool)}
                  disabled={pool.length === 0}
                >
                  <View style={[catStyles.dot, { backgroundColor: f.color }]}>
                    <Ionicons name="folder" size={14} color="#fff" />
                  </View>
                  <Text style={[catStyles.name, { color: pool.length > 0 ? theme.text : theme.textMuted }]}>{f.name}</Text>
                  <Text style={[catStyles.count, { color: theme.textMuted }]}>{pool.length} words</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const catStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '70%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  empty: { fontSize: 14, textAlign: 'center', marginVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  dot: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  count: { fontSize: 13 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  menuContent: { paddingHorizontal: 20 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 2 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  streakFire: { fontSize: 18 },
  streakNum: { fontSize: 18, fontWeight: '800' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  poolToggleRow: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 20 },
  poolToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  poolToggleLabel: { fontSize: 14, fontWeight: '600' },
  poolEmptyNote: { fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 18, paddingHorizontal: 4 },
  statsStrip: { flexDirection: 'row', borderRadius: 16, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  modeCard: { borderRadius: 16, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  modeCardRow: { flexDirection: 'row', alignItems: 'center' },
  modeTitle: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  modeDesc: { fontSize: 13 },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  previewChip: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  previewText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  // Summary
  summaryWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  summaryTitle: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  summaryScore: { fontSize: 20, marginBottom: 20 },
  wrongList: { width: '100%', borderRadius: 16, padding: 16, marginBottom: 20 },
  wrongTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  wrongRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  wrongBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  wrongBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  wrongNoun: { fontSize: 15, fontWeight: '600' },
  wrongEn: { fontSize: 12 },
  wrongMore: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  summaryBtns: { flexDirection: 'row', gap: 10 },
  summaryBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 14 },
  summaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // Quiz game
  quizTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  quizScores: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scorePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreText: { fontWeight: '700', fontSize: 16 },
  progressText: { fontSize: 14 },
  timerBar: { height: 4, marginHorizontal: 20, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  timerFill: { height: 4, borderRadius: 2 },
  timerText: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  questionWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  questionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },
  questionNoun: { fontSize: 48, fontWeight: '800', letterSpacing: -1, textAlign: 'center', marginBottom: 8 },
  questionEnglish: { fontSize: 18, textAlign: 'center', marginBottom: 4 },
  questionPlural: { fontSize: 14, textAlign: 'center' },
  spacedHint: { fontSize: 12, textAlign: 'center', marginTop: 10, fontWeight: '600' },
  buttonsWrap: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  answerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 60, borderRadius: 16, borderWidth: 2 },
  answerBtnText: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  // Flashcard
  flashInstruction: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  flashCardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  swipeHint: { position: 'absolute', top: '40%', zIndex: 10, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  swipeLeft: { left: 16, backgroundColor: '#E11D4840' },
  swipeRight: { right: 16, backgroundColor: '#05966940' },
  swipeHintText: { fontSize: 24, fontWeight: '800' },
  flashCard: { width: 320, minHeight: 360, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  flashCardInner: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', minHeight: 360 },
  flashBadge: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12, marginBottom: 16 },
  flashBadgeText: { color: '#fff', fontWeight: '800', fontSize: 20 },
  flashNoun: { fontSize: 42, fontWeight: '800', letterSpacing: -1, textAlign: 'center', marginBottom: 8 },
  flashPlural: { fontSize: 15, textAlign: 'center', marginBottom: 4 },
  flashEnglish: { fontSize: 16, textAlign: 'center', marginBottom: 12 },
  flashExample: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 4 },
  flashHint: { fontSize: 14, marginTop: 16 },
  flashActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 30 },
  flashActionBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flashActionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  speakBtn: { marginTop: 16, padding: 8 },
});
