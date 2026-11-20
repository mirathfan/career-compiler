import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState } from "../../components/States";
import { useRepository } from "../../lib/database/repositoryContext";
import { loadWorkspaceActivity } from "../../lib/dashboard/workspace";
import { ActivityList } from "./ActivityList";

export function ActivityPage() {
  const repository = useRepository();
  const [limit, setLimit] = useState(40);
  const activity = useQuery({ queryKey: ["workspace-activity"], queryFn: () => loadWorkspaceActivity(repository) });
  if (activity.isLoading) return <LoadingState label="Loading recorded activity…" />;
  if (activity.isError) throw activity.error;
  const events = activity.data ?? [];
  return <div>
    <PageHeader eyebrow="Workspace history" title="Activity" description="Recorded application status changes, resume versions, and reviewed career imports."
      actions={<Link className="button" to="/applications#history-import">Application history</Link>} />
    <div className="page-body space-y-5">
      <section className="panel p-5" aria-label="Recorded activity"><ActivityList events={events.slice(0, limit)} />
        {events.length > limit ? <button className="button mt-4" onClick={() => setLimit(value => value + 40)}>Show more activity</button> : null}
      </section>
      <p className="workspace-record-detail">This view shows dated records from these workspaces. Job-import audits and Copilot conversations remain in their original screens.</p>
      <div className="flex flex-wrap gap-3"><Link className="button" to="/jobs">Jobs & imports</Link><Link className="button" to="/copilot">Copilot conversations</Link><Link className="button" to="/profile?section=import">Career imports</Link></div>
    </div>
  </div>;
}
