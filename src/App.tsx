import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Trie } from './lib/trie';
import { solveGrid, FoundWord, Coordinate } from './lib/solver';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

type ColoredWord = { word: string; path: Coordinate[]; color: string };

const STEP_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#14b8a6',
  '#f97316',
  '#ec4899',
];

export default function App() {
  const [dictionaryLoaded, setDictionaryLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const [trie, setTrie] = useState<Trie | null>(null);

  // Input State
  const [inputStr, setInputStr] = useState("S T R A N D\nG A M E S O\nL V E R ! !");
  const [isEditing, setIsEditing] = useState(true);

  // Game State
  const [foundWords, setFoundWords] = useState<FoundWord[]>([]);
  const [usedCells, setUsedCells] = useState<Set<string>>(new Set());
  const [foundSelections, setFoundSelections] = useState<ColoredWord[]>([]);
  const [selectedCells, setSelectedCells] = useState<Coordinate[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lastSelected, setLastSelected] = useState<Coordinate | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<Coordinate[]>([]);
  const [hoveredWord, setHoveredWord] = useState<FoundWord | null>(null);

  const gridWrapperRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const editStartInputStrRef = useRef<string>(inputStr);
  const [overlayBox, setOverlayBox] = useState({ width: 0, height: 0 });
  const [cellCenters, setCellCenters] = useState<Map<string, { x: number; y: number }>>(new Map());

  // Load Dictionary
  useEffect(() => {
    const loadDictionaries = async () => {
      try {
        const urls = [
          'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt',
          'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt'
        ];
        
        const responses = await Promise.all(urls.map(url => fetch(url).catch(() => null))); // Try both, ignore failures if one succeeds
        
        const t = new Trie();
        let loadedAny = false;

        for (const res of responses) {
          if (res && res.ok) {
            const text = await res.text();
            const words = text.split(/\r?\n/);
            for (const w of words) {
              if (w.trim().length > 0) t.insert(w.trim());
            }
            loadedAny = true;
          }
        }
        
        // Manual fallback for specific words reported missing or common trademarks
        const extraWords = ["dumpster", "email", "internet", "recycle", "trash", "waste"];
        extraWords.forEach(w => t.insert(w));

        if (loadedAny) {
          setTrie(t);
          setDictionaryLoaded(true);
        } else {
          throw new Error("Failed to load any dictionary");
        }
      } catch (err) {
        console.error(err);
        setLoadingError("Error loading dictionary. Check internet connection.");
      }
    };

    loadDictionaries();
  }, []);

  // Parse Grid
  const grid = useMemo(() => {
    return inputStr.trim().split('\n').map(row => {
        // Remove whitespace and split into chars
        return row.replace(/\s+/g, '').split('').map(c => c.toUpperCase());
    });
  }, [inputStr]);

  const cols = grid[0]?.length || 0;

  const getStepColor = (stepIndex: number) => STEP_COLORS[stepIndex % STEP_COLORS.length];

  // Solver
  const runSolver = useCallback(() => {
    if (!trie) return;
    // Create a temporary grid that respects usedCells
    const tempGrid = grid.map((row, r) => row.map((char, c) => {
      if (usedCells.has(`${r},${c}`)) return ' ';
      return char;
    }));

    const results = solveGrid(tempGrid, trie);
    setFoundWords(results);
  }, [grid, trie, usedCells]);

  useEffect(() => {
    if (!isEditing && dictionaryLoaded) {
      runSolver();
    }
  }, [dictionaryLoaded, isEditing, runSolver]);

  // Interaction
  const getCellId = (r: number, c: number) => `${r},${c}`;

  const currentSelectionColor = getStepColor(foundSelections.length);
  const getFoundSelectionColor = (word: string) => foundSelections.find(s => s.word === word)?.color;
  const hoveredWordColor = hoveredWord ? (getFoundSelectionColor(hoveredWord.word) ?? currentSelectionColor) : null;

  useEffect(() => {
    if (isEditing) return;
    const wrapper = gridWrapperRef.current;
    if (!wrapper) return;

    const update = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      setOverlayBox({ width: wrapperRect.width, height: wrapperRect.height });

      const nextCenters = new Map<string, { x: number; y: number }>();
      for (const [id, el] of cellRefs.current.entries()) {
        const r = el.getBoundingClientRect();
        nextCenters.set(id, {
          x: r.left - wrapperRect.left + r.width / 2,
          y: r.top - wrapperRect.top + r.height / 2,
        });
      }
      setCellCenters(nextCenters);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isEditing, cols, grid.length, usedCells.size, foundSelections.length]);

  const pathToPolyline = (path: Coordinate[]) => {
    const points = path
      .map(p => cellCenters.get(getCellId(p.row, p.col)))
      .filter((p): p is { x: number; y: number } => Boolean(p));
    if (points.length < 2) return null;
    return points.map(p => `${p.x},${p.y}`).join(' ');
  };

  const handleMouseDown = (r: number, c: number) => {
    if (isEditing) return;
    if (usedCells.has(getCellId(r, c))) return;
    
    setIsDragging(true);
    setSelectedCells([{ row: r, col: c }]);
    setLastSelected({ row: r, col: c });
  };

  const handleMouseEnter = (r: number, c: number) => {
    if (!isDragging || isEditing) return;
    if (usedCells.has(getCellId(r, c))) return;

    // Check adjacency
    if (lastSelected) {
      const dr = Math.abs(r - lastSelected.row);
      const dc = Math.abs(c - lastSelected.col);
      if (dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0)) {
        // Check if already in path (backtracking handling?)
        // If re-entering the immediately previous cell, undo selection (pop)
        if (selectedCells.length > 1) {
            const prev = selectedCells[selectedCells.length - 2];
            if (prev.row === r && prev.col === c) {
                const newSelection = selectedCells.slice(0, -1);
                setSelectedCells(newSelection);
                setLastSelected(prev);
                return;
            }
        }

        // If not visited in current selection
        if (!selectedCells.some(cell => cell.row === r && cell.col === c)) {
          setSelectedCells([...selectedCells, { row: r, col: c }]);
          setLastSelected({ row: r, col: c });
        }
      }
    }
  };

  const handleMouseUp = () => {
    if (isEditing) return;
    setIsDragging(false);
    
    // Check if word is valid
    const word = selectedCells.map(p => grid[p.row][p.col]).join('');
    // Check if it's in the foundWords list (or just valid in dictionary?)
    // Strands usually requires it to be one of the theme words, but here we accept any valid dictionary word?
    // The prompt says: "When I get a correct answer...". 
    // Let's assume if it is in the foundWords list, it's correct.
    
    const isValid = foundWords.some(fw => fw.word === word);
    // Alternatively, check dictionary directly if we want to allow words not found by solver (unlikely if solver is complete)
    
    if (isValid) {
      const newUsed = new Set(usedCells);
      selectedCells.forEach(p => newUsed.add(getCellId(p.row, p.col)));
      setUsedCells(newUsed);
      setFoundSelections(prev => [...prev, { word, path: selectedCells, color: getStepColor(prev.length) }]);
    }
    
    setSelectedCells([]);
    setLastSelected(null);
  };
  
  // Also support clicking a word in the list to "find" it automatically?
  // "give possible words...". Maybe clicking them highlights them?
  const highlightWord = (fw: FoundWord) => {
      setHighlightedPath([]);
      setHoveredWord(null);
      if (foundSelections.some(s => s.word === fw.word)) return;
      // Check if path is available
      const available = fw.path.every(p => !usedCells.has(getCellId(p.row, p.col)));
      if (available) {
          const newUsed = new Set(usedCells);
          fw.path.forEach(p => newUsed.add(getCellId(p.row, p.col)));
          setUsedCells(newUsed);
          setFoundSelections(prev => [...prev, { word: fw.word, path: fw.path, color: getStepColor(prev.length) }]);
      } else {
          alert("This word overlaps with already found words.");
      }
  };

  const clearTransientSelection = () => {
    setIsDragging(false);
    setSelectedCells([]);
    setLastSelected(null);
    setHighlightedPath([]);
    setHoveredWord(null);
  };

  const resetGame = () => {
      setUsedCells(new Set());
      setFoundSelections([]);
      clearTransientSelection();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans text-gray-900" onMouseUp={handleMouseUp}>
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Left Column: Controls & Grid */}
        <div className="flex flex-col gap-6">
          <header>
            <h1 className="text-3xl font-bold text-blue-600 mb-2">Strands Solver</h1>
            <p className="text-gray-600">Enter your grid, click Solve, and find the words.</p>
          </header>

          <div className="bg-white p-4 rounded-xl shadow-md">
            <div className="flex justify-between items-center mb-4">
               <h2 className="text-xl font-semibold">Grid</h2>
               <div className="space-x-2">
                 <button 
                  onClick={() => {
                    const next = !isEditing;
                    if (next) {
                      editStartInputStrRef.current = inputStr;
                      clearTransientSelection();
                      setIsEditing(true);
                      return;
                    }
                    if (inputStr !== editStartInputStrRef.current) resetGame();
                    setIsEditing(false);
                  }}
                   className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm font-medium transition"
                 >
                   {isEditing ? "Done" : "Edit Grid"}
                 </button>
                 {!isEditing && (
                     <button 
                        onClick={resetGame}
                        className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm font-medium transition"
                     >
                        Reset Found
                     </button>
                 )}
               </div>
            </div>

            {isEditing ? (
              <textarea
                value={inputStr}
                onChange={e => setInputStr(e.target.value)}
                className="w-full h-64 p-4 font-mono text-lg border-2 border-dashed border-gray-300 rounded-lg focus:border-blue-500 focus:ring-0 resize-none uppercase"
                placeholder="Enter letters separated by spaces or newlines..."
              />
            ) : (
              <div className="flex justify-center">
                <div ref={gridWrapperRef} className="relative">
                  <div
                    className="grid gap-2 select-none"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {grid.map((row, r) => (
                      row.map((char, c) => {
                        void char;
                        const id = getCellId(r, c);
                        const isUsed = usedCells.has(id);
                        const isSelected = selectedCells.some(p => p.row === r && p.col === c);
                        const isHighlighted = highlightedPath.some(p => p.row === r && p.col === c);

                        return (
                          <div
                            key={id}
                            className={cn(
                              "w-12 h-12 rounded-full transition-all border-2 relative",
                              isUsed
                                ? "bg-gray-100 border-gray-100"
                                : "bg-white border-gray-200",
                              isSelected && "scale-110 shadow-lg z-20",
                              !isSelected && isHighlighted && "bg-yellow-100 border-yellow-300 scale-105 z-10"
                            )}
                            style={
                              isSelected
                                ? { backgroundColor: currentSelectionColor, borderColor: currentSelectionColor }
                                : undefined
                            }
                          >
                          </div>
                        );
                      })
                    ))}
                  </div>

                  <svg
                    className="absolute inset-0 pointer-events-none z-10"
                    width={overlayBox.width}
                    height={overlayBox.height}
                    viewBox={`0 0 ${overlayBox.width} ${overlayBox.height}`}
                  >
                    {foundSelections.map((s, idx) => {
                      const points = pathToPolyline(s.path);
                      if (!points) return null;
                      return (
                        <polyline
                          key={`${s.word}-${idx}`}
                          points={points}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.5}
                        />
                      );
                    })}
                    {hoveredWord && hoveredWordColor && (
                      (() => {
                        const points = pathToPolyline(hoveredWord.path);
                        if (!points) return null;
                        return (
                          <polyline
                            points={points}
                            fill="none"
                            stroke={hoveredWordColor}
                            strokeWidth={6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="10 8"
                            opacity={0.5}
                          />
                        );
                      })()
                    )}
                    {selectedCells.length > 1 && (
                      (() => {
                        const points = pathToPolyline(selectedCells);
                        if (!points) return null;
                        return (
                          <polyline
                            points={points}
                            fill="none"
                            stroke={currentSelectionColor}
                            strokeWidth={8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={0.5}
                          />
                        );
                      })()
                    )}
                  </svg>

                  <div
                    className="absolute inset-0 grid gap-2 select-none z-20"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  >
                    {grid.map((row, r) => (
                      row.map((char, c) => {
                        const id = getCellId(r, c);
                        const isUsed = usedCells.has(id);
                        const isSelected = selectedCells.some(p => p.row === r && p.col === c);
                        const isHighlighted = highlightedPath.some(p => p.row === r && p.col === c);

                        return (
                          <div
                            key={id}
                            ref={el => {
                              if (el) cellRefs.current.set(id, el);
                              else cellRefs.current.delete(id);
                            }}
                            onMouseDown={() => handleMouseDown(r, c)}
                            onMouseEnter={() => handleMouseEnter(r, c)}
                            className={cn(
                              "w-12 h-12 flex items-center justify-center text-xl font-bold rounded-full transition-all cursor-pointer relative border-2 border-transparent",
                              !isUsed && "hover:border-blue-300",
                              isUsed ? "text-gray-300" : "text-gray-800",
                              isSelected && "text-white scale-110 z-20",
                              !isSelected && isHighlighted && "text-yellow-800 scale-105 z-10"
                            )}
                          >
                            {char}
                          </div>
                        );
                      })
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
             {!dictionaryLoaded ? (
                 <span>Loading dictionary... {loadingError}</span>
             ) : (
                 <span>Dictionary loaded. {isEditing ? "Edit grid and click Done." : "Drag to connect letters."}</span>
             )}
          </div>
        </div>

        {/* Right Column: Words */}
        <div className="bg-white p-6 rounded-xl shadow-md h-[calc(100vh-4rem)] overflow-y-auto">
           <h2 className="text-xl font-semibold mb-4 sticky top-0 bg-white py-2 border-b">
             Possible Words ({foundWords.length})
           </h2>
           {foundWords.length === 0 ? (
               <p className="text-gray-500 italic">No words found yet.</p>
           ) : (
               <ul className="space-y-2">
                   {foundWords.map((fw, idx) => {
                     const foundColor = getFoundSelectionColor(fw.word);
                     return (
                       <li
                         key={idx}
                         className={cn(
                           "group flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer border border-transparent hover:border-gray-200 transition",
                           foundColor && "border"
                         )}
                         style={foundColor ? { borderColor: foundColor } : undefined}
                         onClick={() => highlightWord(fw)}
                         onMouseEnter={() => {
                           setHighlightedPath(fw.path);
                           setHoveredWord(fw);
                         }}
                         onMouseLeave={() => {
                           setHighlightedPath([]);
                           setHoveredWord(null);
                         }}
                       >
                         <span className="flex items-center gap-2">
                           <span
                             className={cn(
                               "w-2.5 h-2.5 rounded-full border",
                               foundColor ? "border-transparent" : "border-gray-300"
                             )}
                             style={foundColor ? { backgroundColor: foundColor } : undefined}
                           />
                           <span className="font-mono font-medium text-lg text-gray-700">{fw.word}</span>
                         </span>
                         <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded">
                           {fw.word.length} pts
                         </span>
                       </li>
                     );
                   })}
               </ul>
           )}
        </div>

      </div>
    </div>
  );
}
