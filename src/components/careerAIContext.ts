import { createContext, useContext } from "react";
import type { CopilotContextRequest, WorkspaceSelection } from "../lib/copilot/workspaceContext";
interface WorkspaceAI {
  open: boolean;
  visited: boolean;
  request?: CopilotContextRequest;
  selection?: WorkspaceSelection;
  openPanel: (selection?: WorkspaceSelection) => void;
  closePanel: () => void;
  register: (selection: WorkspaceSelection) => () => void;
  returnFocus: () => void;
}
export const CareerAIContext = createContext<WorkspaceAI | null>(null);
export const useCareerAI = () => useContext(CareerAIContext);
