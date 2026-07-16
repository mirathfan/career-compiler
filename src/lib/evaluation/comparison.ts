import type { EvaluationSummary, GenerationComparisonResult, TailoredResume } from "../../types/domain";
import { semanticResumeDiff } from "../resume/diff";

export function compareGenerationResults(
  left: EvaluationSummary,
  leftResume: TailoredResume,
  right: EvaluationSummary,
  rightResume: TailoredResume,
): GenerationComparisonResult {
  const leftItems = new Set(left.selectedCareerItemIds);
  const rightItems = new Set(right.selectedCareerItemIds);
  const leftFacts = new Set(left.selectedFactIds);
  const rightFacts = new Set(right.selectedFactIds);
  return {
    left,
    right,
    semanticDifferences: semanticResumeDiff(leftResume, rightResume),
    careerItemDifferences: [...new Set([
      ...[...leftItems].filter((id) => !rightItems.has(id)).map((id) => `Only left: ${id}`),
      ...[...rightItems].filter((id) => !leftItems.has(id)).map((id) => `Only right: ${id}`),
    ])],
    factDifferences: [
      ...[...leftFacts].filter((id) => !rightFacts.has(id)).map((id) => `Only left: ${id}`),
      ...[...rightFacts].filter((id) => !leftFacts.has(id)).map((id) => `Only right: ${id}`),
    ],
  };
}
