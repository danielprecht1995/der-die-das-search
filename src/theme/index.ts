import { useColorScheme } from 'react-native';

export const lightTheme = {
  dark: false,
  background: '#F9FAFB',
  card: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  inputBackground: '#FFFFFF',
  tabBar: '#FFFFFF',
  tabBarBorder: '#F3F4F6',
  chipBackground: '#F3F4F6',
  sectionBackground: '#FFFFFF',
  correct: '#059669',
  correctBg: '#ECFDF5',
  incorrect: '#E11D48',
  incorrectBg: '#FFF0F3',
  articles: {
    der: { bg: '#EEF3FF', text: '#1A56DB', badge: '#1A56DB' },
    die: { bg: '#FFF0F3', text: '#E11D48', badge: '#E11D48' },
    das: { bg: '#ECFDF5', text: '#059669', badge: '#059669' },
  },
};

export const darkTheme = {
  dark: true,
  background: '#111827',
  card: '#1F2937',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  border: '#374151',
  inputBackground: '#1F2937',
  tabBar: '#1F2937',
  tabBarBorder: '#374151',
  chipBackground: '#374151',
  sectionBackground: '#1F2937',
  correct: '#10B981',
  correctBg: '#064E3B',
  incorrect: '#F43F5E',
  incorrectBg: '#4C0519',
  articles: {
    der: { bg: '#1E3A5F', text: '#60A5FA', badge: '#3B82F6' },
    die: { bg: '#4C0519', text: '#FB7185', badge: '#F43F5E' },
    das: { bg: '#064E3B', text: '#34D399', badge: '#10B981' },
  },
};

export type Theme = typeof lightTheme;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}
