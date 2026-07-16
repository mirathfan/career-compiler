import type {
  JobAnalysis,
  RoleProfile,
  RoleProfileId,
  TailoringControls,
} from "../../types/domain";

export const ROLE_PROFILES: Record<RoleProfileId, RoleProfile> = {
  "full-stack-software-engineer": {
    id: "full-stack-software-engineer",
    name: "Full-Stack Software Engineer",
    sectionOrder: ["projects", "experience", "education", "skills"],
    summaryMode: "never",
    preferredProjectCount: 3,
    bulletsPerItem: 2,
    skillCategoryOrder: ["Languages", "Frontend and mobile", "Backend", "Infrastructure and tools", "AI and ML"],
    roleTags: ["full-stack engineer", "software engineer"],
    emphasisTags: ["end-to-end", "React", "TypeScript", "backend", "database", "testing"],
    deEmphasisTags: ["compression", "GPU benchmarking"],
    preferredCareerItemIds: ["project-forge", "project-client-bookstore", "project-aura"],
    optionalCareerItemIds: ["project-gpu-lab"],
  },
  "ai-engineer": {
    id: "ai-engineer",
    name: "AI Engineer",
    sectionOrder: ["summary", "projects", "experience", "education", "skills"],
    summaryMode: "auto",
    preferredProjectCount: 3,
    bulletsPerItem: 2,
    skillCategoryOrder: ["AI and ML", "Languages", "Backend", "Infrastructure and tools", "Frontend and mobile"],
    roleTags: ["AI engineer", "ML systems"],
    emphasisTags: ["OpenAI", "LangGraph", "embeddings", "evaluation", "PyTorch", "ONNX"],
    deEmphasisTags: ["storefront", "checkout"],
    preferredCareerItemIds: ["project-aura", "project-gpu-lab", "project-comma-compression"],
    optionalCareerItemIds: ["project-forge"],
  },
  "forward-deployed-engineer": {
    id: "forward-deployed-engineer",
    name: "Forward Deployed Engineer",
    sectionOrder: ["summary", "projects", "experience", "education", "skills"],
    summaryMode: "auto",
    preferredProjectCount: 3,
    bulletsPerItem: 2,
    skillCategoryOrder: ["Languages", "Backend", "Frontend and mobile", "AI and ML", "Infrastructure and tools"],
    roleTags: ["forward deployed engineer", "client-facing engineer", "product engineer"],
    emphasisTags: ["client", "requirements", "end-to-end", "deployment", "ownership", "user-facing"],
    deEmphasisTags: ["benchmark-only"],
    preferredCareerItemIds: ["project-client-bookstore", "project-aura", "project-forge"],
    optionalCareerItemIds: ["project-gpu-lab"],
  },
  "mobile-engineer": {
    id: "mobile-engineer",
    name: "Mobile Engineer",
    sectionOrder: ["projects", "experience", "education", "skills"],
    summaryMode: "never",
    preferredProjectCount: 2,
    bulletsPerItem: 3,
    skillCategoryOrder: ["Frontend and mobile", "Languages", "Backend", "Infrastructure and tools", "AI and ML"],
    roleTags: ["mobile engineer", "product engineer"],
    emphasisTags: ["React Native", "Expo", "iOS", "offline", "TestFlight", "mobile"],
    deEmphasisTags: ["compression", "GPU"],
    preferredCareerItemIds: ["project-aura", "project-forge"],
    optionalCareerItemIds: ["project-client-bookstore"],
  },
  "backend-engineer": {
    id: "backend-engineer",
    name: "Backend Engineer",
    sectionOrder: ["projects", "experience", "education", "skills"],
    summaryMode: "never",
    preferredProjectCount: 3,
    bulletsPerItem: 2,
    skillCategoryOrder: ["Backend", "Languages", "Infrastructure and tools", "AI and ML", "Frontend and mobile"],
    roleTags: ["backend engineer", "software engineer"],
    emphasisTags: ["FastAPI", "PostgreSQL", "authentication", "idempotency", "RLS", "Cloud Functions"],
    deEmphasisTags: ["visual design"],
    preferredCareerItemIds: ["project-forge", "project-client-bookstore", "project-aura"],
    optionalCareerItemIds: ["project-gpu-lab"],
  },
  "general-software-engineer": {
    id: "general-software-engineer",
    name: "General Software Engineer",
    sectionOrder: ["projects", "experience", "education", "skills"],
    summaryMode: "never",
    preferredProjectCount: 3,
    bulletsPerItem: 2,
    skillCategoryOrder: ["Languages", "Backend", "Frontend and mobile", "Infrastructure and tools", "AI and ML"],
    roleTags: ["software engineer"],
    emphasisTags: ["testing", "delivery", "systems", "ownership"],
    deEmphasisTags: [],
    preferredCareerItemIds: ["project-forge", "project-aura", "project-client-bookstore"],
    optionalCareerItemIds: ["project-gpu-lab", "project-comma-compression"],
  },
};

export function detectRoleProfile(analysis: JobAnalysis): RoleProfileId {
  const text = [...analysis.roleCategories, analysis.inferredRoleTitle, ...analysis.domainKeywords]
    .join(" ")
    .toLowerCase();
  if (text.includes("forward deployed") || text.includes("client-facing")) return "forward-deployed-engineer";
  if (text.includes("mobile") || text.includes("ios") || text.includes("react native")) return "mobile-engineer";
  if (text.includes("backend")) return "backend-engineer";
  if (text.includes("ai engineer") || text.includes("machine learning") || text.includes("ml systems")) return "ai-engineer";
  if (text.includes("full-stack") || text.includes("full stack")) return "full-stack-software-engineer";
  return "general-software-engineer";
}

export function controlsForRoleProfile(
  profileId: RoleProfileId,
  current: TailoringControls,
): TailoringControls {
  const profile = ROLE_PROFILES[profileId];
  return {
    ...current,
    roleProfileId: profileId,
    summaryMode: profile.summaryMode,
    projectCount: profile.preferredProjectCount,
    bulletsPerProject: profile.bulletsPerItem,
    targetRoleCategory: profile.roleTags[0],
    emphasisTags: profile.emphasisTags,
    excludedTags: profile.deEmphasisTags,
  };
}
