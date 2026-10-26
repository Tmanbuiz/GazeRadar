import type {Home, Job} from './matching.ts';

export const DISCOVERY_HISTORY_LIMIT = 200;
export const opportunityStates = ['new', 'saved', 'applied', 'dismissed'] as const;
export type OpportunityState = typeof opportunityStates[number];

// Older duplicates may already disagree. Preserve a meaningful choice rather than
// letting a newly discovered source reset it. Explicit changes update every copy.
const choiceOrder = "CASE choice.state WHEN 'applied' THEN 0 WHEN 'saved' THEN 1 ELSE 2 END";

export function storeOpportunity(
 db:D1Database, source:{id:string;owner:string;category:string},
 listing:Job|Home, id:string, fingerprint:string, now:number,
):D1PreparedStatement {
 return db.prepare(`INSERT INTO opportunities
  (id,owner,watch_id,category,url,name,content,fingerprint,available,state,created,updated)
  VALUES (?,?,?,?,?,?,?,?,1,COALESCE((
   SELECT choice.state FROM opportunities choice
   WHERE choice.owner=? AND choice.url=? AND choice.state IN ('saved','applied','dismissed')
   ORDER BY ${choiceOrder} LIMIT 1
  ),'new'),?,?)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,content=excluded.content,
   fingerprint=excluded.fingerprint,available=1,state=excluded.state,updated=excluded.updated`)
  .bind(id,source.owner,source.id,source.category,listing.url,listing.title,
   JSON.stringify(listing),fingerprint,source.owner,listing.url,now,now);
}

export function trimOpportunityHistory(db:D1Database, owner:string, watchId:string):D1PreparedStatement {
 // Admit current discoveries first, then retain the most recent automatic history.
 // Explicit user choices do not count against this limit, including dismissals.
 return db.prepare(`DELETE FROM opportunities WHERE owner=? AND watch_id=? AND state='new'
  AND id NOT IN (SELECT id FROM opportunities WHERE owner=? AND watch_id=? AND state='new'
   ORDER BY available DESC,updated DESC,id DESC LIMIT ?)`)
  .bind(owner,watchId,owner,watchId,DISCOVERY_HISTORY_LIMIT);
}

export type OpportunityRow = {
 id:string;url:string;name:string;content:string;state:OpportunityState;available:number;
 source_name:string;updated:number;[key:string]:unknown;
};

export async function listOpportunityRows(db:D1Database, owner:string, kind:string):Promise<OpportunityRow[]> {
 const rows=await db.prepare(`SELECT o.*,w.name AS source_name,
  COALESCE((SELECT choice.state FROM opportunities choice
   WHERE choice.owner=o.owner AND choice.url=o.url AND choice.state IN ('saved','applied','dismissed')
   ORDER BY ${choiceOrder} LIMIT 1),'new') AS chosen_state
  FROM opportunities o JOIN watches w ON w.id=o.watch_id AND w.owner=o.owner
  WHERE o.owner=? AND o.category=? ORDER BY o.updated DESC LIMIT 500`)
  .bind(owner,kind).all<OpportunityRow & {chosen_state:OpportunityState}>();
 return rows.results.map(({chosen_state,...row})=>({...row,state:chosen_state}));
}

export async function updateOpportunityState(db:D1Database, owner:string, id:string, state:OpportunityState) {
 if(!opportunityStates.includes(state))throw new Error('Choose a valid saved-item status.');
 await db.prepare(`UPDATE opportunities SET state=? WHERE owner=?
  AND url=(SELECT url FROM opportunities WHERE id=? AND owner=?)`)
  .bind(state,owner,id,owner).run();
}
