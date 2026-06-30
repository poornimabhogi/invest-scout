const TRANSCRIPT_CACHE = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_TRANSCRIPTS_PER_POLL = 4;

let transcriptsFetchedThisPoll = 0;

export function resetTranscriptPollBudget() {
  transcriptsFetchedThisPoll = 0;
}

export function extractYouTubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const embed = u.pathname.match(/\/embed\/([^/?]+)/);
      if (embed) return embed[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isYouTubeUrl(url) {
  return Boolean(extractYouTubeVideoId(url));
}

function decodeCaptionXml(xml) {
  const parts = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim();
    if (text) parts.push(text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchYouTubeTranscript(videoId) {
  const cached = TRANSCRIPT_CACHE.get(videoId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text;

  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!pageRes.ok) return null;

  const html = await pageRes.text();
  const marker = '"captionTracks":';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;

  const slice = html.slice(idx, idx + 8000);
  const tracksMatch = slice.match(/"captionTracks":(\[[\s\S]*?\])/);
  if (!tracksMatch) return null;

  let tracks;
  try {
    tracks = JSON.parse(tracksMatch[1]);
  } catch {
    return null;
  }

  const enTrack =
    tracks.find((t) => t.languageCode === 'en' || t.vssId?.startsWith('.en')) ?? tracks[0];
  if (!enTrack?.baseUrl) return null;

  const capRes = await fetch(enTrack.baseUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestScout/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!capRes.ok) return null;

  const text = decodeCaptionXml(await capRes.text()).slice(0, 4000);
  if (text) TRANSCRIPT_CACHE.set(videoId, { text, at: Date.now() });
  return text || null;
}

export async function enrichItemWithTranscript(item) {
  const videoId = extractYouTubeVideoId(item.url);
  const isVideo =
    Boolean(videoId) ||
    /youtube\.com|youtu\.be/i.test(item.url ?? '') ||
    item.contentType === 'video';

  if (!isVideo) {
    return { ...item, contentType: item.contentType ?? 'article' };
  }

  const base = { ...item, contentType: 'video' };

  if (!videoId || transcriptsFetchedThisPoll >= MAX_TRANSCRIPTS_PER_POLL) {
    return { ...base, hasTranscript: false };
  }

  try {
    transcriptsFetchedThisPoll += 1;
    const transcript = await fetchYouTubeTranscript(videoId);
    if (!transcript) return { ...base, hasTranscript: false };

    return {
      ...base,
      hasTranscript: true,
      transcriptPreview: transcript.slice(0, 280),
      excerpt: `${item.excerpt ?? item.headline} ${transcript}`.replace(/\s+/g, ' ').slice(0, 2000),
    };
  } catch {
    return { ...base, hasTranscript: false };
  }
}
