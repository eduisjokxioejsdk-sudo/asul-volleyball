import AppNavigation from '../components/AppNavigation';
import PancakeLogo from '../components/PancakeLogo';
import AnimatedPancake from '../components/AnimatedPancake';
// ============================================================================
// Mode Entraînement — deux modes :
//   • « Réviser »  : jeux (memory, relier par flèches, QCM) + traduction chronométrée.
//   • « Formation » : leçons théoriques progressives (à venir).
// La logique est dans utils/training.js (pure) ; ici, uniquement l'UI.
// ============================================================================

import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buildPairCatalog,
  catalogForGroups,
  dealPairs,
  isPair,
  dealMatching,
  generateQuiz,
  generateTranslation,
  checkAnswer,
  applyAnswer,
  TRAINING_GROUPS,
} from '../utils/training';
import { DV_ACTIONS } from '../utils/datavolley';
import { LESSONS, generateRecall, checkLessonAnswer } from '../utils/lessons';
import { handleRemappedKeyDown } from '../utils/keyboardRemap';
import useCodingKeyboard from '../hooks/useCodingKeyboard';
import { formatKeyLabel, matchesShortcut } from '../utils/shortcuts';
import ShortcutSettings from '../components/ShortcutSettings';
import { ChevronLeft, Check, RotateCcw, Timer, Trophy, Zap, Dices, Play, X, Sparkles, Shuffle, ListChecks, BookOpen, Lock, ChevronRight, Keyboard } from '../components/icons';

const PAIR_COUNT = 6;
const MATCH_COUNT = 5;

export default function TrainingPage({ user, onLogout }) {
  const navigate = useNavigate();
  const catalog = useMemo(() => buildPairCatalog(), []);
  const [mode, setMode] = useState('review'); // 'review' | 'training'
  const [activity, setActivity] = useState('pairs'); // pairs | match | quiz | translate
  const [groups, setGroups] = useState([]);

  // Clavier partagé avec tous les modes de codage (Data Volley, Direct,
  // Entraînement) : mêmes raccourcis, même profil de Keyboard Remapping.
  const { shortcuts, setShortcuts, keymapProfile } = useCodingKeyboard();
  const [showShortcuts, setShowShortcuts] = useState(false);

  /**
   * Touche pressée dans un champ de code : le Keyboard Remapping (AZERTY Scout,
   * macros 1-to-Many, auto-validation) s'applique d'abord, puis le raccourci de
   * validation commun. `submit` reçoit la valeur déjà mise à jour.
   * @param {string} value valeur courante du champ
   * @param {(next:string)=>void} setValue setter du champ
   * @param {(override?:string)=>void} submit validation
   */
  const codeKeyHandler = (value, setValue, submit) => (e) => {
    const remapRes = handleRemappedKeyDown(e, {
      value,
      profile: keymapProfile,
      onChange: (nextVal) => setValue(nextVal),
      onCommit: (finalVal) => submit(finalVal),
    });
    if (remapRes.handled) return;
    if (matchesShortcut(e, shortcuts.validate)) {
      e.preventDefault();
      submit();
    }
  };

  const toggleGroup = (id) =>
    setGroups((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  // Catalogue filtré par les familles sélectionnées (matière des jeux).
  const pool = useMemo(() => catalogForGroups(catalog, groups), [catalog, groups]);

  // --- Onglet Jeux : memory / association ------------------------------------
  const [game, setGame] = useState(null);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(() => new Set());
  const [moves, setMoves] = useState(0);
  const lockRef = useRef(false);

  const newGame = useCallback(() => {
    setGame(dealPairs(pool, PAIR_COUNT));
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    lockRef.current = false;
  }, [pool]);
  const onCardClick = (card) => {
    if (!game || lockRef.current) return;
    if (flipped.some((c) => c.id === card.id) || matched.has(card.pairId)) return;
    const next = [...flipped, card];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      lockRef.current = true;
      const [a, b] = next;
      if (isPair(a, b)) {
        setTimeout(() => {
          setMatched((prev) => new Set([...prev, a.pairId]));
          setFlipped([]);
          lockRef.current = false;
        }, 350);
      } else {
        setTimeout(() => {
          setFlipped([]);
          lockRef.current = false;
        }, 850);
      }
    }
  };

  const pairsTotal = game ? game.pairs.length : 0;
  const won = game && matched.size === pairsTotal && pairsTotal > 0;

  // --- Jeu « Relier » (associer code ↔ sens par des flèches) ------------------
  const [match, setMatch] = useState(null);
  const [conns, setConns] = useState([]); // [{ pairId, rightId, ok }]
  const [selLeft, setSelLeft] = useState(null);
  const [badConn, setBadConn] = useState(null); // { pairId, rightId } (erreur en cours)
  const newMatch = useCallback(() => {
    setMatch(dealMatching(pool, MATCH_COUNT));
    setConns([]);
    setSelLeft(null);
    setBadConn(null);
  }, [pool]);
  const onLeftClick = (item) => {
    if (conns.some((c) => c.ok && c.pairId === item.pairId)) return;
    setSelLeft(item.pairId);
  };
  const onRightClick = (item) => {
    if (selLeft == null) return;
    if (conns.some((c) => c.ok && c.rightId === item.id)) return;
    if (item.pairId === selLeft) {
      setConns((cs) => [...cs, { pairId: selLeft, rightId: item.id, ok: true }]);
      setSelLeft(null);
    } else {
      const bad = { pairId: selLeft, rightId: item.id };
      setConns((cs) => [...cs, { ...bad, ok: false }]);
      setBadConn(bad);
      setTimeout(() => {
        setConns((cs) => cs.filter((c) => c.ok));
        setBadConn(null);
        setSelLeft(null);
      }, 700);
    }
  };
  const matchTotal = match ? match.left.length : 0;
  const matchWon = match && conns.filter((c) => c.ok).length === matchTotal && matchTotal > 0;

  // --- Jeu « QCM » (une formule, 3 propositions) ------------------------------
  const [quiz, setQuiz] = useState(() => generateQuiz(catalog));
  const [quizPick, setQuizPick] = useState(null);
  const [quizScore, setQuizScore] = useState({ score: 0, streak: 0, best: 0 });
  const [quizDone, setQuizDone] = useState(0);
  const nextQuiz = useCallback(() => {
    setQuiz(generateQuiz(pool));
    setQuizPick(null);
  }, [pool]);
  const answerQuiz = (i) => {
    if (quizPick != null) return;
    setQuizPick(i);
    const ok = i === quiz.correctIndex;
    setQuizScore((s) => applyAnswer(s, ok));
    if (ok) setQuizDone((n) => n + 1);
  };

  // --- Mode « Formation » (leçons) -------------------------------------------
  const COMPLETED_KEY = 'asul.lessons.completed';
  const [completed, setCompleted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COMPLETED_KEY)) || [];
    } catch {
      return [];
    }
  });
  const markCompleted = useCallback((id) => {
    setCompleted((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try { localStorage.setItem(COMPLETED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const [lesson, setLesson] = useState(null); // leçon en cours (ou rappel)
  const [phase, setPhase] = useState('theory'); // theory | practice | eval | done
  const [slideIdx, setSlideIdx] = useState(0);
  const [pracIdx, setPracIdx] = useState(0);
  const [ans, setAns] = useState('');
  const [fb, setFb] = useState(null); // { ok, expected }
  const [evalIdx, setEvalIdx] = useState(0);

  const startLesson = useCallback((l) => {
    setLesson(l);
    setPhase('theory');
    setSlideIdx(0);
    setPracIdx(0);
    setAns('');
    setFb(null);
    setEvalIdx(0);
  }, []);
  const startRecall = () => {
    const rec = generateRecall(completed, 6, 10);
    if (rec) startLesson(rec);
  };
  const leaveLesson = () => {
    setLesson(null);
    setPhase('theory');
    setAns('');
    setFb(null);
  };

  // `override` : valeur déjà mise à jour par une macro à auto-validation
  // (voir codeKeyHandler) ; un événement React est ignoré.
  const submitAns = (override) => {
    const value = typeof override === 'string' ? override : ans;
    if (!lesson || !value.trim()) return;
    if (phase === 'practice') {
      const item = lesson.practice[pracIdx];
      if (checkLessonAnswer(value, item.code)) {
        if (pracIdx + 1 >= lesson.practice.length) {
          setFb({ ok: true, expected: item.code });
          setTimeout(() => {
            setFb(null); setAns('');
            if (lesson.eval.length) { setPhase('eval'); setEvalIdx(0); }
            else { setPhase('done'); markCompleted(lesson.id); }
          }, 550);
        } else {
          setPracIdx(pracIdx + 1); setFb({ ok: true, expected: item.code }); setAns('');
          setTimeout(() => setFb(null), 550);
        }
      } else {
        setFb({ ok: false, expected: item.code });
      }
    } else if (phase === 'eval') {
      const q = lesson.eval[evalIdx];
      if (checkLessonAnswer(value, q.answer)) {
        if (evalIdx + 1 >= lesson.eval.length) {
          setFb({ ok: true, expected: q.answer });
          setTimeout(() => {
            setFb(null); setAns(''); setPhase('done');
            if (!lesson.recall) markCompleted(lesson.id);
          }, 600);
        } else {
          setFb({ ok: true, expected: q.answer }); setAns(''); setEvalIdx(evalIdx + 1);
          setTimeout(() => setFb(null), 450);
        }
      } else {
        setFb({ ok: false, expected: q.answer });
      }
    }
  };

  // --- Onglet Traduction : phrase → code, chronométré -------------------------
  const [puzzle, setPuzzle] = useState(() => generateTranslation());
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null); // { ok, expected }
  const [score, setScore] = useState({ score: 0, streak: 0, best: 0 });
  const [solved, setSolved] = useState(0);
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Chronomètre : actif seulement pendant la traduction.
  useEffect(() => {
    if (mode !== 'review' || activity !== 'translate') return undefined;
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 100);
    return () => clearInterval(id);
  }, [mode, activity, solved]);

  const nextPuzzle = useCallback(() => {
    setPuzzle(generateTranslation());
    setAnswer('');
    setFeedback(null);
  }, []);

  const submitAnswer = (override) => {
    const value = typeof override === 'string' ? override : answer;
    if (!value.trim()) return;
    const ok = checkAnswer(value, puzzle.code);
    setFeedback({ ok, expected: puzzle.code });
    setScore((s) => applyAnswer(s, ok));
    if (ok) setSolved((n) => n + 1);
  };

  // Filtre des familles (commun aux jeux).
  const renderGroups = () => (
    <div className="dv-help-card" style={{ marginBottom: 16, padding: 14 }}>
      <h5 style={{ margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a1a1aa', fontSize: 11.5 }}>
        Familles de codes à réviser
      </h5>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {TRAINING_GROUPS.map((g) => {
          const checked = groups.includes(g.id);
          return (
            <label
              key={g.id}
              className={`btn btn-sm ${checked ? 'btn-primary' : 'btn-secondary'}`}
              style={{ cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleGroup(g.id)}
                style={{ marginRight: 6 }}
              />
              {g.label}
            </label>
          );
        })}
      </div>
    </div>
  );

  // Jeu 1 : memory (retourner les cartes).
  const renderPairs = () => (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={newGame} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Play size={14} /> Nouvelle partie
        </button>
        {game && (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Paires trouvées : {matched.size}/{pairsTotal} · coups : {moves}
          </span>
        )}
      </div>
      {!game ? (
        <p className="dv-hint">Lance une partie : retourne les cartes et associe chaque code à sa signification.</p>
      ) : (
        <>
          {won && (
            <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
              <Trophy size={14} /> Bravo ! {pairsTotal} paires en {moves} coups.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {game.cards.map((card) => {
              const open = flipped.some((c) => c.id === card.id) || matched.has(card.pairId);
              const done = matched.has(card.pairId);
              return (
                <button
                  key={card.id}
                  onClick={() => onCardClick(card)}
                  disabled={open}
                  style={{
                    minHeight: 74,
                    padding: 8,
                    borderRadius: 10,
                    border: `1px solid ${done ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    background: open ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                    color: open ? 'var(--text-primary)' : 'transparent',
                    fontFamily: card.side === 'code' ? 'var(--font-mono)' : 'inherit',
                    fontSize: card.side === 'code' ? 20 : 12,
                    fontWeight: card.side === 'code' ? 800 : 600,
                    cursor: open ? 'default' : 'pointer',
                  }}
                >
                  {open ? card.text : '•'}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // Jeu 2 : relier les codes à leur sens par des flèches.
  const renderMatch = () => (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={newMatch} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Play size={14} /> Nouvelle grille
        </button>
        {match && (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Reliées : {conns.filter((c) => c.ok).length}/{matchTotal}
          </span>
        )}
      </div>
      {!match ? (
        <p className="dv-hint">Clique un code à gauche puis sa signification à droite : la flèche se dessine.</p>
      ) : (
        <MatchBoard match={match} conns={conns} selLeft={selLeft} badConn={badConn} onLeft={onLeftClick} onRight={onRightClick} won={matchWon} />
      )}
    </div>
  );

  // Jeu 3 : QCM — une formule, 3 propositions de sens.
  const renderQuiz = () => (
    <div>
      <div className="dv-help-card" style={{ marginBottom: 12, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span><Zap size={14} /> Score : <strong>{quizScore.score}</strong></span>
        <span><Sparkles size={14} /> Série : <strong>{quizScore.streak}</strong> (record {quizScore.best})</span>
        <span><Trophy size={14} /> Réussis : <strong>{quizDone}</strong></span>
      </div>
      <div className="dv-help-card" style={{ marginBottom: 12 }}>
        <h5>Que signifie ce code ?</h5>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, margin: '10px 0 14px' }}>{quiz.prompt}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {quiz.options.map((opt, i) => {
            const answered = quizPick != null;
            const isCorrect = i === quiz.correctIndex;
            const picked = quizPick === i;
            const color = answered && isCorrect ? 'var(--accent)' : answered && picked && !isCorrect ? '#e84848' : 'var(--border-subtle)';
            return (
              <button
                key={i}
                type="button"
                className="btn btn-secondary"
                disabled={answered}
                onClick={() => answerQuiz(i)}
                style={{ justifyContent: 'flex-start', textAlign: 'left', display: 'flex', alignItems: 'center', borderColor: color, borderWidth: answered ? 2 : 1 }}
              >
                {opt}
                {answered && isCorrect && <span style={{ marginLeft: 'auto' }}><Check size={14} /></span>}
                {answered && picked && !isCorrect && <span style={{ marginLeft: 'auto' }}><X size={14} /></span>}
              </button>
            );
          })}
        </div>
        {quizPick != null && (
          <button className="btn btn-primary btn-sm" onClick={nextQuiz} style={{ marginTop: 12 }}>Question suivante →</button>
        )}
      </div>
    </div>
  );

  // Activité 4 : traduction chronométrée (phrase → code).
  const renderTranslate = () => (
    <div>
      <div className="dv-help-card" style={{ marginBottom: 12, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span><Zap size={14} /> Score : <strong>{score.score}</strong></span>
        <span><Sparkles size={14} /> Série : <strong>{score.streak}</strong> (record {score.best})</span>
        <span><Trophy size={14} /> Résolus : <strong>{solved}</strong></span>
        <span><Timer size={14} /> {elapsed.toFixed(1)} s</span>
      </div>

      <div className="dv-help-card" style={{ marginBottom: 12 }}>
        <h5>Traduis cette situation en code DataVolley</h5>
        <p style={{ fontSize: 15, margin: '8px 0 12px' }}>{puzzle.desc}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            autoFocus
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={codeKeyHandler(answer, setAnswer, submitAnswer)}
            placeholder="ex. *09AV6#"
            style={{ flex: 1, minWidth: 180, fontFamily: 'var(--font-mono)', fontSize: 18, padding: '8px 10px' }}
          />
          <button className="btn btn-primary" onClick={submitAnswer}>
            <Check size={14} /> Valider
          </button>
          <button className="btn btn-secondary" onClick={nextPuzzle} title="Passer">
            <RotateCcw size={14} /> Passer
          </button>
        </div>

        {feedback && (
          <p style={{ marginTop: 10, fontWeight: 700, color: feedback.ok ? 'var(--accent)' : '#e84848' }}>
            {feedback.ok ? (
              <><Check size={14} /> Bien joué !</>
            ) : (
              <><X size={14} /> Attendu : <code>{feedback.expected}</code></>
            )}
          </p>
        )}
        {feedback && (
          <button className="btn btn-primary btn-sm" onClick={nextPuzzle} style={{ marginTop: 8 }}>
            Suivant →
          </button>
        )}
      </div>

      <p className="dv-hint">
        Le code commence par <code>*</code> (domicile) ou <code>a</code> (extérieur), puis le numéro du
        joueur, l’action, le type/la combinaison, les zones et l’évaluation. Le clavier AZERTY Scout
        s’applique ici comme en match : chiffres du haut = évaluations, numéros et zones au pavé
        numérique, <kbd>{formatKeyLabel(shortcuts.validate)}</kbd> pour valider.
      </p>
    </div>
  );

  // Mode « Réviser » : sélecteur d'activité + jeu actif.
  const renderReview = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a1a1aa', marginBottom: 6 }}>
          Choisir un mini-jeu d’entraînement
        </div>
        <div className="mode-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 10, padding: 8 }}>
          <button className={`mode-btn ${activity === 'pairs' ? 'active' : ''}`} onClick={() => setActivity('pairs')}>
            <Dices size={16} /> 01 · Paires (Memory)
          </button>
          <button className={`mode-btn ${activity === 'match' ? 'active' : ''}`} onClick={() => setActivity('match')}>
            <Shuffle size={16} /> 02 · Relier
          </button>
          <button className={`mode-btn ${activity === 'quiz' ? 'active' : ''}`} onClick={() => setActivity('quiz')}>
            <ListChecks size={16} /> 03 · QCM
          </button>
          <button className={`mode-btn ${activity === 'translate' ? 'active' : ''}`} onClick={() => setActivity('translate')}>
            <Timer size={16} /> 04 · Traduction Chrono
          </button>
        </div>
      </div>
      {activity !== 'translate' && renderGroups()}
      {activity === 'pairs' && renderPairs()}
      {activity === 'match' && renderMatch()}
      {activity === 'quiz' && renderQuiz()}
      {activity === 'translate' && renderTranslate()}
    </div>
  );

  // Mode « Formation » : chemin (Duolingo) ou leçon en cours.
  const renderTraining = () => (lesson ? renderLessonView() : renderPath());

  const renderPath = () => {
    const isUnlocked = (i) => i === 0 || completed.includes(LESSONS[i - 1].id);
    return (
      <div>
        <div className="ls-path-head">
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Apprends le langage DataVolley pas à pas, en tapant les codes. Termine les leçons dans l’ordre
            (il faut <strong>10/10</strong> à l’épreuve finale). Les leçons réussies restent accessibles.
          </p>
          <button className="btn btn-secondary" onClick={startRecall} disabled={completed.length === 0}
            title={completed.length === 0 ? 'Termine d’abord une leçon' : 'Réviser des notions déjà vues (mélange aléatoire)'}>
            <Shuffle size={14} /> Leçon de rappel
          </button>
        </div>
        <div className="ls-path">
          {LESSONS.map((l, i) => {
            const isDone = completed.includes(l.id);
            const unlocked = isUnlocked(i);
            return (
              <div key={l.id} className="ls-node-row">
                <button
                  type="button"
                  className={`ls-node ${isDone ? 'done' : unlocked ? 'active' : 'locked'}`}
                  style={{ '--ls-color': l.color }}
                  disabled={!unlocked}
                  onClick={() => unlocked && startLesson(l)}
                  title={unlocked ? l.subtitle : 'Termine la leçon précédente'}
                >
                  {isDone ? <Trophy size={18} /> : unlocked ? (i + 1) : <Lock size={15} />}
                </button>
                <div className="ls-node-text">
                  <strong>{i + 1}. {l.title}</strong>
                  <span>{l.subtitle}{isDone ? ' · réussie' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLessonView = () => {
    const total = lesson.theory.length + lesson.practice.length + lesson.eval.length;
    let step = 0;
    if (phase === 'theory') step = slideIdx;
    else if (phase === 'practice') step = lesson.theory.length + pracIdx;
    else if (phase === 'eval') step = lesson.theory.length + lesson.practice.length + evalIdx;
    else step = total;
    const pct = total ? Math.round((step / total) * 100) : 0;

    const inputCls = fb ? (fb.ok ? 'ok' : 'bad') : '';
    const answerBox = (
      <div>
        <div className="ls-answer">
          <input
            autoFocus
            type="text"
            value={ans}
            className={inputCls}
            onChange={(e) => setAns(e.target.value)}
            onKeyDown={codeKeyHandler(ans, setAns, submitAns)}
            placeholder="tape le code…"
          />
          <button className="btn btn-primary" onClick={submitAns}><Check size={14} /> Valider</button>
        </div>
        <p className="dv-hint" style={{ margin: '8px 0 0' }}>
          Clavier AZERTY Scout actif comme en match : <kbd>1</kbd>→# <kbd>2</kbd>→+ <kbd>3</kbd>→! <kbd>4</kbd>→−
          {' '}<kbd>5</kbd>→/ <kbd>6</kbd>→= · numéros et zones au pavé numérique ·{' '}
          <kbd>{formatKeyLabel(shortcuts.validate)}</kbd> pour valider.
        </p>
      </div>
    );

    return (
      <div className="ls-view">
        <div className="ls-title-row">
          <button className="btn btn-secondary btn-sm" onClick={leaveLesson}><ChevronLeft size={14} /> Retour</button>
          <h3 style={{ margin: 0, color: lesson.color }}>{lesson.title}</h3>
        </div>
        <div className="ls-bar"><i style={{ width: `${pct}%` }} /></div>

        {phase === 'theory' && (
          <div>
            <div className="ls-slide">
              <h3>
                {lesson.theory[slideIdx].from ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{lesson.theory[slideIdx].from} · </span>
                ) : null}
                {lesson.theory[slideIdx].title}
              </h3>
              <p>{lesson.theory[slideIdx].text}</p>
              {lesson.theory[slideIdx].code && (
                <div className="ls-code">
                  <code>{lesson.theory[slideIdx].code}</code>
                  <span>{lesson.theory[slideIdx].meaning}</span>
                </div>
              )}
            </div>
            <div className="ls-actions">
              <button className="btn btn-secondary" onClick={() => setSlideIdx(Math.max(0, slideIdx - 1))} disabled={slideIdx === 0}>
                <ChevronLeft size={14} /> Précédent
              </button>
              <span className="ls-counter">{slideIdx + 1} / {lesson.theory.length}</span>
              {slideIdx + 1 < lesson.theory.length ? (
                <button className="btn btn-primary" onClick={() => setSlideIdx(slideIdx + 1)}>Suivant <ChevronRight size={14} /></button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => { setPhase(lesson.practice.length ? 'practice' : 'eval'); setPracIdx(0); setAns(''); setFb(null); }}
                >
                  {lesson.practice.length ? 'Commencer l’entraînement' : 'Passer à l’épreuve'} <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'practice' && (
          <div>
            <p className="ls-counter">Code {pracIdx + 1} / {lesson.practice.length}</p>
            <div className="ls-slide">
              <p className="ls-prompt" style={{ margin: '0 0 6px' }}>Traduis cette situation en code DataVolley :</p>
              <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{lesson.practice[pracIdx].meaning}</p>
            </div>
            {answerBox}
            {fb && (
              <p className={`ls-fb ${fb.ok ? 'ok' : 'bad'}`}>
                {fb.ok ? <><Check size={14} /> Bien !</> : <><X size={14} /> Attendu : <code>{fb.expected}</code> — réessaie</>}
              </p>
            )}
          </div>
        )}

        {phase === 'eval' && (
          <div>
            <p className="ls-counter">
              Question {evalIdx + 1} / {lesson.eval.length}
              {lesson.recall && lesson.eval[evalIdx].from ? ` · ${lesson.eval[evalIdx].from}` : ''}
            </p>
            <div className="ls-slide">
              <p className="ls-prompt" style={{ margin: '0 0 6px' }}>Traduis en code DataVolley :</p>
              <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{lesson.eval[evalIdx].prompt}</p>
            </div>
            {answerBox}
            {fb && (
              <p className={`ls-fb ${fb.ok ? 'ok' : 'bad'}`}>
                {fb.ok ? <><Check size={14} /> Correct !</> : <><X size={14} /> Attendu : <code>{fb.expected}</code> — réessaie</>}
              </p>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="ls-slide" style={{ textAlign: 'center' }}>
            <p className="ls-done-badge" style={{ justifyContent: 'center' }}>
              <Trophy size={26} /> {lesson.recall ? 'Rappel terminé !' : 'Leçon réussie !'}
            </p>
            <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>10/10 à l’épreuve finale. Bravo !</p>
            <div className="ls-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={leaveLesson}><ChevronLeft size={14} /> Revenir aux leçons</button>
              {!lesson.recall && LESSONS.findIndex((x) => x.id === lesson.id) < LESSONS.length - 1 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => { const i = LESSONS.findIndex((x) => x.id === lesson.id); if (i >= 0 && i + 1 < LESSONS.length) startLesson(LESSONS[i + 1]); }}
                >
                  Leçon suivante <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dashboard asul-modern">
      <AppNavigation user={user} onLogout={onLogout} />

      <div className="dashboard-content">
        <section className="pk-hero-banner" style={{ marginBottom: 22 }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <PancakeLogo size={52} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.05em', color: '#ffffff', lineHeight: 1.1 }}>
                  Pancake <span style={{ color: '#c8a165' }}>Stats</span> · Académie
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#e8c98f', letterSpacing: '0.08em', marginTop: 2 }}>
                  ENTRAÎNEMENT INTENSIF AU CODAGE
                </div>
              </div>
            </div>
            <h1 className="pk-hero-title" style={{ fontSize: 38 }}>
              Deviens un pro du <span>codage DataVolley</span>
            </h1>
            <p className="pk-hero-lead" style={{ marginBottom: 18 }}>
              <strong>Réviser</strong> : 4 mini-jeux interactifs (Paires, Relier, QCM et Traduction chronométrée) pour automatiser tes réflexes clavier.{' '}
              <strong>Formation</strong> : 11 leçons progressives, de la théorie à la pratique, validées par une épreuve finale à 10/10.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span className="pk-mono" style={{ padding: '4px 10px', background: 'rgba(16, 185, 129, 0.14)', border: '1px solid #059669', color: '#10b981', fontSize: 11.5, fontWeight: 700 }}>
                ✓ {completed.length} / {LESSONS.length} LEÇONS VALIDÉES
              </span>
              <span className="pk-mono" style={{ padding: '4px 10px', background: 'rgba(200, 161, 101, 0.14)', border: '1px solid #c8a165', color: '#e8c98f', fontSize: 11.5, fontWeight: 700 }}>
                4 MINI-JEUX D’ENTRAÎNEMENT
              </span>
              <span className="pk-mono" style={{ padding: '4px 10px', background: 'rgba(14, 165, 233, 0.14)', border: '1px solid #0284c7', color: '#38bdf8', fontSize: 11.5, fontWeight: 700 }}>
                SYNTAXE OFFICIELLE DV4
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowShortcuts(true)}
                title="Clavier AZERTY Scout (macros) et raccourcis communs à tous les modes de codage"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Keyboard size={13} /> Raccourcis clavier
              </button>
            </div>
          </div>
          <AnimatedPancake size={145} showTelemetry={true} />
        </section>

        <div className="mode-selector" style={{ marginBottom: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 8 }}>
          <button className={`mode-btn ${mode === 'review' ? 'active' : ''}`} onClick={() => setMode('review')}>
            <Dices size={16} /> Mode Réviser (Mini-Jeux & Chrono)
          </button>
          <button className={`mode-btn ${mode === 'training' ? 'active' : ''}`} onClick={() => setMode('training')}>
            <BookOpen size={16} /> Mode Formation (Parcours 11 Leçons)
          </button>
        </div>

        {mode === 'review' ? renderReview() : renderTraining()}

        {/* Modale Raccourcis clavier : réglages communs à tous les modes */}
        {showShortcuts && (
          <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 760, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <h2>Raccourcis — Académie</h2>
              <p className="dv-hint">
                Ces touches et le profil de Keyboard Remapping (AZERTY Scout, macros) sont ceux de Data Volley,
                du Direct et de l’Entraînement : un réglage fait ici vaut dans <strong>tous</strong> les modes qui
                codent au clavier.
              </p>
              <ShortcutSettings shortcuts={shortcuts} onChange={setShortcuts} video={false} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowShortcuts(false)}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Jeu « Relier » : 2 colonnes + flèches SVG reliant code ↔ signification ---
function MatchBoard({ match, conns, selLeft, badConn, onLeft, onRight, won }) {
  const containerRef = useRef(null);
  const refs = useRef({}); // `l${pairId}` / `r${id}` -> élément DOM
  const [lines, setLines] = useState([]);

  const recompute = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const cRect = c.getBoundingClientRect();
    const out = [];
    for (const conn of conns) {
      const l = refs.current[`l${conn.pairId}`];
      const r = refs.current[`r${conn.rightId}`];
      if (!l || !r) continue;
      const lr = l.getBoundingClientRect();
      const rr = r.getBoundingClientRect();
      out.push({
        id: `${conn.pairId}-${conn.rightId}`,
        ok: conn.ok,
        x1: lr.right - cRect.left,
        y1: lr.top + lr.height / 2 - cRect.top,
        x2: rr.left - cRect.left,
        y2: rr.top + rr.height / 2 - cRect.top,
      });
    }
    setLines(out);
  }, [conns]);

  useLayoutEffect(() => { recompute(); }, [recompute]);
  useEffect(() => {
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute]);

  const box = (state) => ({
    padding: '10px 12px',
    borderRadius: 8,
    border: `2px solid ${state === 'bad' ? '#e84848' : state === 'ok' || state === 'sel' ? 'var(--accent)' : 'var(--border-subtle)'}`,
    background: state === 'sel' ? 'rgba(200,150,92,0.12)' : 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    fontSize: 13,
  });

  return (
    <div>
      {won && (
        <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
          <Trophy size={14} /> Toutes les paires sont reliées !
        </p>
      )}
      <div ref={containerRef} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 56 }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          <defs>
            <marker id="mb-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--accent)" />
            </marker>
          </defs>
          {lines.map((ln) => (
            <line
              key={ln.id}
              x1={ln.x1}
              y1={ln.y1}
              x2={ln.x2}
              y2={ln.y2}
              stroke={ln.ok ? 'var(--accent)' : '#e84848'}
              strokeWidth={2}
              markerEnd="url(#mb-arrow)"
              opacity={ln.ok ? 1 : 0.7}
            />
          ))}
        </svg>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          {match.left.map((it) => {
            const done = conns.some((c) => c.ok && c.pairId === it.pairId);
            const sel = selLeft === it.pairId;
            const bad = badConn && badConn.pairId === it.pairId;
            return (
              <button
                key={`l${it.id}`}
                type="button"
                ref={(el) => { refs.current[`l${it.pairId}`] = el; }}
                style={{ ...box(bad ? 'bad' : done ? 'ok' : sel ? 'sel' : ''), fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16 }}
                onClick={() => onLeft(it)}
              >
                {it.text}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          {match.right.map((it) => {
            const done = conns.some((c) => c.ok && c.rightId === it.id);
            const bad = badConn && badConn.rightId === it.id;
            return (
              <button
                key={`r${it.id}`}
                type="button"
                ref={(el) => { refs.current[`r${it.id}`] = el; }}
                style={box(bad ? 'bad' : done ? 'ok' : '')}
                onClick={() => onRight(it)}
              >
                {it.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
