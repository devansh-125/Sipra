export type Disruption = {
  id: string;
  type: string;
  severity: number;
  status: 'active' | 'resolved';
  title?: string;
};
