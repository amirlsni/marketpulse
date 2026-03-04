export default async function handler(req, res) {
  const key = process.env.GNEWS_KEY;
  if (!key) {
    return res.status(500).json({ error: "GNEWS_KEY not configured" });
  }

  const q = encodeURIComponent(
    "gold price OR oil price OR bitcoin OR Iran war OR stock market"
  );

  try {
    const r = await fetch(
      `https://gnews.io/api/v4/search?q=${q}&lang=en&max=5&apikey=${key}`
    );

    if (!r.ok) {
      return res.status(r.status).json({ error: `GNews API error: ${r.status}` });
    }

    const data = await r.json();

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=300");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
