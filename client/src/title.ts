import { YOKAI } from '../../shared/data';
import { applyKnockout, opaqueBounds } from './knockout-black';
import { $ } from './util';
import { pickTitleLayout, TITLE_HEROES, type TitleHeroId } from './title-heroes';

export { TITLE_HEROES } from './title-heroes';

const TITLE_BG_CANDIDATES = [
  '/assets/ui/title-bg.webp',
  '/assets/ui/title-bg.png',
  '/assets/ui/title-bg.jpg',
  '/assets/ui/title-bg.jpeg',
];
const TITLE_LOGO_CANDIDATES = [
  '/assets/ui/title-logo.webp',
  '/assets/ui/title-logo.png',
  '/assets/ui/title-logo.jpg',
  '/assets/ui/title-logo.jpeg',
];
const TITLE_MOON_CANDIDATES = ['/assets/ui/title-moon.webp', '/assets/ui/title-moon.png'];
const TITLE_PORTRAITS: Record<TitleHeroId, string[]> = {
  kyubi: ['/assets/ui/title-kyubi.png', '/assets/ui/title-kyubi.webp'],
  ibaraki: ['/assets/ui/title-ibaraki.png', '/assets/ui/title-ibaraki.webp'],
  tamamo: ['/assets/ui/title-tamamo.png', '/assets/ui/title-tamamo.webp'],
};

const portraitUrl: Partial<Record<TitleHeroId, string>> = {};
let layout = pickTitleLayout();
let artProbed = false;
let artReady: Promise<void> | null = null;
let logoObjectUrl: string | null = null;

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

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

/** 黒背景のロゴを透過にして、余白を切り落とす */
async function prepareLogoSrc(url: string): Promise<string> {
  const img = await loadImage(url);
  const maxEdge = 2048;
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return url;
  ctx.drawImage(img, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  applyKnockout(image.data);
  const box = opaqueBounds(image.data, width, height);
  if (!box) return url;
  ctx.putImageData(image, 0, 0);
  const pad = Math.round(Math.max(width, height) * 0.02);
  const sx = Math.max(0, box.x - pad);
  const sy = Math.max(0, box.y - pad);
  const sw = Math.min(width - sx, box.w + pad * 2);
  const sh = Math.min(height - sy, box.h + pad * 2);
  const cropped = document.createElement('canvas');
  cropped.width = sw;
  cropped.height = sh;
  const cut = cropped.getContext('2d');
  if (!cut) return url;
  cut.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return await new Promise(resolve => {
    cropped.toBlob(blob => {
      if (!blob) {
        resolve(url);
        return;
      }
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
      logoObjectUrl = URL.createObjectURL(blob);
      resolve(logoObjectUrl);
    }, 'image/png');
  });
}

/** 用意されたキーアートがあればタイトルに載せる。無い場合は既存の駒絵で成立させる */
export function applyOptionalTitleArt(): Promise<void> {
  if (!artReady) artReady = loadOptionalTitleArt();
  return artReady;
}

async function loadOptionalTitleArt(): Promise<void> {
  if (artProbed) return;
  artProbed = true;
  const screen = $('screen-title');
  const [bg, logo, moon, kyubi, ibaraki, tamamo] = await Promise.all([
    firstExisting(TITLE_BG_CANDIDATES),
    firstExisting(TITLE_LOGO_CANDIDATES),
    firstExisting(TITLE_MOON_CANDIDATES),
    firstExisting(TITLE_PORTRAITS.kyubi),
    firstExisting(TITLE_PORTRAITS.ibaraki),
    firstExisting(TITLE_PORTRAITS.tamamo),
  ]);
  if (bg) {
    const sky = screen.querySelector<HTMLElement>('.title-sky');
    if (sky) sky.style.backgroundImage = `url("${bg}")`;
    screen.classList.add('has-title-bg');
  }
  if (logo) {
    const logoEl = $<HTMLImageElement>('title-logo-art');
    try {
      logoEl.src = await prepareLogoSrc(logo);
    } catch {
      logoEl.src = logo;
      logoEl.classList.add('title-logo-art-blend');
    }
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
  if (ibaraki) portraitUrl.ibaraki = ibaraki;
  if (tamamo) portraitUrl.tamamo = tamamo;
  if (kyubi || ibaraki || tamamo) screen.classList.add('has-title-portraits');
}

function portraitSrc(id: TitleHeroId): string {
  return portraitUrl[id] || YOKAI[id].img;
}

function placeHero(elementId: string, heroId: TitleHeroId): void {
  const image = $<HTMLImageElement>(elementId);
  image.src = portraitSrc(heroId);
  image.alt = YOKAI[heroId].name;
}

/** タイトルの顔。選んだ大将ではなく、九尾 / 茨木 / 玉藻をセッション中は固定で出す */
export function renderTitleHeroes(): void {
  placeHero('title-boss-c', layout.center);
  placeHero('title-boss-l', layout.left);
  placeHero('title-boss-r', layout.right);
}
