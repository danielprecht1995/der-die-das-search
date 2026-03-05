import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ScrollView, Modal, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import NounCard from '../components/NounCard';
import { FOLDER_COLORS } from '../components/FolderPickerModal';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme';
import type { GermanNoun } from '../types';
import nounsData from '../data/nouns.json';

const BUNDLED_NOUNS: GermanNoun[] = nounsData as GermanNoun[];

type Tab = 'favorites' | 'learned' | string; // string = folder id

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    favorites, isFavorite, toggleFavorite,
    isLearned, learnedKeys, customNouns,
    folders, createFolder, deleteFolder, renameFolder,
    getNounsInFolder,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<Tab>('favorites');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0]);

  // Items for the active tab
  const items = useMemo((): GermanNoun[] => {
    if (activeTab === 'favorites') return favorites;
    if (activeTab === 'learned') {
      const customSet = new Set(customNouns.map((n) => `${n.noun}::${n.article}`));
      const all = [
        ...customNouns,
        ...BUNDLED_NOUNS.filter((n) => !customSet.has(`${n.noun}::${n.article}`)),
      ];
      return all.filter((n) => learnedKeys.has(`${n.noun}::${n.article}`));
    }
    return getNounsInFolder(activeTab);
  }, [activeTab, favorites, learnedKeys, customNouns, getNounsInFolder]);

  const renderItem = useCallback(
    ({ item }: { item: GermanNoun }) => (
      <NounCard
        item={item}
        isFavorite={isFavorite(item.noun, item.article)}
        onToggleFavorite={toggleFavorite}
      />
    ),
    [isFavorite, toggleFavorite]
  );

  const keyExtractor = useCallback(
    (item: GermanNoun) => `${item.noun}::${item.article}`,
    []
  );

  const handleCreateFolder = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createFolder(trimmed, newColor);
    setNewName('');
    setNewColor(FOLDER_COLORS[0]);
    setCreateModalVisible(false);
  };

  const handleFolderLongPress = (folderId: string, folderName: string) => {
    Alert.alert(folderName, undefined, [
      {
        text: 'Rename',
        onPress: () => {
          Alert.prompt(
            'Rename folder',
            undefined,
            (text) => { if (text?.trim()) renameFolder(folderId, text.trim()); },
            'plain-text',
            folderName
          );
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete folder?', 'Words inside will not be deleted.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete', style: 'destructive',
              onPress: () => {
                deleteFolder(folderId);
                if (activeTab === folderId) setActiveTab('favorites');
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const BUILT_IN_TABS = [
    { id: 'favorites', label: '⭐ Starred', count: favorites.length },
    { id: 'learned', label: '✓ Learned', count: learnedKeys.size },
  ];

  const activeFolder = folders.find((f) => f.id === activeTab);

  const emptyMessages: Record<Tab, { icon: string; title: string; body: string }> = {
    favorites: { icon: '⭐', title: 'No starred words', body: 'Tap the star on any noun card to save it here.' },
    learned: { icon: '✅', title: 'No learned words yet', body: 'Long-press any noun card → "Mark as learned".' },
  };

  const empty = activeFolder
    ? { icon: '📁', title: `${activeFolder.name} is empty`, body: 'Long-press any noun → "Add to folder…" to fill it.' }
    : emptyMessages[activeTab] ?? emptyMessages.favorites;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.text }]}>
            {activeFolder ? activeFolder.name : activeTab === 'learned' ? 'Learned' : 'Favorites'}
          </Text>
          <View style={styles.headerActions}>
            <View style={[styles.countBadge, { backgroundColor: theme.chipBackground }]}>
              <Text style={[styles.countText, { color: theme.textSecondary }]}>{items.length}</Text>
            </View>
            <TouchableOpacity
              style={[styles.newFolderBtn, { backgroundColor: theme.card }]}
              onPress={() => setCreateModalVisible(true)}
            >
              <Ionicons name="folder-open-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.newFolderBtnText, { color: theme.textSecondary }]}>New folder</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Folder tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {BUILT_IN_TABS.map(({ id, label, count }) => {
            const active = activeTab === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setActiveTab(id)}
                style={[
                  styles.tab,
                  { backgroundColor: active ? '#1A56DB' : theme.chipBackground },
                ]}
              >
                <Text style={[styles.tabText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {label}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabCount, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.border }]}>
                    <Text style={[styles.tabCountText, { color: active ? '#fff' : theme.textMuted }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {folders.map((folder) => {
            const active = activeTab === folder.id;
            return (
              <TouchableOpacity
                key={folder.id}
                onPress={() => setActiveTab(folder.id)}
                onLongPress={() => handleFolderLongPress(folder.id, folder.name)}
                style={[
                  styles.tab,
                  { backgroundColor: active ? folder.color : theme.chipBackground },
                ]}
              >
                <View style={[styles.tabDot, { backgroundColor: active ? 'rgba(255,255,255,0.4)' : folder.color }]}>
                  <Ionicons name="folder" size={9} color="#fff" />
                </View>
                <Text style={[styles.tabText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {folder.name}
                </Text>
                <View style={[styles.tabCount, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : theme.border }]}>
                  <Text style={[styles.tabCountText, { color: active ? '#fff' : theme.textMuted }]}>
                    {folder.nounKeys.length}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ── */}
      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{empty.icon}</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{empty.title}</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>{empty.body}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Create folder modal ── */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCreateModalVisible(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { backgroundColor: theme.card }]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>New folder</Text>
            <TextInput
              style={[styles.nameInput, {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              }]}
              placeholder="Folder name…"
              placeholderTextColor={theme.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateFolder}
            />
            <Text style={[styles.colorLabel, { color: theme.textMuted }]}>Color</Text>
            <View style={styles.colorRow}>
              {FOLDER_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setNewColor(c)}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    newColor === c && styles.colorSelected,
                  ]}
                >
                  {newColor === c && <Ionicons name="checkmark" size={13} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.sheetActions}>
              <TouchableOpacity
                onPress={() => { setCreateModalVisible(false); setNewName(''); }}
                style={[styles.sheetCancelBtn, { backgroundColor: theme.chipBackground }]}
              >
                <Text style={[styles.sheetCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateFolder}
                disabled={!newName.trim()}
                style={[styles.sheetConfirmBtn, { backgroundColor: newName.trim() ? newColor : theme.border }]}
              >
                <Text style={styles.sheetConfirmText}>Create folder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countText: { fontSize: 13, fontWeight: '600' },
  newFolderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  newFolderBtnText: { fontSize: 12, fontWeight: '600' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingBottom: 12 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  tabCountText: { fontSize: 11, fontWeight: '600' },
  tabDot: {
    width: 16, height: 16, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingBottom: 80, paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  // Modal
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 18,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  nameInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 11, fontSize: 16, marginBottom: 16,
  },
  colorLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },
  colorRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  colorCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  colorSelected: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
    transform: [{ scale: 1.15 }],
  },
  sheetActions: { flexDirection: 'row', gap: 10 },
  sheetCancelBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12 },
  sheetCancelText: { fontSize: 15, fontWeight: '600' },
  sheetConfirmBtn: { flex: 2, paddingVertical: 13, alignItems: 'center', borderRadius: 12 },
  sheetConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
