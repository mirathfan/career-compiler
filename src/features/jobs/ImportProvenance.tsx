export function ImportProvenance({value}:{value:unknown}) {
 if(!value||typeof value!=="object"||!("version" in value)||value.version!=="cc-job-import-v1")return null;
 const record=value as Record<string,unknown>;
 const text=(key:string)=>typeof record[key]==="string"?record[key] as string:"Not recorded";
 const corrections=Array.isArray(record.corrections)?record.corrections:[];
 return <details className="import-provenance"><summary>Import provenance · reviewed local content</summary><p>{text("retrieval")==="explicit_synthetic_fixture"?`Explicit synthetic fixture: ${text("fixtureId")}. No live extraction.`:"Manually pasted source text. No URL retrieval."}</p><p>Imported {text("importedAt")} · Reviewed {text("reviewedAt")}</p><details><summary>Original complete description</summary><pre className="import-source">{text("originalText")}</pre></details><details><summary>Reviewed corrections ({corrections.length})</summary>{corrections.map((entry,index)=>{if(!entry||typeof entry!=="object")return null;const row=entry as Record<string,unknown>;return <p key={index}><strong>{String(row.field??"Field")}</strong>: {String(row.parsed??"Not provided")} → {String(row.corrected??"Unknown")} · {String(row.correctedAt??"")}</p>;})}</details><details><summary>Content revision</summary><p className="fingerprint-label">{text("fingerprint")}</p></details></details>;
}
