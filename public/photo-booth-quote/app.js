import {ADDONS, BOOTHS, DELIVERY_OPTIONS, RATE_CARD, artworkPricing, boothHireRate, createUnit, generationInfo, getBooth, quoteEstimate, validateUnit} from './model.js';
import {renderConfig, installConfig, partForField, showErrors} from './configure.js';
import {renderReview, renderPrint} from './review.js';

const key = 'b3yond.quote-studio.v1';
const byId = id => document.getElementById(id);
const pane = byId('pane');
const dialog = byId('summary');
const partTitles = ['Choose an experience', 'Event details', 'How many guests?', 'Choose your extras'];
const partNames = ['Experience', 'Event', 'Guests', 'Extras'];
const guideParts = unit => unit?.experience === 'frame' ? [0, 1, 3] : [0, 1, 2, 3];
const icon = (content, viewBox = '0 0 24 24') => '<svg viewBox="' + viewBox + '" aria-hidden="true">' + content + '</svg>';
const plus = icon('<path d="M12 5v14M5 12h14"/>');
const minus = icon('<path d="M5 12h14"/>');
const check = icon('<path d="m5 12 4.5 4.5L19 7"/>');
const formats = {
  mirror: ['Full-length', '<rect x="7" y="2" width="10" height="20" rx="2"/>'],
  classic: ['Freestanding', '<rect x="5" y="3" width="14" height="14" rx="2"/><path d="M12 17v4m-4 0h8"/>'],
};
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatAED = value => 'AED ' + new Intl.NumberFormat('en-AE', {maximumFractionDigits:2}).format(value);
const countText = n => n === 1 ? '1 booth' : n + ' booths';
const isComplete = unit => Object.keys(validateUnit(unit)).length === 0;
const empty = () => ({step:1, units:[], activeId:null, artworkCount:2, draftKey:crypto.randomUUID(), contact:{name:'',email:''}, guide:Object.create(null)});
const availableAddons = new Set([...ADDONS,...DELIVERY_OPTIONS].map(option => option.id));
const newProgress = () => ({part:0, furthest:0, finished:false});
function firstErrorPart(unit) {
  const fields = Object.keys(validateUnit(unit));
  return fields.length ? Math.min(...fields.map(field => partForField(field,unit))) : null;
}
function permittedPart(unit, progress, target) {
  const limit = Math.min(progress.furthest,firstErrorPart(unit) ?? 3);
  return guideParts(unit).filter(part => part <= target && part <= limit).at(-1) ?? 0;
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || !Array.isArray(saved.units)) return empty();
    const result = empty();
    result.draftKey = typeof saved.draftKey === 'string' && /^[a-f0-9-]{36,128}$/i.test(saved.draftKey) ? saved.draftKey : result.draftKey;
    result.contact = {name:typeof saved.contact?.name === 'string' ? saved.contact.name : '',email:typeof saved.contact?.email === 'string' ? saved.contact.email : ''};
    result.artworkCount = artworkPricing(saved.artworkCount).count;
    for (const u of saved.units) {
      if (!u || typeof u.id !== 'string' || !u.id || result.guide[u.id] || !getBooth(u.type)) continue;
      const defaults = createUnit(u.type,u.id);
      const unit = {...defaults,...u};
      for (const field of ['venue','venueEmirate','startDate','endDate','startTime','endTime','reportTime']) {
        if (typeof unit[field] !== 'string') unit[field] = '';
      }
      unit.addons = Array.isArray(u.addons) ? [...new Set(u.addons.filter(id => availableAddons.has(id)))] : defaults.addons;
      unit.customArtwork = u.customArtwork === true;
      delete unit.aiQuantity;
      const old = Object.hasOwn(saved.guide || {},u.id) ? saved.guide[u.id] : null;
      const legacy = saved.step >= 2 ? (firstErrorPart(unit) ?? 3) : 0;
      const validPart = x => Number.isInteger(x) && x >= 0 && x <= 3;
      const progress = {
        capacitySeen:typeof old?.capacitySeen === 'string' ? old.capacitySeen : '',
        furthest:validPart(old?.furthest) ? old.furthest : legacy,
        finished:old ? old.finished === true : legacy === 3 && isComplete(unit),
      };
      progress.part = permittedPart(unit,progress,validPart(old?.part) ? old.part : legacy);
      result.units.push(unit);
      result.guide[unit.id] = progress;
    }
    result.activeId = result.units.find(u => u.id === saved.activeId)?.id || result.units[0]?.id || null;
    if (result.units.length && saved.step >= 2) result.step = 2;
    if (saved.step === 3 && result.units.length && result.units.every(u => result.guide[u.id].finished && isComplete(u))) result.step = 3;
    return result;
  } catch { return empty(); }
}
const state = restore();
let removal = null;
let pendingCapacity = null;
let storageWorking = true;

function save() {
  try {localStorage.setItem(key, JSON.stringify(state));}
  catch {storageWorking = false;}
}
function announce(message) {byId('announcement').textContent = message;}

function retiredSelection() {
  const units = state.units.filter(unit => !BOOTHS.some(booth => booth.id === unit.type));
  if (!units.length) return '';
  return '<section class="retired-selection"><h2>Previously selected</h2>'+units.map(unit =>
    '<div><span>'+escape(unitLabel(unit))+'</span><button type="button" data-action="remove-retired" data-id="'+escape(unit.id)+'">Remove</button></div>'
  ).join('')+'</section>';
}

function cards() {
  return '<div class="card-grid">' + BOOTHS.map(b => {
    const count = state.units.filter(u => u.type === b.id).length;
    const [format, pictogram] = formats[b.id] || [b.name,''];
    const control = count === 0
      ? '<button class="add-btn" type="button" data-action="add" data-type="' + b.id + '" aria-label="Add '+escape(b.name)+'">Add booth' + plus + '</button>'
      : '<div class="quantity" role="group" aria-label="'+escape(b.name)+' quantity"><button type="button" data-action="minus" data-type="'+b.id+'" aria-label="Remove one '+escape(b.name)+'">'+minus+'</button><output aria-label="Quantity">'+count+'</output><button data-action="add" type="button" data-type="'+b.id+'" aria-label="Add another '+escape(b.name)+'">'+plus+'</button></div>';
    const startingRate = (b.id === 'classic' ? 'From ' : '') + formatAED(boothHireRate({type:b.id}));
    return '<article class="booth-card'+(count?' is-selected':'')+'"><button type="button" class="card-image" data-action="add" data-type="'+b.id+'" aria-label="Add one '+escape(b.name)+'"><picture><source media="(max-width:680px)" srcset="./assets/'+b.id+'.webp"><img width="1072" height="724" src="./assets/'+b.id+'-wide.webp" alt=""></picture><i class="framer tl"></i><i class="framer tr"></i><i class="framer br"></i><span class="card-tag">'+icon(pictogram)+escape(format)+'</span></button><div class="card-content"><h2>'+escape(b.name)+'</h2><p>'+escape(b.description)+'</p><div class="card-controls"><div class="starting-rate"><strong>'+startingRate+'</strong> <span>/ first '+RATE_CARD.includedHours+' hours</span></div>'+control+'</div></div></article>';
  }).join('') + '</div>' + retiredSelection();
}

const activeUnit = () => state.units.find(u => u.id === state.activeId);
const finished = unit => state.guide[unit.id].finished && isComplete(unit);
const canReview = () => state.units.length > 0 && state.units.every(finished);
function updateSteps() {
  const unit = activeUnit(), guide = unit && state.guide[unit.id];
  const parts = guideParts(unit);
  const stages = [{name:'Booths',step:1},...parts.map(part => ({name:partNames[part],step:2,part})),{name:'Review',step:3}];
  const position = stages.findIndex(s => s.step === state.step && (s.step !== 2 || s.part === guide?.part));
  byId('steps').innerHTML = stages.map(({name,step,part},i) => {
    const active = i === position, done = i < position;
    const available = step === 1 || (step === 2 && unit && permittedPart(unit,guide,part) === part) || (step === 3 && canReview());
    return (i?'<span class="step-gap" aria-hidden="true"></span>':'')+
      '<button type="button" class="step '+(active?'active':done?'done':'')+'" data-action="stage" data-step="'+step+'" '+
      (part === undefined ? '' : 'data-part="'+part+'" ')+(active?'aria-current="step" ':'')+(!available?'disabled ':'')+
      'aria-label="Step '+(i+1)+' of '+stages.length+', '+name+'"><span class="step-num" aria-hidden="true">'+(done?check:i+1)+'</span><span class="step-name">'+name+'</span></button>';
  }).join('');
}
function estimateDetails(estimate) {
  const notes = ['Before VAT'];
  if (estimate.assumedDays) notes.push('Undated booths estimated at 1 day');
  if (estimate.transportPending) notes.push('Transport pending');
  return notes.join(' · ');
}
function updateEstimate() {
  const panel = byId('running-estimate');
  panel.hidden = !state.units.length || state.step === 3;
  if (panel.hidden) return;
  const estimate = quoteEstimate(state.units,RATE_CARD,state.artworkCount);
  byId('estimate-label').textContent = estimate.incomplete ? 'Estimate so far' : 'Quote estimate';
  byId('estimate-amount').textContent = formatAED(estimate.amount);
  byId('estimate-detail').textContent = estimateDetails(estimate);
}
function updateControls() {
  const n = state.units.length, unit = activeUnit(), guide = unit && state.guide[unit.id];
  byId('top-count').textContent = n;
  byId('bar-label').textContent = state.step === 3 ? 'Quotation' : 'Your selection';
  byId('bar-status').textContent = state.step === 3 ? countText(n)+' configured' : countText(n)+' selected';
  byId('bar-summary').hidden = n > 0 && state.step !== 3;
  byId('back').hidden = state.step === 1;
  const otherIncomplete = state.units.some(u => u.id !== state.activeId && !finished(u));
  byId('next').textContent = state.step === 3 ? 'Print / Save PDF' : state.step === 2 && guide?.part === 3 ? (otherIncomplete ? 'Next booth' : 'Review quote') : 'Continue';
  updateEstimate();
  updateSteps();
}
function render() {
  const s = state.step, unit = activeUnit(), part = unit ? state.guide[unit.id].part : 0;
  const heading = s === 1 ? 'Choose your booths' : s === 2 ? partTitles[part] : 'Review your quote';
  byId('title').textContent = heading;
  byId('site').dataset.stage = s;
  const intro = byId('intro');
  intro.textContent = s === 1 ? 'Add the booths you want for your event.' : s === 2 && state.units.length === 1 ? getBooth(unit.type).name : '';
  intro.hidden = !intro.textContent;
  byId('selection-error').hidden = true;
  pane.innerHTML = s === 1 ? cards() : s === 2 ? renderConfig(state.units,state.activeId,part,state.artworkCount) : renderReview(state.units,state.artworkCount);
  byId('print-view').innerHTML = s === 3 ? renderPrint(state.units,state.artworkCount) : '';
  updateControls();
  if (s === 3) {
    const contact=document.createElement('section');contact.className='quote-contact';
    contact.innerHTML='<label>Your name or company (optional)<input data-contact="name" maxlength="160" autocomplete="organization" value="'+escape(state.contact.name)+'"></label><label>Email (optional)<input data-contact="email" type="email" maxlength="200" autocomplete="email" value="'+escape(state.contact.email)+'"></label><p>Quotation details are saved for B3YOND to review.</p><p id="archive-status" role="status"></p>';
    pane.prepend(contact);
    saveQuote();
  }
}
function route() {
  const id = state.activeId;
  return {quoteGuide:true,step:state.step,id:state.step === 2 ? id : null,part:state.step === 2 ? state.guide[id].part : null};
}
function recordRoute(replace=false) {
  const current = route();
  try {
    if (replace) history.replaceState(current,'');
    else if (JSON.stringify(history.state) !== JSON.stringify(current)) history.pushState(current,'');
  } catch { /* The form also works without browser history. */ }
}
function go(step,id,part,withHistory=true) {
  if (step > 1 && !state.units.length) step = 1;
  if (step === 3 && !canReview()) return;
  if (withHistory && step === 3 && state.units.some(unit =>
    showCapacityNotice(unit,() => go(3,id,part))
  )) return;
  if (id && state.units.some(u => u.id === id)) state.activeId = id;
  if (step === 2) {
    const u = activeUnit() ?? state.units[0];
    state.activeId = u.id;
    const progress = state.guide[u.id];
    progress.part = permittedPart(u,progress,part ?? progress.part);
  }
  state.step = step;
  render(); save();
  if (withHistory) recordRoute();
  byId('title').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function add(type) {
  if (!BOOTHS.some(b => b.id === type)) return;
  const unit = createUnit(type);
  state.units.push(unit);
  state.guide[unit.id] = newProgress();
  state.activeId ??= state.units[0].id;
  save(); render();
  pane.querySelector('.quantity [data-action="add"][data-type="'+type+'"]')?.focus({preventScroll:true});
  announce(countText(state.units.length)+' selected.');
}
function remove(unit) {
  state.units = state.units.filter(u => u.id !== unit.id);
  delete state.guide[unit.id];
  if (!state.units.length) {state.artworkCount = 2;state.draftKey=crypto.randomUUID();state.contact={name:'',email:''};}
  if (state.activeId === unit.id) state.activeId = state.units[0]?.id || null;
  save(); render();
  const buttons = pane.querySelectorAll('.card-controls [data-type="'+unit.type+'"]');
  buttons[0]?.focus({preventScroll:true});
  announce(countText(state.units.length)+' selected.');
}
function unitLabel(unit){
  const same = state.units.filter(u => u.type === unit.type);
  return getBooth(unit.type).name+' '+(same.indexOf(unit)+1);
}
function openDialog(heading,markup) {
  byId('summary-title').innerHTML = heading+'<span>.</span>';
  byId('dialog-content').innerHTML = markup;
  if (!dialog.open) dialog.showModal();
}
function showCapacityNotice(unit, proceed) {
  const info = generationInfo(unit);
  if (!info.overCapacity) return false;
  const signature = [unit.experience,info.mode,info.expectedGuests,info.capacity].join('/');
  if (state.guide[unit.id].capacitySeen === signature) return false;
  const attendees = info.expectedGuests.toLocaleString('en-AE');
  const sessions = info.capacity.toLocaleString('en-AE');
  const name = state.units.length > 1 ? unitLabel(unit) : getBooth(unit.type).name;
  pendingCapacity = {id:unit.id,signature,proceed};
  openDialog('A note on booth capacity',
    '<p class="dialog-body">For '+escape(name)+', you entered <strong>'+attendees+' guests</strong>. '+
    'The booked hours allow for about <strong>'+sessions+' '+(info.capacity === 1 ? 'session' : 'sessions')+'</strong>.</p>'+
    '<p class="dialog-body">Some guests may skip the booth. If everyone takes part, there may be too little time for each guest to have a turn.</p>'+
    '<div class="dlg-actions"><button type="button" class="dialog-btn" data-action="close-summary">Go back</button>'+
    '<button type="button" class="dialog-btn primary" data-action="continue-capacity">Continue with this setup</button></div>');
  return true;
}
function showSummary() {
  const types = [...new Set(state.units.map(u => u.type))];
  const selected = types.map(id => ({...getBooth(id),count:state.units.filter(u => u.type === id).length}));
  const rows = selected.map(b => '<div class="dlg-row"><img src="./assets/'+b.id+'.webp" alt=""><strong>'+escape(b.name)+'</strong><span>Qty '+b.count+'</span></div>').join('');
  const status = state.units.length ? (state.units.filter(finished).length+' of '+countText(state.units.length)+' configured.') : 'Your quotation is empty. Choose a booth to get started.';
  const estimate = quoteEstimate(state.units,RATE_CARD,state.artworkCount);
  const amount = estimate.amount === null ? '' : '<div class="dlg-total"><span>'+(estimate.incomplete?'Estimate so far':'Quote estimate')+'</span><strong>'+formatAED(estimate.amount)+'</strong></div><p class="dialog-note estimate-note">'+escape(estimateDetails(estimate))+'</p>';
  openDialog('Quote summary',rows+amount+'<p class="dialog-body">'+status+'</p>'+(state.units.length?'<p class="dialog-note">'+(storageWorking?'Your draft is saved on this device.':'This browser cannot save the draft after you close the page.')+'</p>':'')+
   '<div class="dlg-actions">'+(state.units.length?'<button class="dialog-btn" data-action="new-quote">New quote</button>':'')+(state.step>1?'<button class="dialog-btn" data-action="selection">Edit selection</button>':'')+'<button class="dialog-btn primary" data-action="close-summary">Continue editing</button></div>');
}
async function next() {
  if (!state.units.length) {
    const error = byId('selection-error');
    error.textContent = 'Add at least one booth to continue.';error.hidden = false;
    pane.querySelector('.add-btn')?.focus({preventScroll:true});
    return;
  }
  if (state.step === 1) {
    const current = activeUnit();
    const target = current && !finished(current) ? current : state.units.find(unit => !finished(unit)) ?? current;
    go(2,target?.id);
    return;
  }
  if (state.step === 2) {
    const current = activeUnit(), progress = state.guide[current.id];
    const invalid = firstErrorPart(current);
    if (invalid !== null && invalid <= progress.part) {
      if (invalid !== progress.part) go(2,current.id,invalid);
      showErrors(pane,current,invalid);
      return;
    }
    if (progress.part >= 2 && showCapacityNotice(current,next)) return;
    const nextPart = guideParts(current).find(part => part > progress.part);
    if (nextPart !== undefined) {
      progress.furthest = Math.max(progress.furthest,nextPart);
      go(2,current.id,nextPart);
      return;
    }
    progress.finished = true;
    const nextBooth = state.units.find(u => !finished(u));
    if (nextBooth) {go(2,nextBooth.id);announce('Configuring '+unitLabel(nextBooth));return;}
    go(3);return;
  }
  await saveQuote();
  await Promise.allSettled(Array.from(byId('print-view').querySelectorAll('img'), img => img.decode()));
  window.print();
}

installConfig(pane,{
  getUnits:() => state.units,getActiveId:() => state.activeId,
  getArtworkCount:() => state.artworkCount,
  setArtworkCount:count => {state.artworkCount = artworkPricing(count).count;},
  setActive:id => go(2,id),
  changed:({render:refresh}) => {save();if(refresh)render();else updateControls();},
});
document.addEventListener('click',event => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const {action,type,id} = trigger.dataset;
  if (action === 'add') add(type);
  if (action === 'minus' || action === 'remove-retired') {
    const unit = action === 'remove-retired' ? state.units.find(u => u.id === id) : state.units.filter(u => u.type === type).at(-1);
    if (!unit) return;
    const initialAddons = createUnit(unit.type,unit.id).addons;
    const editedAddons = initialAddons.length !== unit.addons.length || unit.addons.some(addon => !initialAddons.includes(addon));
    if (unit.experience || unit.expectedGuests || unit.venue || unit.startDate || unit.endDate || unit.startTime || unit.endTime || unit.earlySetup || unit.venueEmirate || unit.additionalStaff || unit.staffing === 'b3yond' || unit.screenSize > 24 || editedAddons) {
      removal = unit;
      openDialog('Remove booth','<p class="dialog-body">Remove '+escape(unitLabel(unit))+' and its saved event details from this quotation?</p><div class="dlg-actions"><button class="dialog-btn" data-action="close-summary">Keep booth</button><button class="dialog-btn primary" data-action="confirm-remove">Remove booth</button></div>');
    } else remove(unit);
  }
  if (action === 'confirm-remove' && removal) {const unit = removal;dialog.close();remove(unit);}
  if (action === 'continue-capacity' && pendingCapacity) {
    const {id:unitId,signature,proceed} = pendingCapacity;
    pendingCapacity = null;
    dialog.close();
    if (state.guide[unitId]) {
      state.guide[unitId].capacitySeen = signature;
      save();
      proceed();
    }
  }
  if (action === 'summary') showSummary();
  if (action === 'close-summary') dialog.close();
  if (action === 'new-quote') {
    openDialog('Start a new quote','<p class="dialog-body">This will clear the current draft on this device. Save a PDF first if you need a copy.</p><div class="dlg-actions"><button class="dialog-btn" data-action="close-summary">Keep draft</button><button class="dialog-btn primary" data-action="reset-quote">Start new quote</button></div>');
  }
  if (action === 'reset-quote') {
    dialog.close();Object.assign(state,empty());go(1);announce('New quotation started.');
  }
  if (action === 'selection') {dialog.close();go(1);}
  if (action === 'back') {
    if (state.step === 3) go(2,state.activeId,3);
    else if (state.step === 2) {
      const unit = activeUnit(), part = state.guide[unit.id].part;
      if (part === 0) go(1);
      else go(2,unit.id,guideParts(unit).filter(p => p < part).at(-1));
    }
  }
  if (action === 'next') next();
  if (action === 'stage' && !trigger.hasAttribute('aria-current')) {
    const step = Number(trigger.dataset.step);
    const part = trigger.hasAttribute('data-part') ? Number(trigger.dataset.part) : undefined;
    const navigate = () => go(step,null,part);
    if (step === 2 && part === 3 && showCapacityNotice(activeUnit(),navigate)) return;
    navigate();
  }
  if (action === 'edit-unit') go(2,id,0);
});
dialog.addEventListener('close',() => {
  if (!dialog.open) {removal = null;pendingCapacity = null;}
});
dialog.addEventListener('click',e => {
  if (e.target !== dialog) return;
  const b = dialog.getBoundingClientRect();
  if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close();
});
window.addEventListener('popstate',event => {
  const dest = event.state;
  if (!dest?.quoteGuide) return;
  if (dialog.open) dialog.close();
  if ((dest.id && !state.units.some(unit => unit.id === dest.id)) || !state.units.length) go(1,null,null,false);
  else if (dest.step === 3 && !canReview()) go(2,null,undefined,false);
  else go(dest.step,dest.id,dest.part,false);
  recordRoute(true);
});
let archiveTimer;
let archiveChain=Promise.resolve();
function saveQuote() {
  if(state.step!==3)return Promise.resolve();
  const payload={units:state.units,artworkCount:state.artworkCount,draftKey:state.draftKey,...state.contact};
  const body=JSON.stringify(payload),draftKey=state.draftKey;
  archiveChain=archiveChain.catch(()=>{}).then(async()=>{
    try {
      const response=await fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body});
      if(!response.ok)throw new Error('Save failed');
      const result=await response.json();
      if(state.step===3&&state.draftKey===draftKey)byId('archive-status').textContent='Saved to B3YOND · '+result.id;
    }catch{
      if(state.step===3&&state.draftKey===draftKey)byId('archive-status').textContent='Online saving is unavailable. Keep your PDF and try again.';
    }
  });
  return archiveChain;
}
pane.addEventListener('input',event=>{
  const field=event.target.dataset.contact;
  if(!['name','email'].includes(field))return;
  state.contact[field]=event.target.value;save();
  clearTimeout(archiveTimer);archiveTimer=setTimeout(saveQuote,650);
});
render();
recordRoute(true);

save();
render();
recordRoute(true);
