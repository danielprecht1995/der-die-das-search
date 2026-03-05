import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { GermanNoun } from '../types';
import { useTheme } from '../theme';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../screens/NounDetailScreen';

interface Props {
  item: GermanNoun;
  isFavorite: boolean;
  onToggleFavorite: (item: GermanNoun) => void;
}

export default function NounCard({ item, isFavorite, onToggleFavorite }: Props) {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isLearned, addRecentlyViewed, getFolderIdsForNoun, folders } = useAppContext();
  const colors = theme.articles[item.article];
  const learned = isLearned(item.noun, item.article);
  const nounFolderIds = getFolderIdsForNoun(item.noun, item.article);
  const nounFolders = folders.filter((f) => nounFolderIds.includes(f.id));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addRecentlyViewed(item);
    navigation.navigate('NounDetail', { noun: item });
  };

  const handleStar = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleFavorite(item);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.bg },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.left}>
        <View style={[styles.badge, { backgroundColor: colors.badge }]}>
          <Text style={styles.articleText}>{item.article}</Text>
          {learned && (
            <View style={styles.learnedDot}>
              <Ionicons name="checkmark" size={9} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.noun, { color: colors.text }]}>{item.noun}</Text>
          <Text style={[styles.plural, { color: theme.textSecondary }]}>Pl: {item.plural}</Text>
          <Text style={[styles.english, { color: theme.textMuted }]}>{item.english}</Text>
          {item.example ? (
            <View style={styles.exampleBlock}>
              <Text style={[styles.example, { color: theme.textSecondary }]} numberOfLines={2}>
                „{item.example}"
              </Text>
              {item.exampleEn ? (
                <Text style={[styles.exampleEn, { color: theme.textMuted }]} numberOfLines={2}>
                  {item.exampleEn}
                </Text>
              ) : null}
            </View>
          ) : null}
          {nounFolders.length > 0 && (
            <View style={styles.folderDots}>
              {nounFolders.map((f) => (
                <View key={f.id} style={[styles.folderDot, { backgroundColor: f.color }]}>
                  <Ionicons name="folder" size={9} color="#fff" />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={handleStar} hitSlop={12} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
          <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={22} color={isFavorite ? '#F59E0B' : theme.textMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 14,
    minWidth: 44,
    alignItems: 'center',
  },
  articleText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
  learnedDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1 },
  noun: { fontSize: 19, fontWeight: '700', letterSpacing: 0.2 },
  plural: { fontSize: 13, marginTop: 2 },
  english: { fontSize: 13, marginTop: 1, fontStyle: 'italic' },
  exampleBlock: { marginTop: 5 },
  example: { fontSize: 12, lineHeight: 17 },
  exampleEn: { fontSize: 11, lineHeight: 16, marginTop: 1, fontStyle: 'italic' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 4 },
  iconBtn: { padding: 5 },
  iconBtnPressed: { opacity: 0.5 },
  folderDots: { flexDirection: 'row', gap: 4, marginTop: 5 },
  folderDot: {
    width: 16, height: 16, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
});
