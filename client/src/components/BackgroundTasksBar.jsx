import { motion, AnimatePresence } from 'framer-motion';
import { useBackgroundTasks } from '../contexts/BackgroundTasksContext';
import { CircleCheck, CircleX, Clock, Loader } from './icons';

const STATUS_LABELS = {
  queued: 'En attente',
  running: 'En cours',
  done: 'Terminé',
  error: 'Erreur',
};

function TaskRow({ task, onRemove }) {
  const isRunning = task.status === 'running';
  const isQueued = task.status === 'queued';
  const isDone = task.status === 'done';
  const isError = task.status === 'error';

  return (
    <motion.div
      className={`bg-task ${isError ? 'bg-task-error' : ''} ${isDone ? 'bg-task-done' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.2 }}
    >
      <div className="bg-task-head">
        <span className="bg-task-status" title={STATUS_LABELS[task.status]}>
          {isQueued && <span className="bg-task-ico"><Clock size={12} /></span>}
          {isRunning && <span className="bg-task-ico bg-task-spin"><Loader size={12} /></span>}
          {isDone && <span className="bg-task-ico"><CircleCheck size={12} /></span>}
          {isError && <span className="bg-task-ico"><CircleX size={12} /></span>}
        </span>
        <span className="bg-task-label" title={task.label}>{task.label}</span>
        {!isRunning && (
          <button
            className="bg-task-close"
            onClick={() => onRemove(task.id)}
            title={isQueued ? 'Annuler' : 'Fermer'}
          >
            ×
          </button>
        )}
      </div>

      {task.message && <div className="bg-task-message">{task.message}</div>}

      {(isRunning || isQueued) && (
        <div className="bg-task-progress">
          <motion.div
            className="bg-task-progress-bar"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </motion.div>
  );
}

export default function BackgroundTasksBar() {
  const { tasks, removeTask, clearFinished } = useBackgroundTasks();

  if (tasks.length === 0) return null;

  const hasFinished = tasks.some((t) => t.status === 'done' || t.status === 'error');

  return (
    <div className="bg-tasks-bar">
      <div className="bg-tasks-bar-head">
        <span className="bg-tasks-bar-title">
          Téléchargements <span className="bg-tasks-count">{tasks.length}</span>
        </span>
        {hasFinished && (
          <button className="bg-tasks-clear" onClick={clearFinished}>
            Tout effacer
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} onRemove={removeTask} />
        ))}
      </AnimatePresence>
    </div>
  );
}
