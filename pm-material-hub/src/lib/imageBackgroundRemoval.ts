import sharp from 'sharp';

export async function removeLightBackground(input: sharp.Sharp) {
  const resized = input.resize({ width: 1800, withoutEnlargement: true }).ensureAlpha();
  const metadata = await resized.metadata();
  const width = metadata.width || 1;
  const height = metadata.height || 1;
  const raw = await resized.raw().toBuffer();
  const output = Buffer.from(raw);

  for (let i = 0; i < output.length; i += 4) {
    const r = output[i];
    const g = output[i + 1];
    const b = output[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const isLightBackground = max >= 235 && saturation <= 28;
    const isNearLightGray = max >= 220 && min >= 205 && saturation <= 20;

    if (isLightBackground || isNearLightGray) {
      output[i + 3] = 0;
    } else if (max >= 225 && saturation <= 34) {
      output[i + 3] = Math.min(output[i + 3], 90);
    }
  }

  return sharp(output, {
    raw: {
      width,
      height,
      channels: 4,
    },
  }).png().toBuffer();
}
