export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors() } });

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } }); }

  const {
    origin,             // IATA code e.g. "LHR"
    destination,        // IATA code e.g. "ATH"
    departure_date,     // ISO date string e.g. "2026-07-01"
    trip_b_start_iso,   // ISO datetime of next trip start, for feasibility check
    min_buffer_hours = 4,
    city_transfer_minutes = 120,
  } = body;

  if (!origin || !destination || !departure_date) {
    return new Response(JSON.stringify({ error: 'Missing origin, destination or departure_date' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });
  }

  const duffelKey = process.env.DUFFEL_API_KEY;
  if (!duffelKey) {
    return new Response(JSON.stringify(mockFlights(origin, destination, departure_date)), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const payload = {
    data: {
      slices: [{
        origin,
        destination,
        origin_type: 'airport',
        destination_type: 'airport',
        departure_date,
      }],
      passengers: [{ type: 'adult' }],
      cabin_class: 'economy',
    },
  };

  const duffelRes = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${duffelKey}`,
      'Duffel-Version': 'v2',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!duffelRes.ok) {
    const err = await duffelRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err?.errors?.[0]?.message || `Duffel error ${duffelRes.status}` }), {
      status: duffelRes.status, headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }

  const duffelData = await duffelRes.json();
  const offers = duffelData?.data?.offers || [];

  // Time-aware feasibility filtering (mirrors Decagon tool logic)
  let feasibleOffers = offers;
  if (trip_b_start_iso) {
    const tripBStart = new Date(trip_b_start_iso);
    const latestAirportArrival = new Date(tripBStart.getTime()
      - (min_buffer_hours * 60 * 60 * 1000)
      - (city_transfer_minutes * 60 * 1000));

    feasibleOffers = offers.filter(offer => {
      const segments = offer.slices?.[0]?.segments || [];
      if (segments.length !== 1) return false; // direct flights only
      const arriving = new Date(segments[0].arriving_at);
      return arriving <= latestAirportArrival;
    });
  }

  const result = feasibleOffers.slice(0, 5).map(offer => {
    const seg = offer.slices?.[0]?.segments?.[0];
    return {
      offer_id: offer.id,
      flight: `${seg?.marketing_carrier?.iata_code}${seg?.marketing_carrier_flight_number}`,
      airline: seg?.marketing_carrier?.name,
      airline_logo: seg?.marketing_carrier?.logo_symbol_url || null,
      departing_at: seg?.departing_at,
      arriving_at: seg?.arriving_at,
      duration: offer.slices?.[0]?.duration,
      stops: 0, // direct only
      price: parseFloat(offer.total_amount),
      currency: offer.total_currency,
      booking_url: `https://book.duffel.com/offers/${offer.id}`,
    };
  });

  return new Response(JSON.stringify({
    offers: result,
    direct_possible: result.length > 0,
    total_found: feasibleOffers.length,
  }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function mockFlights(origin, destination, date) {
  return {
    offers: [
      { offer_id: 'mock-1', flight: 'BA401', airline: 'British Airways', departing_at: `${date}T08:00:00Z`, arriving_at: `${date}T10:30:00Z`, stops: 0, price: 189, currency: 'USD', booking_url: '#' },
      { offer_id: 'mock-2', flight: 'U24408', airline: 'easyJet', departing_at: `${date}T14:00:00Z`, arriving_at: `${date}T16:45:00Z`, stops: 0, price: 124, currency: 'USD', booking_url: '#' },
      { offer_id: 'mock-3', flight: 'FR1234', airline: 'Ryanair', departing_at: `${date}T06:30:00Z`, arriving_at: `${date}T09:40:00Z`, stops: 0, price: 98, currency: 'USD', booking_url: '#' },
    ],
    direct_possible: true,
    _mock: true,
  };
}

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
