import { expect } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

export async function capture(page, directory, name) {
  await mkdir(directory, { recursive: true });
  const screenshot = await page.screenshot({ fullPage: true });
  let png;
  for (const quality of [100, 95, 90, 80, 70]) {
    png = await sharp(screenshot).png({ palette: true, quality, dither: 0, effort: 10, compressionLevel: 9 }).toBuffer();
    if (png.length < 250000) break;
  }
  expect(png.length).toBeLessThan(250000);
  await writeFile(`${directory}/${name}.png`, png);
  await rm(`${directory}/${name}.jpg`, { force: true });
}
