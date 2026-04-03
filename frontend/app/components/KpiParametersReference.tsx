type KpiItem = {
  name: string;
  description: string;
};

const voiceParameters: KpiItem[] = [
  { name: 'Overall Weighted Score', description: 'Combined score based on KPI weightage.' },
  { name: 'Response Score', description: 'Total sum of agent response scores during the practice.' },
  { name: 'Disclaimer Message Score', description: 'Evaluates if the agent provided the disclaimer at the beginning of the call.' },
  { name: 'Opening Message Score', description: 'Gets the response score from the first agent response.' },
  { name: 'Closing Message Score', description: 'Gets the response score from the last agent response.' },
  { name: 'Accuracy Score', description: 'Tracks how often the bot asks the users to repeat themselves. More attempts made = lower score.' },
  { name: 'Compliance Score', description: 'Sum of agent responses tagged as Compliance.' },
  { name: 'Resolution Score', description: 'Sum of agent responses tagged as Resolution.' },
  { name: 'AHT Score', description: 'Rates practice duration based on Average Handle Time (AHT) targets.' },
  { name: 'Total Duration of Dead Air', description: 'Counts the number of seconds of total silence during the call.' },
  { name: 'Rate of Speech', description: "Evaluates the agent's average rate of speech during the call in words per minute." },
  { name: 'Empathy', description: 'Compares the number of configured empathy statements used vs target Empathy count.' },
  { name: 'Probing', description: 'Compares the number of configured probing words used vs target Probing count.' },
  { name: 'Forbidden Words', description: 'Counts the number of configured forbidden words used, to be deducted from the Overall Weighted Score.' },
  { name: 'Idle Time Configuration', description: 'Rates average idle time in between agent responses based on configured targets.' },
];

const chatParameters: KpiItem[] = [
  { name: 'Overall Weighted Score', description: 'Combined score based on KPI weightage.' },
  { name: 'Response Score', description: 'Total sum of agent response scores during the practice.' },
  { name: 'Accuracy Score', description: 'Tracks how often the bot asks the users to repeat themselves. More attempts made = lower score.' },
  { name: 'Compliance Score', description: 'Sum of agent responses tagged as Compliance.' },
  { name: 'Resolution Score', description: 'Sum of agent responses tagged as Resolution.' },
  { name: 'AHT Score', description: 'Rates practice duration based on Average Handle Time (AHT) targets.' },
  { name: 'Typing Accuracy Score', description: 'Counts the number of spelling and punctuation mismatch from the configured responses.' },
  { name: 'Typing Speed Score', description: "Evaluates the agent's average typing speed during the practice, calculated in words per minute." },
  { name: 'Empathy', description: 'Compares the number of configured empathy statements used vs target Empathy count.' },
  { name: 'Probing', description: 'Compares the number of configured probing words used vs target Probing count.' },
  { name: 'Forbidden Words', description: 'Counts the number of configured forbidden words used, to be deducted from the Overall Weighted Score.' },
  { name: 'Idle Time Configuration', description: 'Rates average idle time in between agent responses based on configured targets.' },
];

function KpiCard({ title, items }: { title: string; items: KpiItem[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 text-foreground">
      <div className="mb-4">
        <h4 className="text-lg font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground">Learning Session</p>
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.name} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <p>
              <span className="font-semibold text-foreground">{item.name}</span>
              <span className="text-muted-foreground"> - {item.description}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KpiParametersReference() {
  return (
    <section className="mt-6">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-foreground">KPI Parameters Reference</h3>
        <p className="text-sm text-muted-foreground">Aligned with the platform performance rules and recorded trainee results.</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <KpiCard title="KPI Parameters (Voice)" items={voiceParameters} />
        <KpiCard title="KPI Parameters (Chat)" items={chatParameters} />
      </div>
    </section>
  );
}
