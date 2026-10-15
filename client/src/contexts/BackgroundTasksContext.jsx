import { createContext, useCallback, useContext, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// File d'attente globale des tâches en arrière-plan (exports / téléchargements).
// Elle vit au niveau de l'application (au-dessus des routes), donc les tâches
// continuent de s'exécuter et restent visibles quand on navigue d'une page à
// l'autre. Les tâches sont exécutées UNE PAR UNE (file d'attente sérialisée).
// ---------------------------------------------------------------------------

const BackgroundTasksContext = createContext(null);

export function BackgroundTasksProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const queueRef = useRef([]); // [{ id, work }] en attente
  const runningRef = useRef(false);
  const idRef = useRef(0);

  const patchTask = useCallback((id, patch) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const runNext = useCallback(() => {
    if (runningRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    runningRef.current = true;
    patchTask(next.id, { status: 'running', progress: 0 });

    const update = (patch) => patchTask(next.id, patch);

    Promise.resolve()
      .then(() => next.work(update))
      .then(() => patchTask(next.id, { status: 'done', progress: 100 }))
      .catch((err) =>
        patchTask(next.id, {
          status: 'error',
          message: String(err?.message || err),
        })
      )
      .finally(() => {
        runningRef.current = false;
        runNext();
      });
  }, [patchTask]);

  // Ajoute une tâche à la file. `work(update)` est une fonction async qui reçoit
  // un callback `update({ progress, message })` pour reporter son avancement.
  const enqueue = useCallback(
    (label, work) => {
      const id = ++idRef.current;
      const task = { id, label, status: 'queued', progress: 0, message: '' };
      setTasks((prev) => [...prev, task]);
      queueRef.current.push({ id, work });
      runNext();
      return id;
    },
    [runNext]
  );

  // Retire une tâche de l'affichage. Si elle est encore en attente, elle est
  // aussi retirée de la file (annulation).
  const removeTask = useCallback((id) => {
    queueRef.current = queueRef.current.filter((d) => d.id !== id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Nettoie les tâches terminées (succès / erreur).
  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'queued' || t.status === 'running'));
  }, []);

  const value = { tasks, enqueue, removeTask, clearFinished };

  return (
    <BackgroundTasksContext.Provider value={value}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export function useBackgroundTasks() {
  const ctx = useContext(BackgroundTasksContext);
  if (!ctx) {
    throw new Error('useBackgroundTasks doit être utilisé dans <BackgroundTasksProvider>');
  }
  return ctx;
}
