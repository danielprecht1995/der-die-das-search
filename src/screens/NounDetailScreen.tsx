import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useTheme } from '../theme';
import { useAppContext } from '../context/AppContext';
import type { GermanNoun } from '../types';
import { FOLDER_COLORS } from '../components/FolderPickerModal';

export type RootStackParamList = {
  Tabs: undefined;
  NounDetail: { noun: GermanNoun };
};

type NounDetailRouteProp = RouteProp<RootStackParamList, 'NounDetail'>;

export default function NounDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<NounDetailRouteProp>();
  const { noun: item } = route.params;
  const theme = useTheme();
  const {
    isFavorite, toggleFavorite,
    isLearned, toggleLearned,
    showFolderPicker, getFolderIdsForNoun, folders,
  } = useAppContext();

  const ac = theme.articles[item.article];
  const favorite = isFavorite(item.noun, item.article);
  const learned = isLearned(item.noun, item.article);
  const nounFolderIds = getFolderIdsForNoun(item.noun, item.article);
  const nounFolders = folders.filter((f) => nounFolderIds.includes(f.id));

  const handleSpeak = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Speech.speak(`${item.article} ${item.noun}`, { language: 'de-DE', rate: 0.85 });
  };

  const handleCopy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(`${item.article} ${item.noun} – ${item.english}`);
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: `${item.article} ${item.noun} – ${item.english}${item.example ? `\n\n„${item.example}"` : ''}`,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleSpeak} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="volume-medium-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCopy} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="copy-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero section */}
        <View style={[styles.hero, { backgroundColor: ac.bg }]}>
          <View style={[styles.articleBadge, { backgroundColor: ac.badge }]}>
            <Text style={styles.articleBadgeText}>{item.article}</Text>
          </View>
          <Text style={[styles.nounText, { color: ac.text }]}>{item.noun}</Text>
          <Text style={[styles.englishText, { color: theme.textSecondary }]}>{item.english}</Text>
        </View>

        {/* Info cards */}
        <View style={styles.infoGrid}>
          <InfoCard label="Plural" value={item.plural} theme={theme} />
          <InfoCard label="Article" value={item.article} theme={theme} color={ac.text} />
        </View>

        {/* Example sentence */}
        {item.example ? (
          <View style={[styles.exampleCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.exampleLabel, { color: theme.textMuted }]}>EXAMPLE</Text>
            <Text style={[styles.exampleDe, { color: theme.text }]}>„{item.example}"</Text>
            {item.exampleEn ? (
              <Text style={[styles.exampleEn, { color: theme.textSecondary }]}>{item.exampleEn}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Folders */}
        {nounFolders.length > 0 && (
          <View style={[styles.foldersCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.exampleLabel, { color: theme.textMuted }]}>FOLDERS</Text>
            <View style={styles.folderChips}>
              {nounFolders.map((f) => (
                <View key={f.id} style={[styles.folderChip, { backgroundColor: f.color + '22' }]}>
                  <Ionicons name="folder" size={12} color={f.color} />
                  <Text style={[styles.folderChipText, { color: f.color }]}>{f.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          <ActionButton
            icon={favorite ? 'star' : 'star-outline'}
            label={favorite ? 'Saved' : 'Save word'}
            color={favorite ? '#F59E0B' : theme.textSecondary}
            bg={favorite ? '#FEF3C7' : theme.card}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleFavorite(item); }}
          />
          <ActionButton
            icon={learned ? 'checkmark-circle' : 'checkmark-circle-outline'}
            label={learned ? 'Learned' : 'Mark learned'}
            color={learned ? theme.correct : theme.textSecondary}
            bg={learned ? theme.correctBg : theme.card}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleLearned(item); }}
          />
          <ActionButton
            icon="folder-open-outline"
            label="Add to folder"
            color={theme.textSecondary}
            bg={theme.card}
            onPress={() => showFolderPicker(item)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function InfoCard({ label, value, theme, color }: {
  label: string; value: string;
  theme: ReturnType<typeof useTheme>; color?: string;
}) {
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.card }]}>
      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.infoValue, { color: color ?? theme.text }]}>{value}</Text>
    </View>
  );
}

function ActionButton({ icon, label, color, bg, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string; color: string; bg: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: bg }]} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 8 },
  content: { paddingHorizontal: 16 },
  hero: {
    borderRadius: 20, padding: 28, alignItems: 'center',
    marginBottom: 16, marginTop: 8,
  },
  articleBadge: {
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 8, marginBottom: 14,
  },
  articleBadgeText: { color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: 1 },
  nounText: { fontSize: 42, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8, textAlign: 'center' },
  englishText: { fontSize: 18, fontStyle: 'italic', textAlign: 'center' },
  infoGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  infoCard: {
    flex: 1, borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  infoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  infoValue: { fontSize: 20, fontWeight: '700' },
  exampleCard: {
    borderRadius: 14, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  exampleLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  exampleDe: { fontSize: 16, lineHeight: 24, fontStyle: 'italic', marginBottom: 6 },
  exampleEn: { fontSize: 14, lineHeight: 20 },
  foldersCard: {
    borderRadius: 14, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  folderChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  folderChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  folderChipText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
