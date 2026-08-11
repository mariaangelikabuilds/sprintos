export type Brief = {
  brand_name: string;
  product: string;
  location?: string;
  target_market: string;
  competitors?: string;
};

export type Finding = { competitor: string; observed: string; hook: string; source: string };

export type Research = {
  product_summary: string;
  unique_selling_points: string[];
  competitor_findings: Finding[];
  audience_pain_points: string[];
  audience_desires: string[];
  research_gaps: string[];
};

export type Angle = { id: number; angle: string; hook: string; maps_to: string; rationale: string };

export type Critique = {
  scores: { id: number; score: number; strongest: string; weakest: string }[];
  selected_ids: number[];
  selection_reasoning: string;
};

export type Ad = {
  angle_id: number;
  primary_text: string;
  headline: string;
  description: string;
  hook_variants: string[];
  cta: string;
};

export type Package = { research: Research; angles: Angle[]; critique: Critique; ads: Ad[] };

export type Decision = { angle_id: number; verdict: 'approved' | 'killed'; note: string };

export type SprintSummary = {
  id: string;
  brief: Brief;
  status: 'running' | 'failed' | 'review' | 'reviewed';
  created_at: string;
  delivered_at: string | null;
  reviewed_at: string | null;
};

export type SprintDetail = SprintSummary & {
  package: Package | null;
  decisions: Decision[] | null;
};
