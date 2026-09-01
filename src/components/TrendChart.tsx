import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Telemetry } from "../types";

export default function TrendChart({ data }: { data: Telemetry[] }) {
  const points = data.map((x) => ({
    time: new Date(x.timestamp).toLocaleTimeString(),
    rpm: Math.round(x.rpm),
    cht: Math.round(x.cht),
    egt: Math.round(x.egt)
  }));

  return (
    <div className="trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <XAxis dataKey="time" hide />
          <YAxis yAxisId="left" domain={["auto", "auto"]} />
          <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} />
          <Tooltip />
          <Line yAxisId="left" type="monotone" dataKey="rpm" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="cht" dot={false} strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="egt" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
