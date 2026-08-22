import { BOSS_CHOICES, YOKAI } from '../../shared/data';
import { $ } from './util';

const TITLE_BG_CANDIDATES = ['/assets/ui/title-bg.webp', '/assets/ui/title-bg.png'];
const TITLE_LOGO_CANDIDATES = ['/assets/ui/title-logo.webp', '/assets/ui/title-logo.png'];
const TITLE_MOON_CANDIDATES = ['/assets/ui/title-moon.webp', '/assets/ui/title-moon.png'];
const TITLE_PORTRAITS: Record<string, string[]> = {
  kyubi: ['/assets/ui/title-kyubi.png', '/assets/ui/title-kyubi.webp'],
  shuten: ['/assets/ui/title-shuten.png', '/assets/ui/title-shuten.webp'],
  nurarihyon: ['/assets/ui/title-nurarihyon.png', '/assets/ui/title-nurarihyon.webp'],
};

const portraitUrl: Record<string, string> = {};
let artProbed = false;
let artReady: Promise<void> | null = null;

function probeImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function firstExisting(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    if (await probeImage(url)) return url;
  }
  return null;
}

/** 用意されたキーアートがあればタイトルに載せる。無い場合はCSSの月と大将絵で成立させる */
export function applyOptionalTitleArt(): Promise<void> {
  if (!artReady) artReady = loadOptionalTitleArt();
  return artReady;
}

async function loadOptionalTitleArt(): Promise<void> {
  if (artProbed) return;
  artProbed = true;
  const screen = $('screen-title');
  const [bg, logo, moon, kyubi, shuten, nurarihyon] = await Promise.all([
    firstExisting(TITLE_BG_CANDIDATES),
    firstExisting(TITLE_LOGO_CANDIDATES),
    firstExisting(TITLE_MOON_CANDIDATES),
    firstExisting(TITLE_PORTRAITS.kyubi),
    firstExisting(TITLE_PORTRAITS.shuten),
    firstExisting(TITLE_PORTRAITS.nurarihyon),
  ]);
  if (bg) {
    const sky = screen.querySelector<HTMLElement>('.title-sky');
    if (sky) sky.style.backgroundImage = `url("${bg}")`;
    screen.classList.add('has-title-bg');
  }
  if (logo) {
    const logoEl = $<HTMLImageElement>('title-logo-art');
    logoEl.src = logo;
    logoEl.classList.remove('hidden');
    screen.classList.add('has-title-logo');
  }
  if (moon) {
    const moonEl = screen.querySelector<HTMLElement>('.title-moon');
    if (moonEl) {
      moonEl.style.backgroundImage = `url("${moon}")`;
      moonEl.style.backgroundSize = 'contain';
      moonEl.style.backgroundRepeat = 'no-repeat';
      moonEl.style.backgroundPosition = 'center';
      moonEl.classList.add('has-moon-art');
    }
  }
  if (kyubi) portraitUrl.kyubi = kyubi;
  if (shuten) portraitUrl.shuten = shuten;
  if (nurarihyon) portraitUrl.nurarihyon = nurarihyon;
  if (kyubi || shuten || nurarihyon) screen.classList.add('has-title-portraits');
}

function portraitSrc(bossId: string): string {
  return portraitUrl[bossId] || YOKAI[bossId].img;
}

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
    image.src = portraitSrc(bossId);
    image.alt = boss.name;
  }
}
