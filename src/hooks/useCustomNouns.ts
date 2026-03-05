import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GermanNoun } from '../types';

const STORAGE_KEY = '@derdiadas_custom_nouns';

export function useCustomNouns() {
  const [customNouns, setCustomNouns] = useState<GermanNoun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setCustomNouns(JSON.parse(raw));
        } catch {
          setCustomNouns([]);
        }
      }
      setLoaded(true);
    });
  }, []);

  const addCustomNoun = useCallback(
    (noun: GermanNoun) => {
      setCustomNouns((prev) => {
        if (prev.some((n) => n.noun.toLowerCase() === noun.noun.toLowerCase() && n.article === noun.article)) {
          return prev;
        }
        const next = [...prev, noun];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const findCustomNoun = useCallback(
    (query: string) =>
      customNouns.filter((n) => n.noun.toLowerCase().startsWith(query.toLowerCase())),
    [customNouns]
  );

  return { customNouns, addCustomNoun, findCustomNoun, loaded };
}
