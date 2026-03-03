// api/translate.js (Vercel Serverless Function - ESModule)

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const { texts, lang, context } = req.body || {};

        if (!Array.isArray(texts) || !texts.length) {
            return res.status(400).json({ error: "Missing texts[]" });
        }
        if (typeof lang !== "string" || !lang.trim()) {
            return res.status(400).json({ error: "Missing lang" });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "OPENAI_API_KEY not set on server" });
        }

        const payloadStr = JSON.stringify(texts.map((t, i) => ({ i, t })));

        const sys =
            `Translate each text to ${lang}.` +
            (context ? ` Context: ${context}.` : "") +
            ` Keep same tone, length, style. Preserve HTML entities, numbers, brand names. ` +
            `Reply ONLY with JSON array: [{"i":<index>,"t":"<translated>"}]. No explanations. ` +
            `Return exactly ${texts.length} items.`;

        const body = {
            model: "gpt-4o-mini",
            temperature: 0.15,
            messages: [
                { role: "system", content: sys },
                { role: "user", content: payloadStr }
            ]
        };

        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        const rawText = await resp.text();

        if (!resp.ok) {
            let msg = `HTTP ${resp.status}`;
            try {
                const j = JSON.parse(rawText);
                msg = j?.error?.message || msg;
            } catch { }
            return res.status(resp.status).json({ error: msg });
        }

        const data = JSON.parse(rawText);
        const content = data?.choices?.[0]?.message?.content || "";
        return res.status(200).json({ content });
    } catch (e) {
        return res.status(500).json({ error: e?.message || "Server error" });
    }
}