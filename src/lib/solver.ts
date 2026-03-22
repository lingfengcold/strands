import { Trie } from './trie';

export type Coordinate = { row: number; col: number };
export type FoundWord = { word: string; path: Coordinate[] };

const DIRECTIONS = [
  { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },                   { dr: 0, dc: 1 },
  { dr: 1, dc: -1 },  { dr: 1, dc: 0 },  { dr: 1, dc: 1 }
];

export function solveGrid(grid: string[][], trie: Trie, minLength: number = 3): FoundWord[] {
  const rows = grid.length;
  if (rows === 0) return [];
  const cols = grid[0].length;
  
  const results = new Map<string, Coordinate[]>(); // word -> path
  
  function dfs(r: number, c: number, visited: Set<string>, currentPath: Coordinate[], currentWord: string) {
    // Current cell
    const char = grid[r][c];
    if (!char || char === ' ') return;
    
    const nextWord = currentWord + char;
    
    // Prune if not a prefix
    if (!trie.startsWith(nextWord)) return;
    
    const nextPath = [...currentPath, { row: r, col: c }];

    // Check if it's a complete word
    if (nextWord.length >= minLength && trie.search(nextWord)) {
      if (!results.has(nextWord)) {
        results.set(nextWord, nextPath);
      }
    }
    
    const key = `${r},${c}`;
    visited.add(key);
    
    for (const { dr, dc } of DIRECTIONS) {
      const nr = r + dr;
      const nc = c + dc;
      
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const nextKey = `${nr},${nc}`;
        if (!visited.has(nextKey)) {
          dfs(nr, nc, visited, nextPath, nextWord);
        }
      }
    }
    
    visited.delete(key);
  }
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dfs(r, c, new Set(), [], '');
    }
  }

  // Convert map to array and sort by length descending
  return Array.from(results.entries())
    .map(([word, path]) => ({ word, path }))
    .sort((a, b) => b.word.length - a.word.length);
}
