/** Privacy-minimal decoder for the administrator's synthetic timeline. */
const codes=['custody_incidents','outbox_dead_letters','result_email_failures'] as const;
const transitions=['opened','acknowledged','resolved','reopened'] as const;
export type Phase5HistoryEvent={
 code:(typeof codes)[number];
 eventType:(typeof transitions)[number];
 count:number;at:string
};
export function parsePhase5History(rows:ReadonlyArray<Record<string,unknown>>):Phase5HistoryEvent[]{
 return rows.filter(row=>
    codes.some(code=>code===row.code)&&
    transitions.some(type=>type===row.event_type)&&
    typeof row.observed_count==='number'&&
    Number.isSafeInteger(row.observed_count)&&row.observed_count>=0&&
    (row.event_type==='resolved'?row.observed_count===0:row.observed_count>0)&&
    typeof row.recorded_at==='string'&&
    row.recorded_at.length<=40&&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(row.recorded_at)&&
    Number.isFinite(Date.parse(row.recorded_at)))
  .slice(0,30).map(row=>({
    code:row.code as Phase5HistoryEvent['code'],
    eventType:row.event_type as Phase5HistoryEvent['eventType'],
    count:row.observed_count as number,
    at:row.recorded_at as string
  }));
}
