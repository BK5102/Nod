// The demo seed (docs/PLAN.md section 12). The flight is real: Delta DL 363, SFO 4:15 PM to JFK, $382 in
// economy on Google Flights for Oct 25, 2026 (the same recorded search as data/fixtures/demo.json). Its
// cancellation is simulated, and the traveler, card and booking are fictional. The traveler's personal
// data only ever goes into private tables; the public trip row carries none of it.

export const DEMO_TRIP_ID = "trip_demo";

export const DEMO_TRIP = {
  tripId: DEMO_TRIP_ID,
  route: "SFO to JFK",
  flight: "Delta DL 363",
  departs: "4:15 PM",
  deadlineText: "Arrive JFK by 9:00 AM",
  fareCents: 38_200,
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
  loyaltyNumber: "LY-55120938",
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

/** The cancellation is simulated; the step says so rather than inventing an airline reason. */
export const CANCEL_REASON = "simulated cancellation, for this demo";

/** How long a quote stays valid after the agent submits it. */
export const QUOTE_MINUTES = 15;
