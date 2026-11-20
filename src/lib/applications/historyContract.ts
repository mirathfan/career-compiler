import { z } from "zod";
export const HISTORY_PREFIX="history-import:";
export const EvidenceState=z.enum(["CONFIRMED_APPLICATION","POSSIBLE_APPLICATION","UNRESOLVED_RECORD","NOT_AN_APPLICATION"]);
export type HistoryEvidence=z.infer<typeof EvidenceState>;
export const HistoryMarker=z.object({version:z.literal("cc-history-v1"),entryId:z.string(),evidenceState:EvidenceState,requisition:z.string(),sourceId:z.string(),postingUrl:z.string(),eventKey:z.string(),reviewedJobId:z.string()}).strict();
export type HistoryApplicationMarker=z.infer<typeof HistoryMarker>;
export function readHistoryMarker(source:string){if(!source.startsWith(HISTORY_PREFIX))return null;try{const result=HistoryMarker.safeParse(JSON.parse(source.slice(HISTORY_PREFIX.length)));return result.success?result.data:null;}catch{return null;}}
export function isHistoryApplication(source:string){return source.startsWith(HISTORY_PREFIX);}
export const encodeHistoryMarker=(marker:HistoryApplicationMarker)=>HISTORY_PREFIX+JSON.stringify(HistoryMarker.parse(marker));

const Proof=z.object({version:z.literal("cc-history-entry-v1"),id:z.string(),applicationId:z.string(),evidenceState:EvidenceState,normalized:z.object({employer:z.string(),role:z.string(),requisition:z.string(),sourceId:z.string(),postingUrl:z.string()}).passthrough(),choice:z.object({jobId:z.string().optional()}).passthrough()}).passthrough();
export type HistoryProof=z.infer<typeof Proof>;
export async function readHistoryProofs(repo:import("../database/repository").AppRepository){return (await repo.listSafetyRecords("application_history_entry")).flatMap(record=>{const parsed=Proof.safeParse(record.value);return parsed.success&&parsed.data.id===record.id?[parsed.data]:[];});}
