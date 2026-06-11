export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const { query, trips } = body;
  if (!query || !trips) {
    return new Response(JSON.stringify({ error: 'Missing query or trips' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // ── FALLBACK: keyword matching if no API key configured ──
  if (!apiKey) {
    const result = keywordSearch(query, trips);
    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  // ── LIVE: Claude semantic search ──
  const system = `You are a Contiki travel expert helping 18-35 year olds find group trips.
Given a free-text query, rank the best matching trips (up to 6) and explain briefly why each fits.
Respond ONLY with valid JSON, no markdown, no preamble:
{"summary":"1-2 sentence friendly summary of what you understood","matches":[{"id":"trip-id","reason":"one specific sentence why this trip fits","score":0.0}]}`;

  const tripList = trips.map(t =>
    `ID:${t.id} | ${t.title} | ${t.region} | ${t.days} days | $${t.price} | ${t.route} | Vibe: ${t.vibe}`
  ).join('\n');

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: `Query: "${query}"\n\nTrips:\n${tripList}` }],
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({}));
    // If API call fails, fall back to keyword search rather than erroring
    const result = keywordSearch(query, trips);
    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const data = await anthropicRes.json();
  const raw = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const clean = raw.replace(/```json|```/g, '').trim();

  return new Response(clean, {
    status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

// ── KEYWORD FALLBACK ──────────────────────────────────────────────────────────
function keywordSearch(query, trips) {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 2);

  const scored = trips.map(trip => {
    const corpus = [trip.title, trip.region, trip.route, trip.vibe, trip.tags.join(' ')]
      .join(' ').toLowerCase();
    let score = 0;
    for (const word of words) {
      if (corpus.includes(word)) score += 1;
    }
    if (corpus.includes(q)) score += 3;
    return { ...trip, score: score / Math.max(words.length, 1) };
  })
  .filter(t => t.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 6);

  const reasons = {
    'eu-highlights': 'Covers Europe\'s most iconic cities across 7 countries in one trip.',
    'greek-islands': 'Island-hopping between Athens, Mykonos and Santorini — sun, sea and culture.',
    'south-america': 'Adventure-packed route through Machu Picchu, the Andes and Uyuni salt flats.',
    'southeast-asia': 'Immerses you in temples, street food and beaches across 4 Asian countries.',
    'safari': 'Face-to-face with the Big Five across Kenya and Tanzania\'s greatest parks.',
    'japan': 'Balances ancient temples and neon cities across Tokyo, Kyoto and Osaka.',
    'budget-europe': 'Four iconic European cities in one week at an unbeatable price.',
    'costa-rica': 'Pure adventure through rainforests, volcanoes and Pacific coastline.',
    'morocco': 'Ancient medinas, Saharan desert camps and vibrant souks across 9 days.',
    'scandinavia': 'Fjords, Viking history and Nordic cities across three Scandinavian countries.',
    'aus-nz': 'The ultimate antipodean bucket list — bungee jumping, reef snorkelling and more.',
    'usa-parks': 'America\'s most jaw-dropping canyon landscapes on an epic road trip.',
  };

  const matches = scored.map(t => ({
    id: t.id,
    reason: reasons[t.id] || 'A strong match for your travel style.',
    score: Math.min(t.score, 1),
  }));

  return {
    summary: `Here are the best trips matching "${query}" — results are based on keyword matching. Connect an API key for full AI-powered search.`,
    matches,
  };
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
