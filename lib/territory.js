const { pool } = require('../db');

// FIPS state code <-> USPS abbreviation (states RepRoute supports today).
const FIPS_TO_ST = { '01':'AL','28':'MS','13':'GA','47':'TN','12':'FL','45':'SC','37':'NC','21':'KY','22':'LA' };
const ST_TO_FIPS = {}; Object.keys(FIPS_TO_ST).forEach(f => { ST_TO_FIPS[FIPS_TO_ST[f]] = f; });

function normCounty(n) {
  return String(n || '').toLowerCase().replace(/\s+county$/, '').replace(/[^a-z]/g, '');
}

// Load a rep's territory. Returns null when the rep has set NO territory — meaning
// "no restriction" (nothing gets filtered until they draw one).
async function getRepTerritory(repId) {
  const rows = (await pool.query(
    'SELECT county_fips, county_name, state_fips FROM rep_territories WHERE user_id=$1',
    [repId]
  )).rows;
  if (!rows.length) return null;
  const counties = new Set();  // "stateFips|normalizedCountyName"
  const states = new Set();    // covered state FIPS
  rows.forEach(r => {
    if (r.state_fips) states.add(r.state_fips);
    if (r.state_fips && r.county_name) counties.add(r.state_fips + '|' + normCounty(r.county_name));
  });
  return { counties, states, size: rows.length };
}

// Is a location inside the territory?
//   loc: { state: 'AL' or fips, county: 'Jefferson' }
// Graceful: unknown state → allow (don't block on missing data). State not covered
// at all → block. State covered but county unknown → allow (coarse). County known →
// exact county membership.
function inTerritory(territory, loc) {
  if (!territory) return true;                    // no territory set = no restriction
  if (!loc) return true;
  let stFips = loc.stateFips || null;
  if (!stFips && loc.state) stFips = /^\d{2}$/.test(String(loc.state)) ? String(loc.state) : ST_TO_FIPS[String(loc.state).toUpperCase()];
  if (!stFips) return true;                       // unknown state → don't block
  if (!territory.states.has(stFips)) return false; // state entirely outside territory
  if (!loc.county) return true;                   // in-state, no county detail → allow
  return territory.counties.has(stFips + '|' + normCounty(loc.county));
}

module.exports = { getRepTerritory, inTerritory, normCounty, FIPS_TO_ST, ST_TO_FIPS };
