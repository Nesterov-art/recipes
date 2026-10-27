import { useWindowDimensions } from 'react-native';

// Bold Cyrillic averages about this many ems per letter.
const LETTER_EM = 0.62;
const MIN_SIZE = 28;

// Large text grows a screen title until its longest word ("Редактирование") would no
// longer fit the column and break inside the word; never below MIN_SIZE.
export function useFittedTitle(text: string, fontSize: number, maxColumn = 680) {
  const { width } = useWindowDimensions();
  const longest = Math.max(1, ...text.split(/\s+/).map(word => word.length));
  const column = Math.min(width, maxColumn) - 32;
  const size = Math.max(MIN_SIZE, Math.min(fontSize, Math.floor(column / (longest * LETTER_EM))));
  return { fontSize: size, lineHeight: Math.round(size * 1.18) };
}
