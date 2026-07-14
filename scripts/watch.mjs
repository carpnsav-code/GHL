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

// Dan's rule: only engage contacts that are actual leads — i.e. they have an opportunity
// in a *pipeline stage* (any column). A new lead lands in the New Lead column first, then
// moves through the pipeline. Someone with NO pipeline presence is just sending a direct
// message (marketing/Skool inquiry, spam, random DM) — never message them.
const PIPE="5qKdJCOxNf6p2MUEaHpI";
async function pipelineContactIds(){
  const ids=new Set(); let page=1, ok=false;
  while(true){
    const u=new URL(BASE_URL+"/opportunities/search");
    for(const[k,v]of Object.entries({location_id:locationId,pipeline_id:PIPE,limit:100,page}))u.searchParams.set(k,String(v));
    let r;try{r=await fetchJSON(u);}catch{break;}
    if(!r.ok) break;
    ok=true;
    const b=r.data?.opportunities||[];
    for(const o of b) ids.add(o.contact?.id||o.contactId);
    if(b.length<100) break; page++; if(page>25) break;
  }
  // ok flags a clean fetch. If the fetch failed outright (ok=false) we return null so the
  // caller can FAIL SAFE — never silently hide every lead behind an empty gate.
  return ok ? ids : null;
}

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
  "Jrub4h7IcihhCZlfKgOb","W0IqFUQ0S1styZEhLRNJ","1MEL1qK3SpLspCzZdoaD","coCI0Mvst3u4m06jmeqS",
  "Bha9zjNFI7iBcXSNKuzd", // Brad Greathouse — marketing/ads client, not a floor lead
  "BvxT3Hw5LLL3LN8D7Kul", // ItzZues — Skool marketing-course student, not a floor lead
  "sKPxsMcQHCPyjx9ALqDW", // Adrian Dolghier — Dan took over the thread manually (7/9)
  "V66738DUJeA6bDynNHLx", // Epoxy It / Jesse Hodges — industry peer, Dan handling personally (7/9)
  "QPtsvk9wySmAW7SObWiF", // Kevin Shyn — moved to Dead (7/10)
  "RQz3P1DnNnj0Op2e8IWq", // Gina Ribaudo — moved to Dead (7/10)
  "vxzl4ScSEBotBjWiLrkJ", // Douglas McCowan — Dan handling; not a job we're taking (7/10)
  "caBT0rA2rfDInQ4v4s42", // Abel — declined (went w/ Superior Garage Floors), Dead (7/11)
  "hSgmDOCszXXjExJrCOyD", // Sheila Lewis — too far (Florence), cancelled + Dead (7/11)
  "Zk5bpDVxbgqRgbyrL3o4", // Esteban Ortiz — 2-car garage, routed to Joseph, Dead (7/12)
  "fKKPsWAQtt4mKZHabzj8", // Jesus Aguirre — 2-car garage, routed to Joseph, Dead (7/12)
  "MPSeg3QNU0ceUIHEmFrJ", // Michael Myers — 3-bay north Phx, routed to Joseph (drive conflict), Dead (7/13)
  "gLu7fpwPCCRhLuakwiOj", // Dr. Jess Flores — booked Tue 7/14 9am (Casa Grande, 4-car garage)
  "f0ME5eihzrHw7BKE9ixf", // Jared Jasinski — Dan handling manually (went to look, ETA texts), back off (7/14)
]);
const HOUR=3600e3, DAY=24*HOUR, now=Date.now();
const [data, pipelineContacts] = await Promise.all([
  ghl({locationId,sortBy:"last_message_date",sort:"desc",limit:40}),
  pipelineContactIds(),
]);
// Fail safe: if the pipeline fetch came back null (API error), don't gate on it — we'd
// rather surface a little noise than silently hide every real lead behind an empty set.
const gateOn = pipelineContacts !== null;
if(!gateOn) console.log("!! WARNING: pipeline fetch failed — pipeline gate DISABLED this run (content filters still apply)");
const fmt=(ms)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Phoenix",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(ms));
const needs=[], cold=[];
for(const c of data.conversations||[]){
  if(IGNORE.has(c.contactId)) continue;                          // intentionally left
  if(gateOn && !pipelineContacts.has(c.contactId)) continue;     // only leads that have a pipeline column (not plain DMs)
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
  if(!/[a-z0-9]/i.test(body)) continue;                          // emoji/punctuation-only (e.g. "😂") — not an inquiry
  if(/filled out your form|would like to know more about your business/i.test(body)) continue; // raw form-fill — the auto-intro handles first contact; wait for their real reply
  if(c.lastMessageType==="TYPE_INSTAGRAM"){                      // IG is mostly chatter — only real leads
    const leadish=/\d|quote|floor|epoxy|polish|concrete|garage|shop|sq\s?ft|square|coat|stain|grind|seal|price|estimate|address/i.test(body);
    if(!leadish) continue;
  }
  needs.push({name:c.fullName,phone:c.phone,contactId:c.contactId,conversationId:c.id,channel:CHAN_LABEL[c.lastMessageType],when:fmt(c.lastMessageDate),body:body.replace(/\s+/g," ").slice(0,140)});
}
console.log("AWAITING REPLY: "+needs.length);
for(const n of needs) console.log(`• [${n.channel}] ${n.name} | ${n.phone||"-"} | ${n.contactId} | ${n.when}\n   "${n.body}"`);
console.log("\nCOLD (no reply to intro, 24h+ — my move now): "+cold.length);
for(const n of cold) console.log(`• [${n.channel}] ${n.name} | ${n.phone||"-"} | ${n.contactId} | intro ${n.when}\n   "${n.body}"`);
