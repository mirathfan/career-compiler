import { useEffect, useRef, useState } from "react";
import type { BatchReview } from "../lib/job-automation/batchReview";
import { JobMatchApprovalDialog } from "./JobMatchApprovalDialog";

export function useJobMatchApproval() {
  const [review, setReview] = useState<BatchReview | null>(null);
  const pending = useRef<((approved: boolean) => void) | null>(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  function settle(approved: boolean) { const resolve = pending.current; pending.current = null; setReview(null); resolve?.(approved); }
  function request(review: BatchReview) {
    if (pending.current) return Promise.reject(new Error("An analysis review is already open."));
    setReview(review);
    return new Promise<boolean>(resolve => { pending.current = resolve; });
  }
  return { request, dialog: review ? <JobMatchApprovalDialog review={review} onDecision={settle} /> : null };
}
