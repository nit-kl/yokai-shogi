import { BOSS_CHOICES, YOKAI } from '../../shared/data';
import { $ } from './util';

export function renderTitleBosses(selectedId: string): void {
  const centerId = BOSS_CHOICES.find(id => id === selectedId) ?? BOSS_CHOICES[0];
  const sideIds = BOSS_CHOICES.filter(id => id !== centerId);
  const placements = [
    ['title-boss-l', sideIds[0]],
    ['title-boss-c', centerId],
    ['title-boss-r', sideIds[1]],
  ] as const;

  for (const [elementId, bossId] of placements) {
    const boss = YOKAI[bossId];
    const image = $<HTMLImageElement>(elementId);
    image.src = boss.img;
    image.alt = boss.name;
  }
}
