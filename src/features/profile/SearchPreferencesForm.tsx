import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useRepository } from "../../lib/database/repositoryContext";
import { parseCsv } from "../../lib/utils";
import { InlineError, LoadingState } from "../../components/States";
import type { JobSearchPreferences } from "../../types/domain";

function PreferenceFields({ preferences }: { preferences: JobSearchPreferences }) {
  const repository = useRepository();
  const client = useQueryClient();
  const [roles, setRoles] = useState(preferences.targetRoleTitles.join(", "));
  const [locations, setLocations] = useState(preferences.preferredLocations.join(", "));
  const [remote, setRemote] = useState(preferences.remotePreference);
  const [salary, setSalary] = useState(preferences.salaryMinimum?.toString() ?? "");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: async () => repository.transaction(async (repo) => {
      const targetRoles = parseCsv(roles);
      if (!targetRoles.length) throw new Error("Add at least one target role.");
      const salaryMinimum = salary.trim() ? Number(salary) : null;
      if (salaryMinimum !== null && (!Number.isFinite(salaryMinimum) || salaryMinimum < 0)) throw new Error("Enter a valid minimum salary.");
      await repo.saveJobSearchPreferences({ targetRoleTitles: targetRoles, preferredLocations: parseCsv(locations), remotePreference: remote, salaryMinimum });
      await repo.saveCandidatePreferences({ targetRoles, preferredLocations: parseCsv(locations) });
    }),
    onSuccess: () => { setSaved(true); client.invalidateQueries(); },
  });
  return <form className="preference-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    <div><h3>What are you looking for?</h3><p className="muted-copy">Start with a few preferences. You can refine them as you explore.</p></div>
    <label>Target roles <input className="field" placeholder="Frontend Engineer, Software Engineer" value={roles} onChange={(event) => { setRoles(event.target.value); setSaved(false); }} required /><span className="field-hint">Separate multiple roles with commas.</span></label>
    <div className="form-pair"><label>Locations <input className="field" placeholder="Chicago, Austin" value={locations} onChange={(event) => { setLocations(event.target.value); setSaved(false); }} /></label>
      <label>Work preference <select className="field" value={remote} onChange={(event) => { setRemote(event.target.value as typeof remote); setSaved(false); }}><option value="any">Any work arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="on_site">On-site</option></select></label></div>
    <label>Minimum salary <span className="field-hint">Optional · {preferences.salaryCurrency} per year</span><input className="field" type="number" min={0} value={salary} onChange={(event) => { setSalary(event.target.value); setSaved(false); }} placeholder="No minimum" /></label>
    {save.error ? <InlineError message={save.error.message} /> : null}
    <div className="action-row"><button className="button button-primary" disabled={save.isPending} type="submit"><Save size={16} aria-hidden="true" />{save.isPending ? "Saving…" : "Save preferences"}</button>{saved ? <><span role="status" className="success-copy">Preferences saved</span><Link className="button" to="/jobs">Explore jobs <ArrowRight size={15} aria-hidden="true" /></Link></> : null}</div>
    <p className="field-hint">Saving preferences doesn’t start a search or a paid AI request.</p>
  </form>;
}

export function SearchPreferencesForm() {
  const repository = useRepository();
  const preferences = useQuery({ queryKey: ["job-search-preferences"], queryFn: () => repository.getJobSearchPreferences() });
  if (preferences.isLoading) return <LoadingState label="Loading your preferences…" />;
  if (preferences.isError) throw preferences.error;
  return preferences.data ? <PreferenceFields preferences={preferences.data} /> : null;
}
