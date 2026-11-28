export const BOOTHS = [
  { id: 'mirror', name: 'Mirror Booth', description: 'A full-length interactive mirror for portraits and group photos.' },
  { id: 'classic', name: 'Display Stand', description: 'A freestanding photo booth with a 24, 27 or 32-inch screen.' },
];

const retiredKiosk = { id: 'grand', name: 'Touchscreen Kiosk', description: 'A large-format touchscreen for a more prominent event setup.' };
export const SCREEN_SIZES = [24, 27, 32];
export const VIDEO_SECONDS = [5, 10, 15];
export const VIDEO_RESOLUTIONS = ['720p', '1080p'];

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
  { id: 'props', name: 'Photo booth props', description: 'Add hats, novelty glasses and handheld signs for guests to use at the booth.' },
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
  displaySizePremiumDay: { 24: 0, 27: 100, 32: 200 },
  aiPhotoRate: 0.50,
  aiPhotoPrintRate: 1.50,
  videoRate15Seconds: { '720p': 6, '1080p': 12 },
  overtimeHour: 400,
  earlySetupHour: 100,
  addonDay: { queue: 350, stanchions: 150, printer: 350, props: 0 },
  deliverySetup: { qr: 100, email: 150 },
  promoterHour: 75,
  transportDay: { Ajman: 150, Sharjah: 175, Dubai: 200, 'Abu Dhabi': 500 },
  longDayDiscountDay: 1600,
};

export function createUnit(type, id = globalThis.crypto.randomUUID()) {
  return {
    id, type, experience: '', venue: '', startDate: '', endDate: '',
    startTime: '', endTime: '', earlySetup: false,
    reportTime: '', reportDayOffset: 0, addons: type === 'mirror' ? ['printer', 'email'] : [],
    screenSide: 'either', screenSize: 24, venueEmirate: '', longDayOffer: false,
    staffing: 'client', additionalStaff: 0, staffHoursPerDay: '',
    expectedGuests: '', aiMode: 'fixed', aiQuantity: '', videoResolution: '720p', videoSeconds: 15,
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

function blank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function positiveCount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function generationInfo(unit, rates = RATE_CARD) {
  const ai = unit.experience === 'aiPhoto' || unit.experience === 'aiVideo';
  const mode = unit.aiMode ?? 'fixed';
  const expectedGuests = positiveCount(unit.expectedGuests);
  const allocation = blank(unit.aiQuantity) ? expectedGuests : positiveCount(unit.aiQuantity);
  const addons = Array.isArray(unit.addons) ? unit.addons : [];
  const cycleSeconds = addons.includes('queue') ? 20 : 45;
  const photoWithPrint = unit.experience === 'aiPhoto' && addons.includes('printer');
  const { days, hoursPerDay } = scheduleInfo(unit);
  // Each daily session starts afresh. Partial cycles cannot carry into the next day.
  const sessionSeconds = hoursPerDay === null ? null : Math.round(hoursPerDay * 60) * 60;
  const capacityPerDay = sessionSeconds === null ? null : Math.floor(sessionSeconds / cycleSeconds);
  const capacity = days === null || capacityPerDay === null ? null : capacityPerDay * days;
  const quantity = !ai ? null : mode === 'fixed' ? allocation : mode === 'unlimited' ? capacity : null;
  let unitPrice = null;
  if (unit.experience === 'aiPhoto') {
    const rate = photoWithPrint ? rates.aiPhotoPrintRate : rates.aiPhotoRate;
    if (validRate(rate)) unitPrice = rate;
  }
  if (unit.experience === 'aiVideo') {
    const resolution = unit.videoResolution ?? '720p';
    const seconds = Number(unit.videoSeconds ?? 15);
    const base = rates.videoRate15Seconds?.[resolution];
    if (VIDEO_RESOLUTIONS.includes(resolution) && VIDEO_SECONDS.includes(seconds) && validRate(base)) {
      unitPrice = money(base * seconds / 15);
    }
  }
  const amount = quantity === null || unitPrice === null ? null : money(quantity * unitPrice);
  const overCapacity = mode === 'fixed' && capacity !== null && allocation !== null && allocation > capacity;
  const guestShortfall = expectedGuests === null || capacity === null ? null : Math.max(0, expectedGuests - capacity);
  return { mode, expectedGuests, allocation, cycleSeconds, capacityPerDay, capacity, quantity, unitPrice, amount, overCapacity, guestShortfall, photoWithPrint };
}

export function staffingInfo(unit, rates = RATE_CARD) {
  const { days, hoursPerDay: eventHours } = scheduleInfo(unit);
  const extra = unit.additionalStaff ?? 0;
  const people = (unit.staffing === 'b3yond' ? 1 : 0) + (Number.isInteger(extra) && extra >= 0 && extra <= 20 ? extra : 0);
  const rate = validRate(rates.promoterHour) ? rates.promoterHour : null;
  let hoursPerDay = eventHours;
  if (people && !blank(unit.staffHoursPerDay)) {
    const hours = Number(unit.staffHoursPerDay);
    const minutes = Math.round(hours * 60);
    const wholeMinutes = Number.isFinite(hours) && Math.abs(hours * 60 - minutes) < 1e-7;
    hoursPerDay = wholeMinutes && minutes > 0 && minutes < DAY_MINUTES &&
      (eventHours === null || minutes <= Math.round(eventHours * 60)) ? minutes / 60 : null;
  }
  const personHours = !people ? 0 : hoursPerDay === null || days === null ? null : Math.round(hoursPerDay * 60) * days * people / 60;
  const amount = personHours === null || rate === null ? null : money(personHours * rate);
  return { people, hoursPerDay, personHours, rate, amount };
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
  const ai = unit.experience === 'aiPhoto' || unit.experience === 'aiVideo';
  if ((ai || !blank(unit.expectedGuests)) && positiveCount(unit.expectedGuests) === null) {
    errors.expectedGuests = 'Enter the expected number of guests for this booth as a positive whole number.';
  }
  if (ai) {
    const generation = generationInfo(unit);
    if (!['fixed', 'unlimited'].includes(generation.mode)) errors.aiMode = 'Choose a generation plan.';
    if (generation.mode === 'fixed' && !blank(unit.aiQuantity) && generation.allocation === null) {
      errors.aiQuantity = 'Enter a positive whole number of generations.';
    } else if (generation.overCapacity) {
      errors.aiQuantity = 'This booth can serve up to ' + generation.capacity.toLocaleString('en-AE') + ' generations during this schedule. Reduce the allocation, enable queue management, extend the event, or split guests between booths.';
    }
    if (unit.experience === 'aiVideo') {
      if (!VIDEO_RESOLUTIONS.includes(unit.videoResolution ?? '720p')) errors.videoResolution = 'Choose 720p or 1080p.';
      if (!VIDEO_SECONDS.includes(Number(unit.videoSeconds ?? 15))) errors.videoSeconds = 'Choose a 5, 10 or 15-second video.';
    }
  }
  const staff = staffingInfo(unit);
  if (staff.people && !blank(unit.staffHoursPerDay) && staff.hoursPerDay === null) {
    errors.staffHoursPerDay = 'Enter at least one minute, up to the event duration each day.';
  }
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

export function boothHireRate(unit, rates = RATE_CARD) {
  const baseRate = rates.boothDay?.[unit.type];
  if (!validRate(baseRate)) return null;
  if (unit.type !== 'classic') return baseRate;
  const premiums = rates.displaySizePremiumDay ?? RATE_CARD.displaySizePremiumDay;
  const premium = premiums[unit.screenSize ?? 24];
  return validRate(premium) ? money(baseRate + premium) : null;
}

export function addonPrice(id, type, rates = RATE_CARD) {
  return digitalSetupIds.has(id) ? rates.deliverySetup?.[id] : rates.addonDay?.[id];
}

export function addonIncluded(id, type) {
  return type === 'mirror' && (id === 'printer' || id === 'email');
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
  const hireLabel = unit.type === 'classic' ? 'Display Stand (' + (unit.screenSize ?? 24) + '″)' : booth?.name || 'Booth hire';
  const lines = [
    line(hireLabel, days, boothHireRate(unit, rates), 'day'),
  ];
  if (experience?.id === 'frame') {
    lines.push(line('Branded frame', 1, 0, 'setup'));
  } else if (experience) {
    const generation = generationInfo(unit, rates);
    const video = experience.id === 'aiVideo';
    const format = video
      ? ' (' + (unit.videoResolution ?? '720p') + ', ' + (unit.videoSeconds ?? 15) + 's)'
      : (generation.photoWithPrint ? ' + one print' : ' (digital only)');
    const plan = generation.mode === 'unlimited' ? 'unlimited during booked hours' : 'fixed allocation';
    lines.push(line(experience.name + format + ' · ' + plan, generation.quantity, generation.unitPrice, video ? 'video' : 'photo'));
  }

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
  const staff = staffingInfo(unit, rates);
  if (staff.people) {
    const label = staff.people === 1 ? 'B3YOND on-site promoter' : 'B3YOND on-site promoters (' + staff.people + ' people)';
    lines.push(line(label, staff.personHours, staff.rate, 'person-hour'));
  }
  const selected = new Set(Array.isArray(unit.addons) ? unit.addons : []);
  for (const item of optionalItems) {
    if (!selected.has(item.id)) continue;
    const digital = digitalSetupIds.has(item.id);
    const rate = addonPrice(item.id, unit.type, rates);
    const quantity = digital ? 1 : days;
    const basis = digital ? 'setup' : 'day';
    let label = item.name;
    if (item.id === 'printer') {
      label = 'On-site photo printer hire';
      if (unit.experience === 'aiVideo') label += ' · video stills';
    }
    lines.push(line(label, quantity, rate, basis));
    if (addonIncluded(item.id, unit.type)) {
      const credit = item.id === 'printer' ? 'On-site photo printer hire' : item.name;
      lines.push(line('Mirror package credit · ' + credit, quantity, rate, basis, -1));
    }
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

export function quoteEstimate(units, rates = RATE_CARD) {
  const quote = priceQuote(units, rates);
  const estimate = { amount: quote.total, assumedDays: false, transportPending: quote.travelPending, incomplete: quote.total === null };
  if (!estimate.incomplete || !units.length) return estimate;

  let amount = 0;
  const scheduledVenues = [];
  units.forEach((unit, index) => {
    let result = quote.units[index];
    if (scheduleInfo(unit).days === null) {
      // The provisional price covers one day until both dates are valid.
      const date = dateValue(unit.startDate) === null ? '2000-01-01' : unit.startDate;
      result = priceUnit({ ...unit, startDate: date, endDate: date }, rates);
      estimate.assumedDays = true;
    } else if (normalizedVenue(unit.venue)) {
      scheduledVenues.push(unit);
    }
    for (const item of result.lines) amount += item.amount ?? 0;
  });
  // Unscheduled booths must neither create travel charges nor hide scheduled ones at the same venue.
  for (const item of transportLines(scheduledVenues, rates)) amount += item.amount ?? 0;
  estimate.amount = money(amount);
  return estimate;
}
