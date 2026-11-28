import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUnit,hirePricing,priceQuote,quoteEstimate,generationInfo,scheduleInfo} from '../public/photo-booth-quote/model.js';
import {renderConfig} from '../public/photo-booth-quote/configure.js';
import {renderPrint,renderReview} from '../public/photo-booth-quote/review.js';
const unit=(extra={})=>({...createUnit('mirror','one'),experience:'aiPhoto',expectedGuests:600,venue:'Dubai Marina Dubai',startDate:'2026-12-01',endDate:'2026-12-02',startTime:'10:00',endTime:'22:00',addons:['queue','printer','email'],...extra});
const time=hours=>{const minutes=Math.round(hours*60)+600;return String(Math.floor(minutes/60)%24).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');};
test('Two-day packages and flexible allowance reproduce approved contained totals',()=>{
 const flexible=unit({aiMode:'unlimited'});assert.equal(hirePricing(flexible).total,6290);assert.equal(generationInfo(flexible).quantity,750);assert.equal(priceQuote([flexible]).total,8815);assert.equal(priceQuote([{...flexible,staffing:'b3yond'}]).total,10615);
 const short=unit({endTime:'13:00',staffing:'b3yond'});assert.equal(priceQuote([short]).total,6080);
 const video=unit({endTime:'13:00',experience:'aiVideo',videoResolution:'1080p',videoSeconds:10});const quote=priceQuote([video]);assert.equal(quote.requiresReview,true);assert.equal(quote.total,11930);
 for(const render of [renderReview,renderPrint]){const html=render([video]);assert.match(html,/Custom quote required/);assert.ok(!html.includes('11,930'));}
 assert.equal(quoteEstimate([video]).requiresReview,true);assert.match(renderReview([video],2,{quote,units:[video]}),/11,930/);
 for(const render of [renderReview,renderPrint])assert.match(render([flexible]),/8,815/);
});
test('Hire is monotonic by minute, size and number of days with no special four-day cliff',()=>{
 for(const type of ['mirror','classic','grand'])for(const size of [24,27,32]){
  let previous=0;
  for(let minutes=1;minutes<1440;minutes++){
   const candidate=unit({type,screenSize:size,endTime:time(minutes/60)});const hire=hirePricing(candidate);assert.ok(hire.total>=previous,JSON.stringify({type,size,minutes,hire,previous}));previous=hire.total;
  }
  for(const hours of [3,8,12,12.25,22]){let prev=0;for(const days of [1,2,3,4,5,10]){const candidate=unit({type,screenSize:size,endTime:time(hours),endDate:'2026-12-'+String(days).padStart(2,'0'),longDayOffer:true});const hire=hirePricing(candidate);assert.ok(hire.total>prev);prev=hire.total;assert.equal(priceQuote([candidate]).total,priceQuote([{...candidate,longDayOffer:false}]).total);}}
 }
 const mirror=unit();for(const [hours,expected]of [[3,1800],[8,2800],[12,3400],[13,3650]])assert.equal(hirePricing({...mirror,endTime:time(hours)}).daily,expected);
 for(const [size,cap]of [[24,2950],[27,3050],[32,3150]])assert.equal(hirePricing(unit({type:'classic',screenSize:size})).daily,cap);
});
test('Flexible allowance, unit rates, legacy drafts and line item duplication',()=>{
 for(const experience of ['aiPhoto','aiVideo'])for(const queued of [false,true])for(const guests of [1,40,600,10000]){
  const candidate=unit({experience,expectedGuests:guests,aiMode:'unlimited',endTime:'13:00',addons:queued?['queue','printer']:['printer']});const gen=generationInfo(candidate);assert.equal(gen.quantity,Math.min(gen.capacity,Math.ceil(guests*1.25)));
  assert.equal(generationInfo({...candidate,aiMode:'fixed'}).quantity,guests);
  const quote=priceQuote([candidate]);assert.equal(quoteEstimate([candidate]).amount,quote.total);assert.equal(quote.total,priceQuote([{...candidate,addons:[...candidate.addons,...candidate.addons]}]).total);
 }
 for(const seconds of [5,10,15])for(const resolution of ['720p','1080p'])assert.equal(generationInfo(unit({experience:'aiVideo',videoSeconds:seconds,videoResolution:resolution})).unitPrice,(resolution==='720p'?6:12)*seconds/10);
 const base=unit({aiMode:'fixed'});const quote=priceQuote([base,{...base,id:'two',customArtwork:true}],undefined,5);assert.equal(quote.travelTotal,400);assert.equal(quote.bookingLines[0].amount,850);
 assert.equal(createUnit('mirror').videoSeconds,10);assert.equal(generationInfo({...base,experience:'aiVideo',videoSeconds:15}).unitPrice,9);
 assert.match(renderConfig([base],base.id,2),/Flexible sessions/);assert.ok(!renderConfig([base],base.id,1).includes('four-day'));
});
test('High volume and unusual staffing require review without falsifying stored figures',()=>{
 const high=unit({staffing:'b3yond',additionalStaff:20});const quote=priceQuote([high]);assert.ok(quote.total>12000);assert.equal(quote.requiresReview,true);
 const art=priceQuote([unit()],undefined,500);assert.equal(art.requiresReview,false);const custom=priceQuote([unit({customArtwork:true})],undefined,500);assert.equal(custom.requiresReview,true);
 const oldQuote={...priceQuote([unit()]),pricingPolicyVersion:undefined,requiresReview:false,total:19280};oldQuote.units[0].lines.find(line=>line.unit==='photo').quantity=4320;oldQuote.units[0].lines.find(line=>line.unit==='photo').label='AI photo · unlimited during booked hours';
 const historical=renderPrint([unit({aiMode:'unlimited'})],2,{quote:oldQuote,createdAt:'2026-11-01T00:00:00Z'});assert.match(historical,/19,280/);assert.match(historical,/4,320/);assert.match(historical,/Unlimited during booked hours/);assert.ok(!historical.includes('15% off hire'));
});

test('Incomplete schedules show the starting hire while remaining provisional',()=>{
 const empty=createUnit('mirror');
 assert.equal(quoteEstimate([empty]).amount,1800);
 assert.equal(quoteEstimate([empty]).incomplete,true);
 assert.equal(quoteEstimate([createUnit('classic')]).amount,1400);
 const dated=unit({startTime:'',endTime:''});
 assert.equal(quoteEstimate([dated]).amount,1800*1.85+900+1000+400);
 assert.equal(priceQuote([dated]).total,null);
});
