const BASE_URL="https://services.leadconnectorhq.com";
const token=process.env.GHL_API_TOKEN, locationId=process.env.GHL_LOCATION_ID, version="2021-07-28";
const HDRS={Authorization:`Bearer ${token}`,Version:version,Accept:"application/json"};
// The agent proxy occasionally fails DNS transiently — sometimes by throwing, sometimes
// by returning a non-JSON plain-text body. Retry with backoff and only accept parsed JSON.
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function fetchJSON(url,tries=5){
  let lastErr;
  for(let i=0;i<tries;i++){
    try{
      const r=await fetch(url,{headers:HDRS});
      const t=await r.text();
      let d; try{d=t?JSON.parse(t):{};}catch{ throw new Error("non-JSON body: "+t.slice(0,60)); }
      return {ok:r.ok,status:r.status,data:d,text:t};
    }catch(e){lastErr=e; await sleep(300*Math.pow(2,i));}
  }
  throw lastErr;
}
async function ghl(q){const u=new URL(BASE_URL+"/conversations/search");for(const[k,v]of Object.entries(q))if(v!==undefined)u.searchParams.set(k,String(v));
const r=await fetchJSON(u);if(!r.ok)throw new Error(r.status+" "+r.text);return r.data;}
async function msgs(conversationId){const u=new URL(BASE_URL+`/conversations/${conversationId}/messages`);u.searchParams.set("limit","20");
let r;try{r=await fetchJSON(u);}catch{return[];}if(!r.ok)return[];return r.data?.messages?.messages||r.data?.messages||[];}

// NOTE: There is no reliable way to auto-detect Dan's manual takeover from message
// fields — his iPhone texts come through the iMessage gateway as source=api, identical
// to our own sends, and FB/IG tags everything source=app. So we DON'T try. Threads Dan
// is handling either end with his outbound (never flagged) or get added to IGNORE by hand.
const CHANNELS=new Set(["TYPE_SMS","TYPE_CUSTOM_SMS","TYPE_FACEBOOK","TYPE_INSTAGRAM"]);
const CHAN_LABEL={TYPE_SMS:"SMS",TYPE_CUSTOM_SMS:"SMS",TYPE_FACEBOOK:"FB",TYPE_INSTAGRAM:"IG"};
// Contacts intentionally left alone (booked / dead / referred / spam / Dan handling / off-topic).
const IGNORE=new Set([
  "FShRw3H8QJa8xfUUVdz4","e7S3tuZbVNSCaRiZJEF4","M8dXcYIEycUSjrJE3mvl","o2J6JnK1axJnUf6ws8gi",
  "mZAluZPnObXCVhelP15R","INqZxET6q5ehZEx4nwSf","xARXtQia3L7M0k9cZG4G","w7Bnua5UJLmCAnPB85Ws",
  "Y6zd4SpfrR2ACYz4eqat","QUK8VpMnBcbRACOgBdC4","CI5UOY9Joe6mXdgzyErq","2aIpX2zywA2Prua6qPk7",
  "Jrub4h7IcihhCZlfKgOb","W0IqFUQ0S1styZEhLRNJ",
]);
const HOUR=3600e3, DAY=24*HOUR, now=Date.now();
const data=await ghl({locationId,sortBy:"last_message_date",sort:"desc",limit:40});
const fmt=(ms)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Phoenix",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(ms));
const needs=[], cold=[];
for(const c of data.conversations||[]){
  if(IGNORE.has(c.contactId)) continue;                          // intentionally left
  if(!CHANNELS.has(c.lastMessageType)) continue;                 // SMS / FB / IG only
  const body=(c.lastMessageBody||"").trim();

  // Cold lead: automated intro went out, 24h+ passed, lead never replied. Dan's first-24h
  // window is over, so I start reaching out. (Bounded to recent leads, not ancient ones.)
  if(c.lastMessageDirection==="outbound"){
    const age=now-c.lastMessageDate;
    if(age<24*HOUR || age>7*DAY) continue;
    const list=await msgs(c.id);
    if(list.some(m=>m.direction==="inbound")) continue;          // they did reply at some point
    cold.push({name:c.fullName,phone:c.phone,contactId:c.contactId,channel:CHAN_LABEL[c.lastMessageType],when:fmt(c.lastMessageDate),body:body.replace(/\s+/g," ").slice(0,140)});
    continue;
  }

  if(c.lastMessageDirection!=="inbound") continue;               // I already replied
  if(/^Liked /i.test(body)||/^(Loved|Laughed at|Emphasized|Disliked|Reacted|Questioned) /i.test(body)) continue; // reactions
  if(c.lastMessageType==="TYPE_INSTAGRAM"){                      // IG is mostly chatter — only real leads
    const leadish=/\d|quote|floor|epoxy|polish|concrete|garage|shop|sq\s?ft|square|coat|stain|grind|seal|price|estimate|address|filled out your form/i.test(body);
    if(!leadish) continue;
  }
  needs.push({name:c.fullName,phone:c.phone,contactId:c.contactId,conversationId:c.id,channel:CHAN_LABEL[c.lastMessageType],when:fmt(c.lastMessageDate),body:body.replace(/\s+/g," ").slice(0,140)});
}
console.log("AWAITING REPLY: "+needs.length);
for(const n of needs) console.log(`• [${n.channel}] ${n.name} | ${n.phone||"-"} | ${n.contactId} | ${n.when}\n   "${n.body}"`);
console.log("\nCOLD (no reply to intro, 24h+ — my move now): "+cold.length);
for(const n of cold) console.log(`• [${n.channel}] ${n.name} | ${n.phone||"-"} | ${n.contactId} | intro ${n.when}\n   "${n.body}"`);
