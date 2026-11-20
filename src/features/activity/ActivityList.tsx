import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { displayRecordedDate, type WorkspaceEvent } from "../../lib/dashboard/workspace";

export function ActivityList({ events }: { events: WorkspaceEvent[] }) {
  if (!events.length) return <p className="workspace-empty">No dated activity yet. Saved application changes, resume versions, and reviewed career imports will appear here.</p>;
  return <ol className="workspace-record-list">{events.map(event => <li key={event.id}>
    <div className="activity-record">
      <span className="activity-dot" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {event.to ? <Link className="workspace-record-title" to={event.to}>{event.title}<ArrowUpRight size={14} aria-hidden="true" /></Link> : <p className="font-semibold">{event.title}</p>}
        <p className="workspace-record-detail">{event.detail}</p>
        <time className="workspace-record-date" dateTime={event.at}>{displayRecordedDate(event.at)}</time>
      </div>
    </div>
  </li>)}</ol>;
}
