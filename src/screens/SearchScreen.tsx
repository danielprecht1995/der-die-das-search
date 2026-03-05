import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet, Keyboard,
  TouchableOpacity, ActivityIndicator,
  ScrollView, Modal, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import NounCard from '../components/NounCard';
import { useAppContext } from '../context/AppContext';
import { lookupNounWithAI, lookupMoreNounsWithAI } from '../services/openai';
import { getLastRevenueCatError } from '../services/revenuecat';
import { useTheme } from '../theme';
import nounsData from '../data/nouns.json';
import type { GermanNoun, Article } from '../types';

const BUNDLED_NOUNS: GermanNoun[] = nounsData as GermanNoun[];

function seededRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function getWordOfTheDay(): GermanNoun {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const idx = Math.floor(seededRandom(seed) * BUNDLED_NOUNS.length);
  return BUNDLED_NOUNS[idx];
}

const ARTICLES: Article[] = ['der', 'die', 'das'];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    isFavorite, toggleFavorite, recentlyViewed, findCustomNoun, addCustomNoun,
    canUseAiLookup, consumeAiLookup, remainingFreeLookups, isSubscribed,
    purchaseSubscription, restoreSubscription,
  } = useAppContext();

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [articleFilter, setArticleFilter] = useState<Set<Article>>(new Set());
  const [aiResult, setAiResult] = useState<GermanNoun | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [extraResults, setExtraResults] = useState<GermanNoun[]>([]);
  const [lastMoreQuery, setLastMoreQuery] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState<'monthly' | 'yearly' | 'restore' | null>(null);
  const [paywallError, setPaywallError] = useState<string | null>(null);

  const wordOfTheDay = useMemo(() => getWordOfTheDay(), []);

  const results = useMemo(() => {
    const q = submittedQuery.trim().toLowerCase();
    if (!q) return [];
    const customRaw = findCustomNoun(q);
    const bundled = BUNDLED_NOUNS.filter(
      (n) =>
        n.noun.toLowerCase().startsWith(q) ||
        n.english.toLowerCase().includes(q)
    );
    // If an old cached custom entry is missing example fields, prefer bundled data for that key.
    const bundledMap = new Map(bundled.map((n) => [`${n.noun.toLowerCase()}::${n.article}`, n]));
    const custom = customRaw.map((n) => {
      const key = `${n.noun.toLowerCase()}::${n.article}`;
      const bundledMatch = bundledMap.get(key);
      const missingExample = !n.example || !n.exampleEn;
      return missingExample && bundledMatch ? bundledMatch : n;
    });

    const customSet = new Set(custom.map((n) => `${n.noun.toLowerCase()}::${n.article}`));
    let merged = [...custom, ...bundled.filter((n) => !customSet.has(`${n.noun.toLowerCase()}::${n.article}`))];
    if (articleFilter.size > 0) {
      merged = merged.filter((n) => articleFilter.has(n.article));
    }
    // Append extra AI results that aren't already shown
    const mergedKeys = new Set(merged.map((n) => `${n.noun.toLowerCase()}::${n.article}`));
    const extras = extraResults.filter((n) => !mergedKeys.has(`${n.noun.toLowerCase()}::${n.article}`));
    if (articleFilter.size > 0) {
      return [...merged, ...extras.filter((n) => articleFilter.has(n.article))].slice(0, 80);
    }
    return [...merged, ...extras].slice(0, 80);
  }, [submittedQuery, findCustomNoun, articleFilter, extraResults]);

  // Called when user presses the Search key / Search button.
  // This only submits local search; AI is manual.
  const handleSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    if (!canUseAiLookup()) { setShowPaywall(true); return; }
    if (!consumeAiLookup()) { setShowPaywall(true); return; }
    setSubmittedQuery(q);
    setAiError(null);
    setAiResult(null);
    setMoreError(null);
    setExtraResults([]);
    setLastMoreQuery('');
  }, [query, canUseAiLookup, consumeAiLookup]);

  const handleAskAiExact = useCallback(async () => {
    const q = submittedQuery.trim();
    if (!q || aiLoading) return;
    if (!canUseAiLookup()) { setShowPaywall(true); return; }
    if (!consumeAiLookup()) { setShowPaywall(true); return; }
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const noun = await lookupNounWithAI(q);
      setAiResult(noun);
      addCustomNoun(noun);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }, [submittedQuery, aiLoading, canUseAiLookup, consumeAiLookup, addCustomNoun]);

  const handleLookupMore = useCallback(async () => {
    const q = query.trim();
    if (!q || results.length === 0) return;
    if (lastMoreQuery === q || moreLoading) return;
    if (!canUseAiLookup()) { setShowPaywall(true); return; }
    if (!consumeAiLookup()) { setShowPaywall(true); return; }
    setMoreLoading(true);
    setMoreError(null);
    setLastMoreQuery(q);
    try {
      const nouns = await lookupMoreNounsWithAI(q);
      nouns.forEach((n) => addCustomNoun(n));
      setExtraResults(nouns);
    } catch (e) {
      setMoreError((e as Error).message);
    } finally {
      setMoreLoading(false);
    }
  }, [query, results.length, lastMoreQuery, moreLoading, canUseAiLookup, consumeAiLookup, addCustomNoun]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const handleRandom = useCallback(() => {
    const idx = Math.floor(Math.random() * BUNDLED_NOUNS.length);
    const noun = BUNDLED_NOUNS[idx];
    setQuery(noun.noun);
    setAiResult(null);
    setAiError(null);
  }, []);

  const toggleFilter = useCallback((article: Article) => {
    setArticleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(article)) next.delete(article); else next.add(article);
      return next;
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: GermanNoun }) => (
      <NounCard item={item} isFavorite={isFavorite(item.noun, item.article)} onToggleFavorite={toggleFavorite} />
    ),
    [isFavorite, toggleFavorite]
  );

  const keyExtractor = useCallback((item: GermanNoun) => `${item.noun}::${item.article}`, []);

  const isEmpty = submittedQuery.trim() === '';

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: theme.text }]}>der die das</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>German Article Lookup</Text>
            </View>
            <TouchableOpacity onPress={handleRandom} style={[styles.randomBtn, { backgroundColor: theme.card }]}>
              <Ionicons name="shuffle" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={[styles.searchContainer, { backgroundColor: theme.inputBackground }]}>
            <Ionicons name="search" size={18} color={theme.textMuted} style={styles.searchIcon} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Search noun or translation…"
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={handleQueryChange}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              onSubmitEditing={handleSubmit}
            />
          </View>
          <TouchableOpacity
            onPress={handleSubmit}
            style={styles.searchBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>
        {!isSubscribed && (
          <View style={styles.lookupCounterWrap}>
            <Ionicons name="sparkles-outline" size={14} color={theme.textMuted} />
            <Text style={[styles.lookupCounterText, { color: theme.textMuted }]}>
              Free lookups left: {remainingFreeLookups}/10
            </Text>
          </View>
        )}

        {/* Article filter chips */}
        <View style={styles.chipRow}>
          {ARTICLES.map((a) => {
            const active = articleFilter.has(a);
            const ac = theme.articles[a];
            return (
              <TouchableOpacity
                key={a}
                onPress={() => toggleFilter(a)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? ac.badge : theme.chipBackground },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {a}
                </Text>
              </TouchableOpacity>
            );
          })}
          {articleFilter.size > 0 && (
            <TouchableOpacity onPress={() => setArticleFilter(new Set())} style={styles.clearChip}>
              <Text style={[styles.chipText, { color: theme.textMuted }]}>✕ clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {isEmpty ? (
          <ScrollView
            contentContainerStyle={[styles.emptyScroll, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Word of the day */}
            <View style={styles.wotdSection}>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>WORD OF THE DAY</Text>
              <NounCard
                item={wordOfTheDay}
                isFavorite={isFavorite(wordOfTheDay.noun, wordOfTheDay.article)}
                onToggleFavorite={toggleFavorite}
              />
            </View>

            {/* Recently viewed */}
            {recentlyViewed.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>RECENTLY VIEWED</Text>
                {recentlyViewed.slice(0, 5).map((item) => (
                  <NounCard
                    key={`${item.noun}::${item.article}`}
                    item={item}
                    isFavorite={isFavorite(item.noun, item.article)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </View>
            )}

            {/* Legend */}
            <View style={styles.legend}>
              <LegendItem color={theme.articles.der.badge} label="der — masculine" />
              <LegendItem color={theme.articles.die.badge} label="die — feminine" />
              <LegendItem color={theme.articles.das.badge} label="das — neuter" />
            </View>
          </ScrollView>
        ) : results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              <AiStatusRow
                loading={moreLoading}
                error={moreError}
                done={lastMoreQuery === submittedQuery.trim() && !moreLoading && !moreError && extraResults.length > 0}
                onRetry={handleLookupMore}
                theme={theme}
              />
            }
          />
        ) : (
          <View style={styles.emptyState}>
            {aiLoading ? (
              <>
                <ActivityIndicator size="large" color={theme.articles.der.badge} style={{ marginBottom: 16 }} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Looking up…</Text>
              </>
            ) : aiResult ? (
              <View style={styles.aiResultWrap}>
                <Text style={[styles.aiLabel, { color: theme.textMuted }]}>LOOKUP RESULT</Text>
                <NounCard
                  item={aiResult}
                  isFavorite={isFavorite(aiResult.noun, aiResult.article)}
                  onToggleFavorite={toggleFavorite}
                />
              </View>
            ) : aiError ? (
              <View style={styles.aiErrorWrap}>
                <Ionicons name="alert-circle-outline" size={20} color={theme.incorrect} />
                <Text style={[styles.aiErrorText, { color: theme.incorrect }]}>{aiError}</Text>
                <TouchableOpacity style={[styles.retryBtn, { borderColor: theme.border }]} onPress={handleAskAiExact}>
                  <Text style={[styles.retryBtnText, { color: theme.textSecondary }]}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  "{submittedQuery.trim()}" not found
                </Text>
                <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                  Use local search first. Ask for help only if needed.
                </Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { borderColor: theme.border }]}
                  onPress={handleAskAiExact}
                >
                  <Text style={[styles.retryBtnText, { color: theme.textSecondary }]}>Ask for help</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
      <Modal visible={showPaywall} transparent animationType="fade" onRequestClose={() => setShowPaywall(false)}>
        <View style={styles.paywallBackdrop}>
          <View style={[styles.paywallCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.paywallTitle, { color: theme.text }]}>Upgrade to Premium</Text>
            <Text style={[styles.paywallSub, { color: theme.textSecondary }]}>
              You used your 10 free lookups.
            </Text>
            <Text style={[styles.paywallSub, { color: theme.textSecondary, marginBottom: 14 }]}>
              Choose a plan to keep searching without limits.
            </Text>

            <TouchableOpacity
              style={styles.planBtn}
              disabled={purchaseLoading !== null}
              onPress={async () => {
                setPaywallError(null);
                setPurchaseLoading('monthly');
                const ok = await purchaseSubscription('monthly');
                setPurchaseLoading(null);
                if (ok) setShowPaywall(false);
                else setPaywallError(getLastRevenueCatError() ?? 'Could not complete purchase. Please try again.');
              }}
            >
              <Text style={styles.planTitle}>{purchaseLoading === 'monthly' ? 'Opening...' : '$3.99 / month'}</Text>
              <Text style={styles.planSub}>Monthly subscription</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.planBtn, styles.planBtnYearly]}
              disabled={purchaseLoading !== null}
              onPress={async () => {
                setPaywallError(null);
                setPurchaseLoading('yearly');
                const ok = await purchaseSubscription('yearly');
                setPurchaseLoading(null);
                if (ok) setShowPaywall(false);
                else setPaywallError(getLastRevenueCatError() ?? 'Could not complete purchase. Please try again.');
              }}
            >
              <Text style={styles.planTitle}>{purchaseLoading === 'yearly' ? 'Opening...' : '$29.99 / year'}</Text>
              <Text style={styles.planSub}>Yearly subscription (save more)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreBtn}
              disabled={purchaseLoading !== null}
              onPress={async () => {
                setPaywallError(null);
                setPurchaseLoading('restore');
                const ok = await restoreSubscription();
                setPurchaseLoading(null);
                if (ok) setShowPaywall(false);
                else setPaywallError(getLastRevenueCatError() ?? 'No active subscription found to restore.');
              }}
            >
              <Text style={styles.restoreBtnText}>
                {purchaseLoading === 'restore' ? 'Restoring...' : 'Restore purchase'}
              </Text>
            </TouchableOpacity>

            {paywallError ? (
              <Text style={styles.paywallError}>{paywallError}</Text>
            ) : null}

            <Pressable onPress={() => setShowPaywall(false)} style={styles.paywallClose}>
              <Text style={[styles.paywallCloseText, { color: theme.textMuted }]}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function AiStatusRow({
  loading, error, done, onRetry, theme,
}: {
  loading: boolean;
  error: string | null;
  done: boolean;
  onRetry: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  if (loading) {
    return (
      <View style={statusStyles.row}>
        <ActivityIndicator size="small" color={theme.textMuted} />
        <Text style={[statusStyles.label, { color: theme.textMuted }]}>Looking up more…</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={statusStyles.row}>
        <Ionicons name="alert-circle-outline" size={15} color={theme.incorrect} />
        <Text style={[statusStyles.label, { color: theme.incorrect }]} numberOfLines={1}>{error}</Text>
        <TouchableOpacity onPress={onRetry}>
          <Text style={[statusStyles.retry, { color: '#1A56DB' }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (done) {
    return (
      <View style={statusStyles.row}>
        <Ionicons name="sparkles" size={14} color={theme.textMuted} />
        <Text style={[statusStyles.label, { color: theme.textMuted }]}>More results included</Text>
      </View>
    );
  }
  // Default: show the button
  return (
    <TouchableOpacity
      onPress={onRetry}
      style={[statusStyles.btn, { borderColor: theme.border }]}
      activeOpacity={0.75}
    >
      <Ionicons name="sparkles-outline" size={15} color="#1A56DB" />
      <Text style={statusStyles.btnText}>Look up more</Text>
    </TouchableOpacity>
  );
}

const statusStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
  },
  label: { fontSize: 12 },
  retry: { fontSize: 12, fontWeight: '700' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, marginHorizontal: 16, marginTop: 4, marginBottom: 12,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
  },
  btnText: { fontSize: 14, fontWeight: '600', color: '#1A56DB' },
});

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 2 },
  randomBtn: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, gap: 8, marginBottom: 12,
  },
  searchContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 12,
    height: 48, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  searchBtn: {
    backgroundColor: '#1A56DB', borderRadius: 12,
    height: 48, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  lookupCounterWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, marginBottom: 8 },
  lookupCounterText: { fontSize: 12, fontWeight: '500' },
  searchIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 17 },
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  clearChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  chipText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  emptyScroll: { paddingHorizontal: 16, paddingTop: 4 },
  wotdSection: { marginBottom: 20 },
  recentSection: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginBottom: 10, textTransform: 'uppercase',
  },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingBottom: 80, paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyText: { fontSize: 16, textAlign: 'center', marginBottom: 8 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
  legend: { marginTop: 8, gap: 10, paddingBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 14, color: '#6B7280' },
  aiResultWrap: { width: '100%', marginTop: 8 },
  aiLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginBottom: 8, textAlign: 'center',
  },
  aiErrorWrap: { alignItems: 'center', gap: 8, marginTop: 8 },
  aiErrorText: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600' },
  paywallBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  paywallCard: { borderRadius: 16, padding: 18 },
  paywallTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  paywallSub: { fontSize: 14, lineHeight: 20 },
  planBtn: { backgroundColor: '#1A56DB', borderRadius: 12, padding: 14, marginTop: 8 },
  planBtnYearly: { backgroundColor: '#059669' },
  planTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  planSub: { color: '#E5E7EB', fontSize: 12, marginTop: 2 },
  restoreBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  restoreBtnText: { color: '#1A56DB', fontSize: 14, fontWeight: '700' },
  paywallError: { color: '#E11D48', fontSize: 12, textAlign: 'center', marginTop: 4 },
  paywallClose: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  paywallCloseText: { fontSize: 13, fontWeight: '600' },
});
