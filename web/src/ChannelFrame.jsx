// The channel is a skin: where the person asked. The identity chain under it does not change.
export default function ChannelFrame({ channel, prompt, person }) {
  if (!channel) return null;
  return (
    <section className="channel" aria-label={`Asked in ${channel.name}`}>
      <p className="channel-name">{channel.name}</p>
      {prompt && <p className="bubble"><span className="who">{person || "Person"}</span>{prompt}</p>}
      <p className="channel-how">{channel.how}</p>
      <p className="channel-id"><strong>Identity consideration:</strong> {channel.identity}</p>
    </section>
  );
}
