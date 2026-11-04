import './ui/style.css';
import { Game } from './game';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const title = document.getElementById('title')!;
  const loading = document.getElementById('loading')!;

  let game: Game;
  try {
    game = new Game(canvas, ui);
  } catch (e) {
    console.error(e);
    loading.textContent = 'Impossible de démarrer WebGL sur cet appareil. Essaie un navigateur récent (Chrome, Firefox, Edge, Safari).';
    return;
  }
  game.run();
  if (game.state.stats.playSeconds > 5) {
    title.querySelector('.start')!.textContent = 'Continuer';
  }
  // Expose for debugging / automated screenshots.
  (window as unknown as { game: Game }).game = game;
  requestAnimationFrame(() => loading.classList.add('out'));

  const start = () => {
    title.classList.add('out');
    game.start();
    canvas.focus();
  };
  title.addEventListener('click', start, { once: true });
  window.addEventListener(
    'keydown',
    (e) => {
      if (!title.classList.contains('out') && (e.code === 'Enter' || e.code === 'Space')) start();
    },
  );
}

boot();
