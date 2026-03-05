import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GermanNoun } from '../types';

const STORAGE_KEY = '@derdiadas_favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<GermanNoun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setFavorites(JSON.parse(raw));
        } catch {
          setFavorites([]);
        }
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((next: GermanNoun[]) => {
    setFavorites(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const isFavorite = useCallback(
    (noun: string, article: string) =>
      favorites.some((f) => f.noun === noun && f.article === article),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (item: GermanNoun) => {
      const already = favorites.some(
        (f) => f.noun === item.noun && f.article === item.article
      );
      persist(
        already
          ? favorites.filter((f) => !(f.noun === item.noun && f.article === item.article))
          : [...favorites, item]
      );
    },
    [favorites, persist]
  );

  return { favorites, isFavorite, toggleFavorite, loaded };
}
