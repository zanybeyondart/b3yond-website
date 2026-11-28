import {BOOTHS, RATE_CARD, boothHireRate, createUnit, getBooth, quoteEstimate, validateUnit} from './model.js';
import {renderConfig, installConfig, showErrors} from './configure.js';
import {renderReview, renderPrint} from './review.js';

const key = 'b3yond.quote-studio.v1';
const byId = id => document.getElementById(id);
const pane = byId('pane');
const dialog = byId('summary');
const title = ['Choose your booths', 'Configure your booths', 'Review your quote'];
const intro = [
  'Choose a Mirror Booth, a Display Stand, or a mix of both for your event.',
  'Choose an experience, set the schedule and decide how guests receive their photos or videos.',
  'Check the event details and pricing before saving your quotation.',
];
const stepNames = ['Select booths', 'Event details', 'Review quote'];
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
const empty = () => ({step:1, units:[], activeId:null});

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || !Array.isArray(saved.units)) return empty();
    const units = saved.units.filter(u => u && typeof u.id === 'string' && getBooth(u.type))
      .map(u => ({...createUnit(u.type,u.id),...u,addons:Array.isArray(u.addons) ? u.addons : []}));
    const step = units.length ? (saved.step === 3 && units.every(isComplete) ? 3 : saved.step >= 2 ? 2 : 1) : 1;
    return {units,step,activeId:units.find(u => u.id === saved.activeId)?.id || units[0]?.id || null};
  } catch { return empty(); }
}
const state = restore();
let removal = null;
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

function updateSteps() {
  byId('steps').innerHTML = stepNames.map((name,i) => {
    const num = i+1, active = num === state.step, done = num < state.step;
    const available = num === 1 || (num === 2 && state.units.length) || (num === 3 && state.units.length && state.units.every(isComplete));
    return (i?'<span class="step-gap" aria-hidden="true"></span>':'')+
      '<button type="button" class="step '+(active?'active':done?'done':'')+'" data-action="stage" data-step="'+num+'" '+
      (active?'aria-current="step"':'')+(!available?' disabled':'')+'><span class="step-num" aria-hidden="true">'+(done?check:num)+'</span>'+name+'</button>';
  }).join('');
}
function estimateDetails(estimate) {
  const notes = ['Before VAT'];
  if (estimate.assumedDays) notes.push('1 day assumed for booths without dates');
  if (estimate.transportPending) notes.push('Transport pending');
  return notes.join(' · ');
}
function updateEstimate() {
  const panel = byId('running-estimate');
  panel.hidden = !state.units.length || state.step === 3;
  if (panel.hidden) return;
  const estimate = quoteEstimate(state.units);
  byId('estimate-label').textContent = estimate.incomplete ? 'Estimate so far' : 'Quote estimate';
  byId('estimate-amount').textContent = formatAED(estimate.amount);
  byId('estimate-detail').textContent = estimateDetails(estimate);
}
function updateControls() {
  const n = state.units.length, ready = state.units.filter(isComplete).length;
  byId('top-count').textContent = n;
  byId('bar-label').textContent = state.step === 2 ? 'Booth details' : 'Your selection';
  byId('bar-status').textContent = state.step === 2 ? ready+' of '+n+' configured' : countText(n)+' selected';
  byId('back').hidden = state.step === 1;
  const otherIncomplete = state.units.some(u => u.id !== state.activeId && !isComplete(u));
  byId('next').textContent = state.step === 1 ? 'Continue' : state.step === 2 ? (otherIncomplete ? 'Next booth' : 'Review quotation') : 'Print / Save PDF';
  updateEstimate();
  updateSteps();
}
function render() {
  const s = state.step;
  byId('title').innerHTML = title[s-1]+'<span>.</span>';
  byId('intro').textContent = intro[s-1];
  byId('selection-error').hidden = true;
  pane.innerHTML = s === 1 ? cards() : s === 2 ? renderConfig(state.units,state.activeId) : renderReview(state.units);
  byId('print-view').innerHTML = s === 3 ? renderPrint(state.units) : '';
  updateControls();
}
function go(step,id) {
  if (step>1 && !state.units.length) return;
  if (id) state.activeId = id;
  if (step === 2 && !state.units.some(u => u.id === state.activeId)) state.activeId = state.units[0].id;
  if (step === 3 && !state.units.every(isComplete)) return;
  state.step = step;
  render(); save();
  byId('title').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function add(type) {
  if (!BOOTHS.some(b => b.id === type)) return;
  state.units.push(createUnit(type));
  state.activeId ??= state.units[0].id;
  save(); render();
  pane.querySelector('.quantity [data-action="add"][data-type="'+type+'"]')?.focus({preventScroll:true});
  announce(countText(state.units.length)+' selected.');
}
function remove(unit) {
  state.units = state.units.filter(u => u.id !== unit.id);
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
function showSummary() {
  const types = [...new Set(state.units.map(u => u.type))];
  const selected = types.map(id => ({...getBooth(id),count:state.units.filter(u => u.type === id).length}));
  const rows = selected.map(b => '<div class="dlg-row"><img src="./assets/'+b.id+'.webp" alt=""><strong>'+escape(b.name)+'</strong><span>Qty '+b.count+'</span></div>').join('');
  const status = state.units.length ? (state.units.filter(isComplete).length+' of '+countText(state.units.length)+' configured.') : 'Your quotation is empty. Choose a booth to get started.';
  const estimate = quoteEstimate(state.units);
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
  if (state.step === 1) {go(2);return;}
  if (state.step === 2) {
    const current = state.units.find(u => u.id === state.activeId);
    if (!isComplete(current)) {showErrors(pane,current);return;}
    const nextIncomplete = state.units.find(u => !isComplete(u));
    if (nextIncomplete) {go(2,nextIncomplete.id);announce('Configuring '+unitLabel(nextIncomplete));return;}
    go(3);return;
  }
  await Promise.allSettled(Array.from(byId('print-view').querySelectorAll('img'), img => img.decode()));
  window.print();
}

installConfig(pane,{
  getUnits:() => state.units,getActiveId:() => state.activeId,
  setActive:id => {state.activeId = id;render();save();},
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
  if (action === 'summary') showSummary();
  if (action === 'close-summary') dialog.close();
  if (action === 'new-quote') {
    openDialog('Start a new quote','<p class="dialog-body">This will clear the current draft on this device. Save a PDF first if you need a copy.</p><div class="dlg-actions"><button class="dialog-btn" data-action="close-summary">Keep draft</button><button class="dialog-btn primary" data-action="reset-quote">Start new quote</button></div>');
  }
  if (action === 'reset-quote') {
    dialog.close();Object.assign(state,empty());go(1);announce('New quotation started.');
  }
  if (action === 'selection') {dialog.close();go(1);}
  if (action === 'back') go(Math.max(1,state.step-1));
  if (action === 'next') next();
  if (action === 'stage' && Number(trigger.dataset.step) !== state.step) go(Number(trigger.dataset.step));
  if (action === 'edit-unit') go(2,id);
});
dialog.addEventListener('close',() => {removal = null;});
dialog.addEventListener('click',e => {
  if (e.target !== dialog) return;
  const b = dialog.getBoundingClientRect();
  if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close();
});
render();
