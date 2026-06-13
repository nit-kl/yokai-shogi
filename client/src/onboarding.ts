/* ============================================================
   初回オンボーディング: 大将選択 → 10連ガチャ → 編成 → タイトル
   ============================================================ */

import { BOSS_CHOICES, RARITY_INFO, YOKAI } from '../../shared/data';
import { $, showScreen } from './util';
import { AudioSys } from './audio';
import { Meta } from './meta';
import { MenuUI } from './menu';

type Step = 'boss' | 'gacha' | 'formation';

let step: Step | null = null;
let enterTitle = () => {};

export const Onboarding = {
  get active() { return step !== null; },

  init(opts: { enterTitle: () => void }) {
    enterTitle = opts.enterTitle;
  },

  async start() {
    step = 'boss';
    showScreen('screen-title');
    this.showBossPick();
  },

  showBossPick() {
    const grid = $('boss-pick-grid');
    grid.innerHTML = '';
    for (const id of BOSS_CHOICES) {
      const def = YOKAI[id];
      const ri = RARITY_INFO[def.rarity];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `boss-pick-card ${ri.cls}`;
      card.innerHTML =
        `<div class="bp-rarity">${ri.label}</div>` +
        `<img src="${def.img}" alt="${def.name}" draggable="false">` +
        `<div class="bp-name">${def.name}</div>`;
      card.onclick = () => { void this.selectBoss(id); };
      grid.appendChild(card);
    }
    $('modal-onboarding-boss').classList.remove('hidden');
  },

  async selectBoss(bossId: string) {
    AudioSys.play('select');
    const err = await Meta.pickBoss(bossId);
    if (err) {
      $('onboarding-boss-error').textContent = err;
      return;
    }
    $('onboarding-boss-error').textContent = '';
    $('modal-onboarding-boss').classList.add('hidden');
    const boss = YOKAI[bossId];
    $<HTMLImageElement>('title-boss-l').src = boss.img;
    step = 'gacha';
    MenuUI.setOnboardingMode('gacha');
    AudioSys.init();
    AudioSys.startTitleBgm();
    MenuUI.openGacha();
  },

  onGachaDone() {
    if (step !== 'gacha') return;
    step = 'formation';
    MenuUI.setOnboardingMode('formation');
    MenuUI.openFormation();
  },

  async onFormationSaved() {
    if (step !== 'formation') return;
    const bonus = await Meta.completeOnboarding();
    if (bonus) Meta.pendingLoginBonus = bonus;
    step = null;
    MenuUI.setOnboardingMode(null);
    enterTitle();
  },
};
