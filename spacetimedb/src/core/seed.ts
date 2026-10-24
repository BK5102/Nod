// The demo seed (docs/PLAN.md section 12). Everything here is fictional. The traveler's personal data
// only ever goes into private tables; the public trip row carries none of it.

export const DEMO_TRIP_ID = "trip_demo";

export const DEMO_TRIP = {
  tripId: DEMO_TRIP_ID,
  route: "SFO to JFK",
  flight: "Bayline Air 412",
  departs: "6:40 PM",
  deadlineText: "Arrive JFK by 9:00 AM",
  fareCents: 31_800,
};

export const DEMO_MANDATE = {
  tripId: DEMO_TRIP_ID,
  tripCapCents: 60_000,
  askAboveCents: 25_000,
  autoCeilingCents: 0,
  categories: "airline,lodging",
  summary: "Up to $600 on this trip. Ask me above $250. Airlines and hotels only.",
};

/** Private. Used by demo-check to prove none of it reaches a public row. */
export const DEMO_PROFILE = {
  tripId: DEMO_TRIP_ID,
  name: "Sam Rivera",
  email: "sam.rivera@example.com",
  bookingRef: "BX7Q2K",
  loyaltyNumber: "BL-55120938",
};

/** Private mock token. Allows merchant category codes 4511 (airlines) and 7011 (lodging). */
export const DEMO_TOKEN = {
  tripId: DEMO_TRIP_ID,
  tokenRef: "tok_mock_demo",
  last4: "4242",
  capCents: 60_000,
  allowedMccs: "4511,7011",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

export const CANCEL_REASON = "crew availability";

/** How long a quote stays valid after the agent submits it. */
export const QUOTE_MINUTES = 15;
