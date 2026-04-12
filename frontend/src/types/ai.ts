export type AiInsight = {
  delay_probability: number;
  predicted_delay_min: number;
  top_factors: Array<{ factor: string; value: number }>;
  model_version: string;
  confidence?: number;
};
