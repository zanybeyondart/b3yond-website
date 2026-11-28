export const BOOTHS = [
  { id: 'mirror', name: 'Mirror Booth', description: 'A full-length interactive mirror for portraits and group photos.' },
  { id: 'classic', name: 'Display Stand', description: 'A freestanding photo booth with a 24, 27 or 32-inch screen.' },
];

const retiredKiosk = { id: 'grand', name: 'Touchscreen Kiosk', description: 'A large-format touchscreen for a more prominent event setup.' };
export const SCREEN_SIZES = [24, 27, 32];

export function getBooth(type) {
  return type === retiredKiosk.id ? retiredKiosk : BOOTHS.find(booth => booth.id === type);
}

export const EXPERIENCES = [
  { id: 'frame', name: 'Branded frame', description: 'A custom event frame around each guest photo.' },
  { id: 'aiPhoto', name: 'AI photo', description: 'A guest portrait transformed with an event-specific AI style.' },
  { id: 'aiVideo', name: 'AI video', description: 'A short AI-generated video featuring each guest.' },
];

export const ADDONS = [
  { id: 'queue', name: 'Collection screen & queue management', description: 'Guests can find their session on a second screen while the main booth serves the next group.' },
  { id: 'stanchions', name: 'Queue barriers', description: 'Stanchion posts and belts to guide the guest line.' },
];

export const DELIVERY_OPTIONS = [
  { id: 'printer', name: 'On-site photo printer', description: 'Guests can collect physical prints of their still photos at the event.' },
  { id: 'qr', name: 'QR download', description: 'Guests scan a QR code to download their event photo or video.' },
  { id: 'email', name: 'Email delivery', description: 'Guests enter an email address to receive their event photo or video.' },
];

const optionalItems = [...ADDONS, ...DELIVERY_OPTIONS];
const digitalSetupIds = new Set(['qr', 'email']);

// Set an included item to 0. Leave an undecided rate null to keep its quotation pending.
export const RATE_CARD = {
  currency: 'AED',
  includedHours: 3,
  boothDay: { mirror: 2100, classic: 1650, grand: 2400 },
  experienceDay: { frame: 0, aiPhoto: 600, aiVideo: 1200 },
  overtimeHour: 400,
  earlySetupHour: 100,
  addonDay: { queue: 350, stanchions: 150, printer: 350 },
  deliverySetup: { qr: 0, email: 0 },
  promoterDay: 450,
  transportDay: { Ajman: 150, Sharjah: 175, Dubai: 200, 'Abu Dhabi': 500 },
  longDayDiscountDay: 1600,
};

export function createUnit(type, id = globalThis.crypto.randomUUID()) {
  return {
    id, type, experience: '', venue: '', startDate: '', endDate: '',
    startTime: '', endTime: '', earlySetup: false,
    reportTime: '', reportDayOffset: 0, addons: type === 'mirror' ? ['printer', 'email'] : [],
    screenSide: 'either', screenSize: 24, venueEmirate: '', longDayOffer: false,
    staffing: 'client', additionalStaff: 0,
  };
}

const DAY_MINUTES = 24 * 60;
const DAY_MS = DAY_MINUTES * 60 * 1000;

function normalizedVenue(venue) {
  if (typeof venue !== 'string') return '';
  return venue.normalize('NFKC').toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const emirateNames = [
  ['Ajman', / (?:ajman|عجمان) /],
  ['Sharjah', / (?:sharjah|الشارقة) /],
  ['Dubai', / (?:dubai|دبي) /],
  ['Abu Dhabi', / (?:abu dhabi|abudhabi|abu zabi|al ain|أبوظبي|أبو ظبي|ابوظبي|ابو ظبي|العين) /],
  ['Umm Al Quwain', / (?:umm al quwain|umm al qaiwain|umm al quwein|umm al qawain|uaq|أم القيوين|ام القيوين) /],
  ['Ras Al Khaimah', / (?:ras al khaimah?|ras al kheima?h?|rak|رأس الخيمة|راس الخيمة) /],
  ['Fujairah', / (?:fujairah|fujeirah|الفجيرة) /],
];

function inferEmirate(venue) {
  const name = ' ' + normalizedVenue(venue) + ' ';
  const matches = emirateNames.filter(([, pattern]) => pattern.test(name));
  return matches.length === 1 ? matches[0][0] : '';
}

// Retained for legacy callers. Transport is now assigned by individual emirate.
export function inferTravelZone(venue) {
  const emirate = inferEmirate(venue);
  if (!emirate) return '';
  return ['Ajman', 'Sharjah', 'Dubai'].includes(emirate) ? 'local' : 'regional';
}

export function transportInfo(unit, rates = RATE_CARD) {
  const mapEmirate = typeof unit.venueEmirate === 'string' ? unit.venueEmirate.trim() : '';
  const emirate = inferEmirate(mapEmirate || unit.venue);
  const rate = rates.transportDay?.[emirate];
  return { emirate, rate: validRate(rate) ? rate : null };
}

function dateValue(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const utc = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== date) return null;
  return utc;
}

function timeValue(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function timeString(minutes) {
  const clock = (minutes + DAY_MINUTES) % DAY_MINUTES;
  const hour = String(Math.floor(clock / 60)).padStart(2, '0');
  return hour + ':' + String(clock % 60).padStart(2, '0');
}

function validOffset(offset) {
  return [0, '0', -1, '-1'].includes(offset);
}

export function scheduleInfo(unit) {
  const first = dateValue(unit.startDate);
  const last = dateValue(unit.endDate);
  const days = first !== null && last !== null && last >= first ? (last - first) / DAY_MS + 1 : null;
  const start = timeValue(unit.startTime);
  const end = timeValue(unit.endTime);
  const duration = start !== null && end !== null && start !== end
    ? (end - start + DAY_MINUTES) % DAY_MINUTES : null;
  const standard = start === null ? null : start - 120;
  let earlyHoursPerDay = 0;
  if (unit.earlySetup) {
    const report = timeValue(unit.reportTime);
    earlyHoursPerDay = null;
    if (report !== null && standard !== null && validOffset(unit.reportDayOffset)) {
      const extraMinutes = standard - (report + Number(unit.reportDayOffset) * DAY_MINUTES);
      if (extraMinutes > 0) earlyHoursPerDay = extraMinutes / 60;
    }
  }
  return {
    days,
    hoursPerDay: duration === null ? null : duration / 60,
    standardSetupTime: standard === null ? null : timeString(standard),
    standardSetupDayOffset: standard === null ? null : Math.floor(standard / DAY_MINUTES),
    earlyHoursPerDay,
  };
}

export function validateUnit(unit) {
  const errors = {};
  const schedule = scheduleInfo(unit);
  if (!getBooth(unit.type)) errors.type = 'Choose a booth.';
  if (unit.type === 'classic' && unit.screenSize !== undefined && !SCREEN_SIZES.includes(unit.screenSize)) {
    errors.screenSize = 'Choose a 24, 27 or 32-inch screen.';
  }
  if (unit.staffing !== undefined && !['client', 'b3yond'].includes(unit.staffing)) {
    errors.staffing = 'Choose who will supply the on-site promoter.';
  }
  if (unit.additionalStaff !== undefined && (!Number.isInteger(unit.additionalStaff) || unit.additionalStaff < 0 || unit.additionalStaff > 20)) {
    errors.additionalStaff = 'Choose a whole number from 0 to 20.';
  }
  if (!EXPERIENCES.some(item => item.id === unit.experience)) errors.experience = 'Choose an experience.';
  if (typeof unit.venue !== 'string' || !unit.venue.trim()) errors.venue = 'Enter the venue or event location.';
  if (dateValue(unit.startDate) === null) errors.startDate = 'Choose the first event date.';
  if (dateValue(unit.endDate) === null) errors.endDate = 'Choose the last event date.';
  else if (!errors.startDate && schedule.days === null) errors.endDate = 'Choose an end date on or after the start date.';
  if (timeValue(unit.startTime) === null) errors.startTime = 'Choose the daily start time.';
  if (timeValue(unit.endTime) === null) errors.endTime = 'Choose the daily end time.';
  else if (!errors.startTime && schedule.hoursPerDay === null) errors.endTime = 'Choose a different end time to specify the event duration.';
  if (unit.earlySetup) {
    if (!validOffset(unit.reportDayOffset)) errors.reportDayOffset = 'Choose the event day or the previous day.';
    if (timeValue(unit.reportTime) === null) errors.reportTime = 'Choose an earlier arrival time.';
    else if (!errors.startTime && !errors.reportDayOffset && schedule.earlyHoursPerDay === null) {
      errors.reportTime = 'Choose a reporting time earlier than the included setup time.';
    }
  }
  if (!Array.isArray(unit.addons) || unit.addons.some(id => !optionalItems.some(item => item.id === id))) {
    errors.addons = 'Choose an available add-on.';
  }
  if (unit.screenSide !== undefined && !['left', 'right', 'either'].includes(unit.screenSide)) {
    errors.screenSide = 'Choose a side for the collection screen.';
  }
  return errors;
}

function validRate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isLongDayOfferEligible(unit) {
  const { days, hoursPerDay } = scheduleInfo(unit);
  return unit.type === 'mirror' && days === 4 && hoursPerDay === 12;
}

export function addonPrice(id, type, rates = RATE_CARD) {
  if (id === 'printer' && type === 'mirror') return 0;
  return digitalSetupIds.has(id) ? rates.deliverySetup?.[id] : rates.addonDay?.[id];
}

const money = value => Math.round((value + Number.EPSILON) * 100) / 100;

function line(label, quantity, price, unit, sign = 1) {
  const rate = validRate(price) ? sign * price : null;
  const amount = rate === null || quantity === null ? null : money(rate * quantity);
  return { label, quantity, rate, amount, unit };
}

export function priceUnit(unit, rates = RATE_CARD) {
  const { days, hoursPerDay, earlyHoursPerDay } = scheduleInfo(unit);
  const booth = getBooth(unit.type);
  const experience = EXPERIENCES.find(item => item.id === unit.experience);
  const lines = [
    line(booth?.name || 'Booth hire', days, rates.boothDay?.[unit.type], 'day'),
  ];
  if (experience) lines.push(line(experience.name, days, rates.experienceDay?.[experience.id], 'day'));

  const overtime = hoursPerDay !== null && validRate(rates.includedHours)
    ? Math.max(0, hoursPerDay - rates.includedHours) : null;
  if (overtime !== 0 && rates.overtimeHour !== 0) {
    lines.push(line('Additional event hours', days !== null && overtime !== null ? days * overtime : null, rates.overtimeHour, 'hour'));
  }
  if (unit.longDayOffer === true && isLongDayOfferEligible(unit)) {
    lines.push(line('Four-day Mirror Booth offer', days, rates.longDayDiscountDay, 'day', -1));
  }
  if (unit.earlySetup) {
    lines.push(line('Earlier reporting', days !== null && earlyHoursPerDay !== null ? days * earlyHoursPerDay : null, rates.earlySetupHour, 'hour'));
  }
  if (unit.staffing === 'b3yond') {
    lines.push(line('B3YOND on-site promoter', days, rates.promoterDay, 'day'));
  }
  if (Number.isInteger(unit.additionalStaff) && unit.additionalStaff > 0 && unit.additionalStaff <= 20) {
    lines.push(line('Additional on-site staff', days === null ? null : days * unit.additionalStaff, rates.promoterDay, 'person-day'));
  }
  const selected = new Set(Array.isArray(unit.addons) ? unit.addons : []);
  for (const item of optionalItems) {
    if (!selected.has(item.id)) continue;
    const digital = digitalSetupIds.has(item.id);
    lines.push(line(item.name, digital ? 1 : days, addonPrice(item.id, unit.type, rates), digital ? 'setup' : 'day'));
  }
  const complete = !Object.keys(validateUnit(unit)).length && lines.every(item => item.amount !== null);
  return { lines, total: complete ? money(lines.reduce((sum, item) => sum + item.amount, 0)) : null };
}

function transportLines(units, rates) {
  const byEmirate = new Map();
  for (const unit of units) {
    const { emirate, rate } = transportInfo(unit, rates);
    if (!byEmirate.has(emirate)) byEmirate.set(emirate, { rate, venues: new Map(), incomplete: false });
    const group = byEmirate.get(emirate);
    const first = dateValue(unit.startDate);
    const last = dateValue(unit.endDate);
    const venue = normalizedVenue(unit.venue);
    if (!venue || first === null || last === null || last < first) {
      group.incomplete = true;
      continue;
    }
    if (!group.venues.has(venue)) group.venues.set(venue, []);
    group.venues.get(venue).push([first, last]);
  }

  return Array.from(byEmirate, ([emirate, group]) => {
    const days = group.incomplete ? null : mergedVenueDays(group.venues);
    const amount = days === null || group.rate === null ? null : money(days * group.rate);
    return { emirate, days, rate: group.rate, amount };
  });
}

function mergedVenueDays(venues) {
  let days = 0;
  for (const intervals of venues.values()) {
    intervals.sort(([a], [b]) => a - b);
    let coveredThrough = -Infinity;
    for (const [first, last] of intervals) {
      if (last <= coveredThrough) continue;
      const firstNewDay = Math.max(first, coveredThrough + DAY_MS);
      days += 1 + (last - firstNewDay) / DAY_MS;
      coveredThrough = last;
    }
  }
  return days;
}

export function priceQuote(units, rates = RATE_CARD) {
  const results = units.map(unit => priceUnit(unit, rates));
  const priced = results.length > 0 && results.every(result => result.total !== null);
  const subtotal = priced ? money(results.reduce((sum, result) => sum + result.total, 0)) : null;
  const travelLines = transportLines(units, rates);
  const travelPending = travelLines.some(item => item.amount === null);
  const travelDays = travelLines.some(item => item.days === null) ? null : travelLines.reduce((sum, item) => sum + item.days, 0);
  const travelTotal = travelPending ? null : money(travelLines.reduce((sum, item) => sum + item.amount, 0));
  const total = subtotal === null || travelTotal === null ? null : money(subtotal + travelTotal);
  return { units: results, subtotal, travelDays, travelTotal, travelLines, travelPending, total };
}
