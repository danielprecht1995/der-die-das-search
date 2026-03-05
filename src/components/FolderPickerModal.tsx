import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAppContext } from '../context/AppContext';
import type { GermanNoun } from '../types';

export const FOLDER_COLORS = [
  '#1A56DB', '#E11D48', '#059669', '#D97706',
  '#7C3AED', '#DB2777', '#0891B2', '#65A30D',
];

interface Props {
  visible: boolean;
  noun: GermanNoun | null;
  onClose: () => void;
}

export default function FolderPickerModal({ visible, noun, onClose }: Props) {
  const theme = useTheme();
  const {
    folders, createFolder,
    addNounToFolder, removeNounFromFolder, isNounInFolder,
  } = useAppContext();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0]);

  if (!noun) return null;

  const handleToggleFolder = (folderId: string) => {
    if (isNounInFolder(folderId, noun.noun, noun.article)) {
      removeNounFromFolder(folderId, noun);
    } else {
      addNounToFolder(folderId, noun);
    }
  };

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const folder = createFolder(trimmed, newColor);
    addNounToFolder(folder.id, noun);
    setNewName('');
    setNewColor(FOLDER_COLORS[0]);
    setCreating(false);
  };

  const handleClose = () => {
    setCreating(false);
    setNewName('');
    setNewColor(FOLDER_COLORS[0]);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <Text style={[styles.sheetTitle, { color: theme.text }]}>Add to folder</Text>
          <Text style={[styles.sheetNoun, { color: theme.textSecondary }]}>
            {noun.article} {noun.noun} · {noun.english}
          </Text>

          <ScrollView
            style={styles.folderList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {folders.length === 0 && !creating && (
              <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                No folders yet — create one below.
              </Text>
            )}

            {folders.map((folder) => {
              const inFolder = isNounInFolder(folder.id, noun.noun, noun.article);
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[styles.folderRow, { borderBottomColor: theme.border }]}
                  onPress={() => handleToggleFolder(folder.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.folderDot, { backgroundColor: folder.color }]}>
                    <Ionicons name="folder" size={14} color="#fff" />
                  </View>
                  <Text style={[styles.folderName, { color: theme.text }]}>{folder.name}</Text>
                  <Text style={[styles.folderCount, { color: theme.textMuted }]}>
                    {folder.nounKeys.length} words
                  </Text>
                  {inFolder && (
                    <Ionicons name="checkmark-circle" size={22} color={folder.color} />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Create form */}
            {creating ? (
              <View style={[styles.createForm, { borderTopColor: theme.border }]}>
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
                  onSubmitEditing={handleCreate}
                />
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
                      {newColor === c && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.createActions}>
                  <TouchableOpacity onPress={() => setCreating(false)} style={styles.cancelBtn}>
                    <Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreate}
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: newName.trim() ? newColor : theme.border },
                    ]}
                    disabled={!newName.trim()}
                  >
                    <Text style={styles.confirmText}>Create & add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.newFolderBtn, { borderColor: theme.border }]}
                onPress={() => setCreating(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color="#1A56DB" />
                <Text style={[styles.newFolderText]}>New folder</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: '#1A56DB' }]}
            onPress={handleClose}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 18,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sheetNoun: { fontSize: 14, marginBottom: 16 },
  folderList: { maxHeight: 340 },
  emptyHint: { fontSize: 14, textAlign: 'center', marginVertical: 16 },
  folderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  folderDot: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  folderName: { flex: 1, fontSize: 16, fontWeight: '600' },
  folderCount: { fontSize: 13, marginRight: 4 },
  createForm: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8 },
  nameInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 16, marginBottom: 12,
  },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  colorCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  colorSelected: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3, shadowRadius: 3, elevation: 3,
  },
  createActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  confirmBtn: { flex: 2, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  newFolderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderWidth: 1.5,
    borderRadius: 12, borderStyle: 'dashed', marginTop: 10,
  },
  newFolderText: { fontSize: 15, fontWeight: '600', color: '#1A56DB' },
  doneBtn: {
    marginTop: 14, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
