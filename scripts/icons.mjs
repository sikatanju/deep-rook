// node scripts/icons.mjs: renders the app icons in public/ from the SVGs in
// scripts/icons. sharp comes in as Astro's optional dependency, so it is
// resolved through Astro rather than listed in package.json.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const fromAstro = createRequire(import.meta.resolve('astro/package.json'));
const sharp = fromAstro('sharp');

const src = (name) => fileURLToPath(new URL(`icons/${name}`, import.meta.url));
const out = (name) =>
  fileURLToPath(new URL(`../public/${name}`, import.meta.url));

// The maskable art is full bleed with the rook inside the 80% safe circle.
// iOS fills transparency with black, so the touch icon uses it too.
const targets = [
  ['icon.svg', 192, 'icons/icon-192.png'],
  ['icon.svg', 512, 'icons/icon-512.png'],
  ['maskable.svg', 512, 'icons/maskable-512.png'],
  ['maskable.svg', 180, 'apple-touch-icon.png'],
];

for (const [svg, size, png] of targets) {
  await sharp(src(svg), { density: (72 * size) / 512 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out(png));
  console.log(`${png} ${size}x${size}`);
}
