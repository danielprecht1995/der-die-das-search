export type Article = 'der' | 'die' | 'das';

export interface GermanNoun {
  noun: string;
  article: Article;
  plural: string;
  english: string;
  example?: string;
  exampleEn?: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  nounKeys: string[]; // "noun::article"
}
