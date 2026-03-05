import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useAppContext } from '../context/AppContext';
import nounsData from '../data/nouns.json';
import type { GermanNoun } from '../types';

const ALL_NOUNS: GermanNoun[] = nounsData as GermanNoun[];

interface GenderRule {
  ending: string;
  article: 'der' | 'die' | 'das';
  rule: string;
  examples: string[];
  certainty: 'Always' | 'Usually';
}

const RULES: GenderRule[] = [
  {
    ending: '-ung', article: 'die', certainty: 'Always',
    rule: 'Nouns ending in -ung are always feminine.',
    examples: ['die Wohnung', 'die Zeitung', 'die Meinung', 'die Hoffnung'],
  },
  {
    ending: '-heit / -keit', article: 'die', certainty: 'Always',
    rule: 'Abstract nouns ending in -heit or -keit are always feminine.',
    examples: ['die Freiheit', 'die Schönheit', 'die Möglichkeit', 'die Fähigkeit'],
  },
  {
    ending: '-schaft', article: 'die', certainty: 'Always',
    rule: 'Collective nouns ending in -schaft are always feminine.',
    examples: ['die Mannschaft', 'die Gesellschaft', 'die Freundschaft', 'die Wirtschaft'],
  },
  {
    ending: '-tion / -sion / -ität', article: 'die', certainty: 'Always',
    rule: 'Loanwords with these endings are always feminine.',
    examples: ['die Nation', 'die Situation', 'die Qualität', 'die Aktivität'],
  },
  {
    ending: '-ie', article: 'die', certainty: 'Usually',
    rule: 'Nouns ending in -ie are usually feminine.',
    examples: ['die Energie', 'die Demokratie', 'die Strategie', 'die Fantasie'],
  },
  {
    ending: '-chen / -lein', article: 'das', certainty: 'Always',
    rule: 'Diminutives with -chen or -lein are always neuter, regardless of the original word.',
    examples: ['das Mädchen', 'das Häuschen', 'das Büchlein', 'das Stündchen'],
  },
  {
    ending: '-nis', article: 'das', certainty: 'Usually',
    rule: 'Nouns ending in -nis are usually neuter.',
    examples: ['das Ergebnis', 'das Verhältnis', 'das Geheimnis', 'das Zeugnis'],
  },
  {
    ending: '-tum', article: 'das', certainty: 'Usually',
    rule: 'Nouns ending in -tum are usually neuter.',
    examples: ['das Eigentum', 'das Altertum', 'das Wachstum', 'das Christentum'],
  },
  {
    ending: 'Ge- prefix', article: 'das', certainty: 'Usually',
    rule: 'Collective nouns with the Ge- prefix are usually neuter.',
    examples: ['das Gebäude', 'das Gespräch', 'das Gefühl', 'das Gebirge'],
  },
  {
    ending: '-er (agent)', article: 'der', certainty: 'Usually',
    rule: 'Agent nouns ending in -er denoting a person or tool are usually masculine.',
    examples: ['der Lehrer', 'der Fahrer', 'der Computer', 'der Drucker'],
  },
  {
    ending: '-ling', article: 'der', certainty: 'Usually',
    rule: 'Nouns ending in -ling are usually masculine.',
    examples: ['der Frühling', 'der Liebling', 'der Schmetterling', 'der Lehrling'],
  },
  {
    ending: 'Days / Months / Seasons', article: 'der', certainty: 'Always',
    rule: 'Days of the week, months, and seasons are always masculine.',
    examples: ['der Montag', 'der März', 'der Sommer', 'der Herbst'],
  },
  {
    ending: 'Alcoholic drinks', article: 'der', certainty: 'Usually',
    rule: 'Alcoholic drinks are mostly masculine. Notable exception: das Bier.',
    examples: ['der Wein', 'der Whisky', 'der Sekt', 'das Bier (exception!)'],
  },
  {
    ending: 'Chemical elements', article: 'das', certainty: 'Usually',
    rule: 'Chemical elements are usually neuter.',
    examples: ['das Gold', 'das Silber', 'das Eisen', 'das Kupfer'],
  },
];

const ARTICLE_COLORS = {
  der: '#1A56DB',
  die: '#E11D48',
  das: '#059669',
};

export default function TipsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { favorites, learnedKeys, quizStats, streak } = useAppContext();
  const totalNouns = ALL_NOUNS.length;
  const accuracy = quizStats.total > 0 ? Math.round((quizStats.correct / quizStats.total) * 100) : 0;

  const articleCounts = ALL_NOUNS.reduce<Record<string, number>>(
    (acc, n) => { acc[n.article] = (acc[n.article] ?? 0) + 1; return acc; },
    {}
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
    >
      <Text style={[styles.title, { color: theme.text }]}>Tips & Stats</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Gender rules & your progress</Text>

      {/* Streak banner */}
      {streak.current > 0 && (
        <View style={[styles.streakBanner, { backgroundColor: streak.current >= 7 ? '#D97706' : '#1A56DB' }]}>
          <Text style={styles.streakEmoji}>{streak.current >= 30 ? '🏆' : streak.current >= 7 ? '🔥' : '⭐'}</Text>
          <View>
            <Text style={styles.streakBannerNum}>{streak.current}-day streak!</Text>
            <Text style={styles.streakBannerSub}>Best: {streak.best} days · Keep it up!</Text>
          </View>
        </View>
      )}

      {/* Progress stats */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>YOUR PROGRESS</Text>
        <View style={[styles.statsGrid, { backgroundColor: theme.card }]}>
          <ProgressStat icon="⭐" label="Saved" value={favorites.length} color="#F59E0B" labelColor={theme.textMuted} />
          <ProgressStat icon="✅" label="Learned" value={learnedKeys.size} color={theme.correct} labelColor={theme.textMuted} />
          <ProgressStat icon="🎯" label="Quiz played" value={quizStats.total} color={theme.text} labelColor={theme.textMuted} />
          <ProgressStat icon="💯" label="Accuracy" value={`${accuracy}%`} color={ARTICLE_COLORS.das} labelColor={theme.textMuted} />
          <ProgressStat icon="🔥" label="Best streak" value={quizStats.bestStreak} color={ARTICLE_COLORS.die} labelColor={theme.textMuted} />
          <ProgressStat icon="📅" label="Day streak" value={streak.current} color="#D97706" labelColor={theme.textMuted} />
        </View>
      </View>

      {/* Database breakdown */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>DATABASE BREAKDOWN</Text>
        <View style={[styles.breakdownRow, { backgroundColor: theme.card }]}>
          {(['der', 'die', 'das'] as const).map((a) => {
            const count = articleCounts[a] ?? 0;
            const pct = Math.round((count / totalNouns) * 100);
            return (
              <View key={a} style={styles.breakdownItem}>
                <View style={[styles.breakdownBadge, { backgroundColor: theme.articles[a].bg }]}>
                  <Text style={[styles.breakdownArticle, { color: ARTICLE_COLORS[a] }]}>{a}</Text>
                </View>
                <Text style={[styles.breakdownCount, { color: theme.text }]}>{count}</Text>
                <Text style={[styles.breakdownPct, { color: theme.textMuted }]}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Gender rules */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>GENDER RULES</Text>
        {RULES.map((rule) => (
          <RuleCard key={rule.ending} rule={rule} theme={theme} />
        ))}
      </View>

      {/* Pro tip */}
      <View style={[styles.proTip, { backgroundColor: theme.articles.das.bg }]}>
        <Text style={[styles.proTipTitle, { color: ARTICLE_COLORS.das }]}>💡 Pro tip</Text>
        <Text style={[styles.proTipText, { color: theme.textSecondary }]}>
          Long-press any noun card to mark it as learned or copy it to the clipboard. Use the quiz daily to build lasting memory.
        </Text>
      </View>
    </ScrollView>
  );
}

function ProgressStat({ icon, label, value, color, labelColor }: {
  icon: string; label: string; value: number | string; color: string; labelColor: string;
}) {
  return (
    <View style={styles.progressStatItem}>
      <Text style={styles.progressIcon}>{icon}</Text>
      <Text style={[styles.progressValue, { color }]}>{value}</Text>
      <Text style={[styles.progressLabel, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

function RuleCard({ rule, theme }: { rule: GenderRule; theme: ReturnType<typeof useTheme> }) {
  const color = ARTICLE_COLORS[rule.article];
  const bgColor = theme.articles[rule.article].bg;
  return (
    <View style={[styles.ruleCard, { backgroundColor: theme.card }]}>
      <View style={styles.ruleHeader}>
        <View style={[styles.ruleBadge, { backgroundColor: bgColor }]}>
          <Text style={[styles.ruleEnding, { color }]}>{rule.ending}</Text>
        </View>
        <View style={[styles.certBadge, { backgroundColor: rule.certainty === 'Always' ? bgColor : theme.chipBackground }]}>
          <Text style={[styles.certText, { color: rule.certainty === 'Always' ? color : theme.textMuted }]}>
            {rule.certainty}
          </Text>
        </View>
      </View>
      <Text style={[styles.ruleText, { color: theme.text }]}>{rule.rule}</Text>
      <View style={styles.exampleRow}>
        {rule.examples.map((ex) => (
          <View key={ex} style={[styles.exChip, { backgroundColor: theme.chipBackground }]}>
            <Text style={[styles.exText, { color: theme.textSecondary }]}>{ex}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 2, marginBottom: 24 },
  sectionBlock: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginBottom: 12, textTransform: 'uppercase',
  },
  statsGrid: {
    borderRadius: 16, padding: 16, flexDirection: 'row', flexWrap: 'wrap',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  progressStatItem: { width: '33.33%', alignItems: 'center', paddingVertical: 10 },
  progressIcon: { fontSize: 22, marginBottom: 4 },
  progressValue: { fontSize: 18, fontWeight: '700' },
  progressLabel: { fontSize: 11, marginTop: 2 },
  breakdownRow: {
    flexDirection: 'row', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  breakdownItem: { flex: 1, alignItems: 'center' },
  breakdownBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 6 },
  breakdownArticle: { fontWeight: '700', fontSize: 15 },
  breakdownCount: { fontSize: 18, fontWeight: '700' },
  breakdownPct: { fontSize: 12, marginTop: 2 },
  ruleCard: {
    borderRadius: 14, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ruleBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  ruleEnding: { fontWeight: '700', fontSize: 14 },
  certBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  certText: { fontSize: 11, fontWeight: '600' },
  ruleText: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  exChip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  exText: { fontSize: 12 },
  streakBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16, marginBottom: 24 },
  streakEmoji: { fontSize: 32 },
  streakBannerNum: { color: '#fff', fontSize: 18, fontWeight: '800' },
  streakBannerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  proTip: { borderRadius: 14, padding: 16, marginBottom: 8 },
  proTipTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  proTipText: { fontSize: 14, lineHeight: 20 },
});
