export const config = { runtime: 'edge' };

// Google Places (New API) — matches Decagon implementation exactly
// Uses places.googleapis.com/v1/places:searchText with X-Goog-FieldMask header
// Set GOOGLE_PLACES_API_KEY in Vercel environment variables

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors() } });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } }); }

  const { location, check_in, check_out } = body;
  if (!location) return new Response(JSON.stringify({ error: 'Missing location' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) {
    return new Response(JSON.stringify(mockHotels(location)), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': placesKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.priceLevel,places.id',
    },
    body: JSON.stringify({
      textQuery: `hotels in ${location}`,
    }),
  });

  if (!placesRes.ok) {
    console.error('Places API error:', placesRes.status);
    return new Response(JSON.stringify(mockHotels(location)), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const placesData = await placesRes.json();
  const hotels = (placesData.places || []).slice(0, 5).map(place => ({
    id: place.id,
    name: place.displayName?.text || 'Unknown',
    address: place.formattedAddress,
    rating: place.rating,
    reviews: place.userRatingCount,
    price_level: place.priceLevel,
    // Photo ref for client to fetch if needed:
    // GET https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=400&key=KEY
    photo_name: place.photos?.[0]?.name || null,
    maps_url: place.id ? `https://www.google.com/maps/place/?q=place_id:${place.id}` : null,
  }));

  return new Response(JSON.stringify({ hotels, location, check_in, check_out }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function mockHotels(location) {
  return {
    hotels: [
      { id: 'mock-h1', name: `The ${location} Grand`, address: `Central ${location}`, rating: 4.5, reviews: 1240, price_level: 3, photo_name: null, maps_url: '#' },
      { id: 'mock-h2', name: `${location} Boutique Stay`, address: `Old Town, ${location}`, rating: 4.3, reviews: 680, price_level: 2, photo_name: null, maps_url: '#' },
      { id: 'mock-h3', name: `Budget Inn ${location}`, address: `Near Station, ${location}`, rating: 3.9, reviews: 420, price_level: 1, photo_name: null, maps_url: '#' },
    ],
    location,
    _mock: true,
  };
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
