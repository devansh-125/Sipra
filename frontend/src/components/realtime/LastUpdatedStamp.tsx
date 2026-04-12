type LastUpdatedStampProps = {
  lastUpdatedAt: string;
};

export default function LastUpdatedStamp({ lastUpdatedAt }: LastUpdatedStampProps) {
  return <span className="text-xs text-slate-400">Data last updated at {lastUpdatedAt}</span>;
}
