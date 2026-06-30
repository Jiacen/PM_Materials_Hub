import sharp from 'sharp';

export async function removeLightBackground(input: sharp.Sharp) {
  const resized = input.resize({ width: 1800, withoutEnlargement: true }).ensureAlpha();
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  const width = info.width || 1;
  const height = info.height || 1;
  const channels = info.channels || 4;
  const output = Buffer.from(data);

  for (let i = 0; i < output.length; i += channels) {
    const r = output[i];
    const g = output[i + 1];
    const b = output[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const isLightBackground = max >= 235 && saturation <= 28;
    const isNearLightGray = max >= 220 && min >= 205 && saturation <= 20;

    if (isLightBackground || isNearLightGray) {
      output[i + channels - 1] = 0;
    } else if (max >= 225 && saturation <= 34) {
      output[i + channels - 1] = Math.min(output[i + channels - 1], 90);
    }
  }

  return sharp(output, {
    raw: {
      width,
      height,
      channels,
    },
  }).png().toBuffer();
}
