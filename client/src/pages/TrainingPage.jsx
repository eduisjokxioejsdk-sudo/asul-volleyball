import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNavigation from '../components/AppNavigation';
import ShortcutSettings from '../components/ShortcutSettings';
import useCodingKeyboard from '../hooks/useCodingKeyboard';
import { academyAPI } from '../services/api';
import { handleRemappedKeyDown } from '../utils/keyboardRemap';
import { formatKeyLabel, matchesShortcut } from '../utils/shortcuts';
import { ACADEMY_WORLDS, ACADEMY_UNIT_BY_ID, ACADEMY_UNITS, validateAcademyAnswer } from '../utils/academy';
import { BookOpen, Check, ChevronLeft, ChevronRight, Flame, Keyboard, Lock, Play, RotateCcw, Sparkles, Trophy, X, Zap } from '../components/icons';

const EMPTY_PROGRESS = { version: 1, completed: [], xp: 0, level: 1, streak: 0, bestStreak: 0, badges: [], lastActivityDate: null };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isYesterday(date) {
  if (!date) return false;
  const previous = new Date(`${date}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() + 1);
  return previous.toISOString().slice(0, 10) === todayKey();
}

function cleanProgress(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY_PROGRESS;
  return {
    ...EMPTY_PROGRESS,
    ...raw,
    completed: Array.isArray(raw.completed) ? raw.completed : [],
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    xp: Number(raw.xp) || 0,
    level: Number(raw.level) || 1,
    streak: Number(raw.streak) || 0,
    bestStreak: Number(raw.bestStreak) || 0,
  };
}

export default function TrainingPage({ user, onLogout }) {
  const navigate = useNavigate();
  const { shortcuts, setShortcuts, keymapProfile } = useCodingKeyboard();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('loading');
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const [activeUnitId, setActiveUnitId] = useState(null);
  const [phase, setPhase] = useState('');
  const [conceptIndex, setConceptIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState([]);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [tab, setTab] = useState('all');
  const [saveRetry, setSaveRetry] = useState(0);

  const completedSet = useMemo(() => new Set(progress.completed), [progress.completed]);
  const activeUnit = activeUnitId ? ACADEMY_UNIT_BY_ID[activeUnitId] : null;
  const activeQuestion = activeUnit?.questions?.[questionIndex];
  const nextUnit = ACADEMY_UNITS.find((unit) => !completedSet.has(unit.id));
  const percent = Math.round((completedSet.size / ACADEMY_UNITS.length) * 100);
  const dailyDone = progress.lastActivityDate === todayKey();

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setLoadFailed(false);
    setSaveState('loading');
    academyAPI.getProgress()
      .then(({ data }) => {
        if (!alive) return;
        setProgress(cleanProgress(data?.progress));
        setSaveState('saved');
      })
      .catch(() => {
        if (!alive) return;
        setProgress(EMPTY_PROGRESS);
        setLoadFailed(true);
        setSaveState('error');
      })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [user?.id, loadRetry]);

  useEffect(() => {
    if (!loaded || loadFailed) return undefined;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      academyAPI.saveProgress(progress)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [progress, loaded, loadFailed, saveRetry]);

  const retryProgress = () => {
    if (loadFailed) {
      setLoaded(false);
      setSaveState('loading');
      setLoadRetry((value) => value + 1);
    } else {
      setSaveRetry((value) => value + 1);
      setSaveState('saving');
    }
  };

  const closeUnit = () => {
    setActiveUnitId(null);
    setPhase('');
    setAnswer('');
    setFeedback(null);
  };

  const startUnit = (unit) => {
    setActiveUnitId(unit.id);
    setConceptIndex(0);
    setQuestionIndex(0);
    setTutorialIndex(0);
    setSessionAnswers([]);
    setAnswer('');
    setFeedback(null);
    setPhase(unit.kind === 'tutorial' ? 'tutorial' : unit.kind === 'simulation' ? 'simulation' : 'learn');
  };

  const finishUnit = useCallback((unit) => {
    const today = todayKey();
    setProgress((previous) => {
      if (previous.completed.includes(unit.id)) return previous;
      const streak = previous.lastActivityDate === today
        ? previous.streak
        : isYesterday(previous.lastActivityDate) ? previous.streak + 1 : 1;
      const xp = previous.xp + 25;
      const badges = new Set(previous.badges);
      if (previous.completed.length === 0) badges.add('first-level');
      if (unit.kind === 'simulation') badges.add('sim-first');
      if (streak >= 3) badges.add('streak-3');
      if (streak >= 7) badges.add('streak-7');
      return {
        ...previous,
        completed: [...previous.completed, unit.id],
        xp,
        level: Math.floor(xp / 100) + 1,
        streak,
        bestStreak: Math.max(previous.bestStreak, streak),
        badges: [...badges],
        lastActivityDate: today,
      };
    });
    setPhase('done');
  }, []);

  const submitAnswer = (override) => {
    if (!activeUnit || !activeQuestion || feedback) return;
    const value = typeof override === 'string' ? override : answer;
    if (!value.trim()) return;
    const ok = validateAcademyAnswer(value, activeQuestion.answer);
    setFeedback({ ok, expected: activeQuestion.answer });
    if (ok && activeUnit.kind === 'simulation') setSessionAnswers((previous) => [...previous, value.trim()]);
  };

  const nextChallenge = () => {
    if (!activeUnit) return;
    setFeedback(null);
    setAnswer('');
    if (questionIndex + 1 >= activeUnit.questions.length) finishUnit(activeUnit);
    else setQuestionIndex((index) => index + 1);
  };

  const nextTutorialStep = () => {
    const steps = activeUnit?.steps || [];
    if (tutorialIndex + 1 >= steps.length) finishUnit(activeUnit);
    else setTutorialIndex((index) => index + 1);
  };

  const handleCodeKeyDown = (event) => {
    const remap = handleRemappedKeyDown(event, {
      value: answer,
      profile: keymapProfile,
      onChange: setAnswer,
      onCommit: (finalValue) => submitAnswer(finalValue),
    });
    if (remap.handled) return;
    if (matchesShortcut(event, shortcuts.validate)) {
      event.preventDefault();
      submitAnswer();
    }
  };

  const visibleWorlds = ACADEMY_WORLDS.map((world) => ({
    ...world,
    units: world.units.filter((unit) => tab === 'all' || tab === unit.kind),
  })).filter((world) => world.units.length > 0);

  const isUnlocked = (unit) => {
    if (completedSet.has(unit.id)) return true;
    const index = ACADEMY_UNITS.findIndex((item) => item.id === unit.id);
    return index === 0 || completedSet.has(ACADEMY_UNITS[index - 1]?.id);
  };

  const saveLabel = saveState === 'loading' ? 'Connexion…' : saveState === 'saving' ? 'Sauvegarde…' : saveState === 'error' ? 'Hors ligne' : 'Sauvegardé';

  return (
    <div className="dashboard asul-modern academy-page">
      <AppNavigation user={user} onLogout={onLogout} />
      <main className="academy-shell">
        <header className="academy-hero">
          <div className="academy-hero-top">
            <span className="academy-brand"><span className="academy-brand-mark">A</span> ASUL · ACADÉMIE</span>
            <div className="academy-hero-stats">
              <span className="academy-stat"><Zap size={17} /> {progress.xp} XP</span>
              <span className="academy-stat"><Flame size={17} /> {progress.streak} jours</span>
              <span className="academy-stat academy-level">NIVEAU {progress.level}</span>
            </div>
          </div>
          <div className="academy-hero-main">
            <div>
              <p className="academy-kicker">LE TERRAIN EST À TOI</p>
              <h1>Apprends. Code. <em>Domine.</em></h1>
              <p className="academy-hero-copy">Des codes aux matchs en direct : progresse à ton rythme, teste sans risque, et fais monter ton niveau.</p>
              <div className="academy-hero-actions">
                <button className="academy-primary" onClick={() => nextUnit && startUnit(nextUnit)} disabled={!loaded || loadFailed || !nextUnit}>
                  <Play size={17} fill="currentColor" /> {!loaded ? 'Chargement du parcours…' : nextUnit ? 'Continuer le parcours' : 'Parcours terminé !'}
                </button>
                <button className="academy-ghost" onClick={() => setShowShortcuts(true)}><Keyboard size={16} /> Clavier AZERTY Scout</button>
              </div>
            </div>
            <div className="academy-mascot" aria-hidden="true"><span className="academy-orbit orbit-one" /><span className="academy-orbit orbit-two" /><span>🏐</span><b>+25 XP</b></div>
          </div>
          <div className="academy-progress-wrap">
            <div className="academy-progress-label"><span>PROGRESSION GLOBALE</span><strong>{completedSet.size} / {ACADEMY_UNITS.length} NIVEAUX</strong></div>
            <div className="academy-progress-track"><i style={{ width: `${percent}%` }} /></div>
          </div>
          <div className="academy-quest"><Sparkles size={16} /><span><b>QUÊTE DU JOUR</b> Valide un niveau et entretiens ta série.</span><strong>{dailyDone ? 'TERMINÉE ✓' : '+25 XP'}</strong></div>
        </header>

        {saveState === 'error' && (
          <div className="academy-save-warning" role="status">
            <span>{loadFailed ? 'La progression du compte ne peut pas être chargée. Réessaie pour commencer le parcours.' : 'La progression n’a pas pu être enregistrée. Tes validations restent visibles ici; réessaie pour les synchroniser.'}</span>
            <button onClick={retryProgress}><RotateCcw size={14} /> Réessayer</button>
          </div>
        )}

        <section className="academy-map-section">
          <div className="academy-section-heading">
            <div><p className="academy-kicker">CHOISIS TA PROCHAINE MISSION</p><h2>La carte des niveaux</h2></div>
            <div className="academy-save-status"><span className={`academy-save-dot ${saveState}`} />{saveLabel}</div>
          </div>
          <div className="academy-tabs" role="tablist" aria-label="Filtrer les niveaux">
            {[['all', 'Tout le parcours'], ['codes', 'Codes DataVolley'], ['tutorial', 'Tutoriels app'], ['simulation', 'Simulations']].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          <div className="academy-worlds">
            {visibleWorlds.map((world, worldIndex) => {
              const worldDone = world.units.filter((unit) => completedSet.has(unit.id)).length;
              return (
                <section className="academy-world" key={world.id} style={{ '--world-color': world.color }}>
                  <div className="academy-world-head">
                    <div className="academy-world-icon">{world.emoji}</div>
                    <div><span>MONDE {String(worldIndex + 1).padStart(2, '0')}</span><h3>{world.title}</h3></div>
                    <strong>{worldDone}/{world.units.length}</strong>
                  </div>
                  <div className="academy-node-grid">
                    {world.units.map((unit) => {
                      const done = completedSet.has(unit.id);
                      const unlocked = isUnlocked(unit);
                      return (
                        <button key={unit.id} className={`academy-node ${done ? 'done' : ''} ${unlocked && loaded && !loadFailed ? 'unlocked' : 'locked'}`} disabled={!unlocked || !loaded || loadFailed} onClick={() => startUnit(unit)} title={unlocked ? unit.subtitle : 'Termine le niveau précédent pour débloquer celui-ci'}>
                          <span className="academy-node-symbol">{done ? <Check size={21} /> : unlocked ? unit.kind === 'tutorial' ? <BookOpen size={20} /> : unit.kind === 'simulation' ? <Play size={19} /> : <Zap size={20} /> : <Lock size={16} />}</span>
                          <span className="academy-node-title">{unit.title}</span>
                          <span className="academy-node-meta">{done ? 'VALIDÉ · +25 XP' : unlocked ? unit.kind === 'tutorial' ? 'TUTORIEL' : unit.kind === 'simulation' ? 'SIMULATION' : 'NIVEAU OUVERT' : 'VERROUILLÉ'}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="academy-badges">
            <div><Trophy size={18} /><b>TES BADGES</b><span>Les victoires s’accumulent, sans pénalité si tu te trompes.</span></div>
            {[
              ['first-level', 'Premier niveau'], ['sim-first', 'Explorateur du terrain'], ['streak-3', 'Série de 3 jours'], ['streak-7', 'Série de 7 jours'],
            ].map(([id, label]) => <span key={id} className={`academy-badge ${progress.badges.includes(id) ? 'earned' : ''}`}>{progress.badges.includes(id) ? '✦' : '◇'} {label}</span>)}
          </div>
        </section>
      </main>

      {activeUnit && (
        <div className="academy-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUnit(); }}>
          <section className="academy-modal" role="dialog" aria-modal="true" aria-labelledby="academy-modal-title" key={activeUnit.id}>
            <div className="academy-modal-top"><button className="academy-back" onClick={closeUnit}><ChevronLeft size={16} /> Carte</button><span>+25 XP À GAGNER · AUCUNE PÉNALITÉ</span><button className="academy-close" aria-label="Fermer" onClick={closeUnit}><X size={18} /></button></div>
            <div className="academy-modal-progress"><i style={{ width: phase === 'done' ? '100%' : activeUnit.kind === 'tutorial' ? `${((tutorialIndex + 1) / activeUnit.steps.length) * 100}%` : phase === 'challenge' ? `${((questionIndex + 1) / activeUnit.questions.length) * 100}%` : '25%' }} /></div>

            {phase === 'done' ? (
              <div className="academy-complete">
                <div className="academy-trophy-burst">🏆</div><p className="academy-kicker">NIVEAU TERMINÉ</p><h2 id="academy-modal-title">Bien joué !</h2><p>{activeUnit.kind === 'simulation' ? 'Point simulé ! Ton rallye est resté sur le terrain fictif.' : 'Tu viens de gagner'} <strong>25 XP</strong>. Le prochain niveau est maintenant ouvert.</p>
                <div className="academy-complete-actions"><button className="academy-primary" onClick={closeUnit}>Retour à la carte</button>{nextUnit && <button className="academy-ghost" onClick={() => startUnit(nextUnit)}>Niveau suivant <ChevronRight size={16} /></button>}</div>
              </div>
            ) : (
              <>
                <div className="academy-modal-content">
                  <div className="academy-modal-world">{activeUnit.worldTitle}</div>
                  <h2 id="academy-modal-title">{activeUnit.title}</h2>
                  <p className="academy-modal-subtitle">{activeUnit.subtitle || activeUnit.scenario}</p>

                  {activeUnit.kind === 'codes' && phase === 'learn' && activeUnit.items?.[conceptIndex] && (
                    <div className="academy-lesson-card">
                      <div className="academy-concept-count">NOTION {conceptIndex + 1} / {activeUnit.items.length}</div>
                      <h3>{activeUnit.items[conceptIndex].title}</h3>
                      <p>{activeUnit.items[conceptIndex].explanation}</p>
                      <div className="academy-code-example"><code>{activeUnit.items[conceptIndex].example}</code><span>EXEMPLE</span></div>
                      <button className="academy-primary academy-wide" onClick={() => {
                        if (conceptIndex + 1 >= activeUnit.items.length) { setPhase('challenge'); setQuestionIndex(0); }
                        else setConceptIndex((index) => index + 1);
                      }}>{conceptIndex + 1 >= activeUnit.items.length ? 'Lancer le défi' : 'Notion suivante'} <ChevronRight size={16} /></button>
                    </div>
                  )}

                  {activeUnit.kind === 'tutorial' && phase === 'tutorial' && (
                    <div className="academy-tutorial-step">
                      <div className="academy-tutorial-count">ÉTAPE {tutorialIndex + 1} / {activeUnit.steps.length}</div>
                      <div className="academy-tutorial-visual">{activeUnit.tutorial?.path === '/teams' ? '👥' : activeUnit.tutorial?.path.includes('video') ? '🎬' : activeUnit.tutorial?.path.includes('trajectory') ? '🗺️' : activeUnit.tutorial?.path.includes('auto-codes') ? '⌨️' : '🏐'}</div>
                      <p>{activeUnit.steps[tutorialIndex]}</p>
                      <div className="academy-tutorial-actions">
                        <button className="academy-ghost" onClick={() => window.open(activeUnit.path, '_blank', 'noopener,noreferrer')}>Ouvrir l’écran concerné ↗</button>
                        <button className="academy-primary" onClick={nextTutorialStep}>{tutorialIndex + 1 >= activeUnit.steps.length ? 'Terminer le tutoriel' : 'Étape suivante'} <ChevronRight size={16} /></button>
                      </div>
                      <p className="academy-sandbox-note">Le tutoriel t’explique le parcours. Les manipulations dans ton app restent séparées de ce niveau.</p>
                    </div>
                  )}

                  {activeUnit.kind === 'simulation' && phase === 'simulation' && (
                    <div className="academy-simulation-intro"><div className="academy-simulation-art">🎯</div><p>{activeUnit.scenario}</p>{activeUnit.initialCode && <div className="academy-broken-code"><span>CODE À RÉPARER</span><code>{activeUnit.initialCode}</code></div>}<div className="academy-sandbox-note">Terrain fictif · aucune donnée de match n’est modifiée.</div><button className="academy-primary academy-wide" onClick={() => { setPhase('challenge'); setQuestionIndex(0); }}>Entrer sur le terrain <Play size={16} /></button></div>
                  )}

                  {phase === 'challenge' && activeQuestion && (
                    <div className="academy-challenge">
                      {activeUnit.kind === 'simulation' && <div className="academy-live-console"><span>CONSOLE DU RALLYE · TERRAIN FICTIF</span>{activeUnit.initialCode && <code className="academy-broken-inline">À corriger : {activeUnit.initialCode}</code>}<div>{sessionAnswers.length ? sessionAnswers.map((code, index) => <code key={`${index}-${code}`}>{code}</code>) : <i>En attente du premier contact…</i>}</div></div>}
                      <div className="academy-question-count">DÉFI {questionIndex + 1} / {activeUnit.questions.length} <span>● ● ●</span></div>
                      <div className="academy-prompt">{activeQuestion.prompt}</div>
                      <div className="academy-answer-row"><input autoFocus value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={handleCodeKeyDown} placeholder="Tape ta réponse…" disabled={feedback?.ok} /><button className="academy-primary" onClick={() => submitAnswer()} disabled={feedback?.ok}><Check size={16} /> Vérifier</button></div>
                      <p className="academy-key-hint">Raccourcis AZERTY Scout actifs · <kbd>{formatKeyLabel(shortcuts.validate)}</kbd> pour valider.</p>
                      {feedback && <div className={`academy-feedback ${feedback.ok ? 'good' : 'retry'}`} role="status">{feedback.ok ? <><Check size={17} /> Exact ! Continue, tu ne perds rien en essayant.</> : <><X size={17} /> Pas encore. Regarde l’exemple puis réessaie. <code>{feedback.expected}</code></>}</div>}
                      {feedback?.ok && <button className="academy-primary academy-wide" onClick={nextChallenge}>{questionIndex + 1 >= activeUnit.questions.length ? 'Terminer le niveau' : 'Défi suivant'} <ChevronRight size={16} /></button>}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {showShortcuts && <ShortcutSettings shortcuts={shortcuts} setShortcuts={setShortcuts} onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
