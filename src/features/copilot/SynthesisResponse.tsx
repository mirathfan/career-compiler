import { SynthesisEvidence, validateSynthesis } from "../../lib/copilot/workspaceSynthesis";

export function SynthesisResponse({ answer, evidence, mock }: { answer: unknown; evidence: unknown; mock: boolean }) {
  try {
    const units = SynthesisEvidence.array().max(30).parse(evidence);
    const checked = validateSynthesis(answer, units);
    const text = (id: string) => units.find(e => e.id === id)!.variants[0];
    return <section aria-label="Grounded conversational answer" className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
      <p className="text-xs text-slate-500">{mock ? "Offline mock composition" : "AI-composed explanation"} · locally checked statements, not independent verification.</p>
      <p className="text-xs text-slate-500">Reviewed snapshot; later record changes are not reflected here.</p>
      {checked.status === "answered" ? <>
        {checked.answer.map(s => <p key={s.evidenceId}>{s.text}</p>)}
        {checked.uncertainties.length ? <details><summary className="cursor-pointer font-semibold">Uncertainty and evidence limits</summary><ul>{checked.uncertainties.map(id => <li className="mt-2" key={id}>{text(id)}</li>)}</ul></details> : null}
        {checked.nextSteps.length ? <div><h3 className="font-semibold">Suggested next steps</h3><p className="text-xs">Nothing has been created or changed.</p><ul>{checked.nextSteps.map(id => <li className="mt-2" key={id}>{text(id)}</li>)}</ul></div> : null}
      </> : <p role="status">{checked.status === "refused" ? "The provider declined to compose an explanation. Local results remain available." : "There is not enough permitted evidence to answer. Select relevant records or clarify the question."}</p>}
    </section>;
  } catch {
    return <p role="alert">This saved explanation could not be verified. Review fresh records; no other context was substituted.</p>;
  }
}
