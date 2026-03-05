import React, { useEffect, useRef } from 'react';
import { useColorScheme, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider, useAppContext } from './src/context/AppContext';
import SearchScreen from './src/screens/SearchScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import QuizScreen from './src/screens/QuizScreen';
import TipsScreen from './src/screens/TipsScreen';
import NounDetailScreen from './src/screens/NounDetailScreen';
import type { RootStackParamList } from './src/screens/NounDetailScreen';
import FolderPickerModal from './src/components/FolderPickerModal';
import AppLoadingScreen from './src/components/AppLoadingScreen';
import { lightTheme, darkTheme } from './src/theme';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function GlobalModals() {
  const { folderPickerNoun, hideFolderPicker, recordAppOpen } = useAppContext();
  useEffect(() => { recordAppOpen(); }, []);
  return (
    <FolderPickerModal
      visible={folderPickerNoun !== null}
      noun={folderPickerNoun}
      onClose={hideFolderPicker}
    />
  );
}

const MIN_SPLASH_MS = 1800;

function TabsScreen() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1A56DB',
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, [string, string]> = {
            Search: ['search', 'search-outline'],
            Favorites: ['star', 'star-outline'],
            Practice: ['game-controller', 'game-controller-outline'],
            Tips: ['book', 'book-outline'],
          };
          const [active, inactive] = icons[route.name] ?? ['ellipse', 'ellipse-outline'];
          const name = (focused ? active : inactive) as React.ComponentProps<typeof Ionicons>['name'];
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} />
      <Tab.Screen name="Practice" component={QuizScreen} />
      <Tab.Screen name="Tips" component={TipsScreen} />
    </Tab.Navigator>
  );
}

function AppShell() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  const { isReady } = useAppContext();
  const appOpacity = useRef(new Animated.Value(0)).current;
  const [minElapsed, setMinElapsed] = React.useState(false);

  // Enforce a minimum splash display time
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  const showApp = isReady && minElapsed;

  useEffect(() => {
    if (showApp) {
      Animated.timing(appOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [showApp]);

  if (!showApp) return <AppLoadingScreen />;

  return (
    <Animated.View style={{ flex: 1, opacity: appOpacity }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <GlobalModals />
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Tabs" component={TabsScreen} />
          <RootStack.Screen
            name="NounDetail"
            component={NounDetailScreen}
            options={{ presentation: 'card', animation: 'slide_from_right' }}
          />
        </RootStack.Navigator>
      </NavigationContainer>
    </Animated.View>
  );
}

export default function App() {
  return (
    <AppProvider>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </AppProvider>
  );
}
