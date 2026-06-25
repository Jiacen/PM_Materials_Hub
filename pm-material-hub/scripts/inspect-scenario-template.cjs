const AdmZip = require('adm-zip');

const pptxPath = process.argv[2];
if (!pptxPath) {
  console.error('Usage: node scripts/inspect-scenario-template.cjs <pptx>');
  process.exit(1);
}

const zip = new AdmZip(pptxPath);
const presentationXml = zip.getEntry('ppt/presentation.xml')?.getData().toString('utf8') || '';
const sizeMatch = presentationXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
const slideWidth = sizeMatch ? Number(sizeMatch[1]) : 12192000;
const slideHeight = sizeMatch ? Number(sizeMatch[2]) : 6858000;

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textOf(xml) {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
    .map(match => decodeXml(match[1]))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function xfrmOf(xml) {
  const match = xml.match(/<a:xfrm[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  if (!match) return null;
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    cx: Number(match[3]),
    cy: Number(match[4]),
  };
}

const slideEntries = zip.getEntries()
  .map(entry => entry.entryName)
  .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));

const slides = slideEntries.map((entryName) => {
  const slideNumber = Number(entryName.match(/slide(\d+)/)[1]);
  const xml = zip.getEntry(entryName).getData().toString('utf8');
  const items = [];
  for (const tag of ['p:sp', 'p:pic', 'p:graphicFrame']) {
    const re = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'g');
    let match;
    while ((match = re.exec(xml))) {
      const raw = match[0];
      const xfrm = xfrmOf(raw);
      if (!xfrm) continue;
      const text = textOf(raw);
      items.push({
        tag,
        type: tag === 'p:pic' ? 'picture' : (text ? 'text' : 'shape'),
        text: text.slice(0, 180),
        x: Number((xfrm.x / slideWidth).toFixed(4)),
        y: Number((xfrm.y / slideHeight).toFixed(4)),
        width: Number((xfrm.cx / slideWidth).toFixed(4)),
        height: Number((xfrm.cy / slideHeight).toFixed(4)),
      });
    }
  }
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  return { slideNumber, items };
});

console.log(JSON.stringify({
  slideWidth,
  slideHeight,
  slideCount: slides.length,
  slides,
}, null, 2));
