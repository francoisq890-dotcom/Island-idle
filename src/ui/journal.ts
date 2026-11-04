/** Journal: achievements (permanent bonuses) and constellations (long-term goal). */
import { ACHIEVEMENTS } from '../config/achievements';
import { CONSTELLATIONS } from '../config/constellations';
import { formatNumber } from '../economy/format';
import type { GameState } from '../economy/state';
import { el } from './hud';
import { ICONS } from './icons';
import { framePanel } from './panels';
import { statText } from './runes';

export class Journal {
  readonly el: HTMLElement;
  private tab: 'ach' | 'const' = 'ach';
  private body: HTMLElement;
  private sig = '';

  constructor(
    private getState: () => GameState,
    private sound: (k: 'tab') => void,
  ) {
    this.el = framePanel('drawer', 'trophy', 'Journal', 'Succès et constellations');
    this.el.insertAdjacentHTML('beforeend', `<div class="tabs"><button class="tab on" data-tab="ach">Succès</button><button class="tab" data-tab="const">Constellations</button></div><div class="body"></div>`);
    this.body = this.el.querySelector('.body')!;
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as 'ach' | 'const';
        this.el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        this.sig = '';
        this.sound('tab');
        this.refresh();
      }),
    );
  }

  refresh(): void {
    const s = this.getState();
    const sig = this.tab + Object.keys(s.achievements).length + '|' + s.lifetimeSeeds + '|' + Math.floor(s.stats.allTimeShards / 1e3);
    if (sig === this.sig) return;
    this.sig = sig;
    this.body.innerHTML = '';
    if (this.tab === 'ach') {
      const got = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
      this.body.appendChild(el('p', 'note', `${got} / ${ACHIEVEMENTS.length} succès. Chaque succès donne un bonus <b>permanent</b>, conservé quand l’île descend.`));
      const sorted = [...ACHIEVEMENTS].sort((a, b) => Number(!!s.achievements[b.id]) - Number(!!s.achievements[a.id]));
      sorted.forEach((a, i) => {
        const done = !!s.achievements[a.id];
        const hidden = a.secret && !done;
        const [c, g] = a.progress(s);
        const pct = Math.min(100, (c / g) * 100);
        const row = el(
          'div',
          `row ${done ? '' : 'locked-soft'}`,
          `<div class="medal ${done ? 'gold' : ''}">${done ? ICONS.trophy : ICONS.lock}</div>
           <div class="row-main"><div class="row-title"><span class="nm">${hidden ? 'Succès secret' : a.name}</span></div>
           <div class="meta">${hidden ? '???' : a.desc}${!done && !hidden && g > 1 ? ` · <b>${formatNumber(Math.min(c, g))} / ${formatNumber(g)}</b>` : ''}</div>
           ${!done && !hidden ? `<div class="msbar"><i style="width:${pct}%"></i></div>` : ''}</div>
           <div class="reward ${done ? 'on' : ''}">${statText(a.stat, a.value)}</div>`,
        );
        row.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
        this.body.appendChild(row);
      });
    } else {
      const ls = s.lifetimeSeeds;
      this.body.appendChild(el('p', 'note', `Graines d’étoile gagnées au total : <b>${formatNumber(ls)}</b>. Chaque constellation allumée rend <b>toutes les îles suivantes</b> plus fortes. C’est l’objectif de long terme après le premier prestige.`));
      const sky = el('div', 'const-sky');
      CONSTELLATIONS.forEach((c, i) => {
        const on = ls >= c.seeds;
        sky.insertAdjacentHTML('beforeend', `<span class="cstar ${on ? 'on' : ''}" style="left:${8 + i * 14}%;top:${30 + Math.sin(i * 1.7) * 22}%">${ICONS.seed}</span>`);
      });
      this.body.appendChild(sky);
      CONSTELLATIONS.forEach((c, i) => {
        const on = ls >= c.seeds;
        const row = el(
          'div',
          `row ${on ? '' : 'locked-soft'}`,
          `<div class="medal ${on ? 'violet' : ''}">${ICONS.seed}</div>
           <div class="row-main"><div class="row-title"><span class="nm">${c.name}</span><span class="own">${formatNumber(c.seeds)} graines</span></div>
           <div class="meta">${c.desc}</div>${on ? '' : `<div class="msbar"><i style="width:${Math.min(100, (ls / c.seeds) * 100)}%;background:var(--violet)"></i></div>`}</div>
           <div class="reward ${on ? 'on violet' : ''}">${on ? 'Allumée' : 'Éteinte'}</div>`,
        );
        row.style.animationDelay = `${i * 40}ms`;
        this.body.appendChild(row);
      });
    }
  }
}
