// api/translate.js

async function readJsonBody(req) {
    // Em alguns ambientes (Next API Routes), req.body já vem pronto
    if (req.body && typeof req.body === "object") return req.body;

    // Em Vercel (Serverless function pura), precisa ler o stream
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function unwrapCodeFences(s) {
    if (!s) return s;
    const t = String(s).trim();

    // Remove ```html ... ``` ou ``` ... ```
    if (t.startsWith("```")) {
        // tira primeira linha ```xxx
        const firstNewline = t.indexOf("\n");
        const withoutFirst = firstNewline >= 0 ? t.slice(firstNewline + 1) : "";
        // tira último ```
        const lastFence = withoutFirst.lastIndexOf("```");
        const withoutLast = lastFence >= 0 ? withoutFirst.slice(0, lastFence) : withoutFirst;
        return withoutLast.trim();
    }

    return t;
}

export default async function handler(req, res) {
    try {
        // (Opcional, mas ajuda em debug/local)
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

        if (req.method === "OPTIONS") return res.status(200).end();
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const body = await readJsonBody(req);
        if (!body) {
            return res.status(400).json({ error: "Invalid JSON body" });
        }

        const { html, targetLang } = body || {};
        if (!html || !targetLang) {
            return res.status(400).json({
                error: "Missing html or targetLang",
            });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: "Missing OPENAI_API_KEY env var",
            });
        }

        const systemPrompt = `
Você é um tradutor profissional.
Tarefa: traduzir o conteúdo humano do HTML para o idioma de destino.

REGRAS OBRIGATÓRIAS:
- Preserve 100% a estrutura do HTML (tags, ordem, indentação e atributos).
- NÃO traduza: nomes de tags, classes, ids, JS, CSS, URLs, caminhos, nomes de arquivo.
- Traduza APENAS textos visíveis e atributos: title, alt, aria-label.
- NÃO altere placeholders: {{...}}, %%...%%, {{$...}}, \${...}
- Retorne SOMENTE o HTML final traduzido.
`.trim();

        const userPrompt = `
Idioma de destino: ${targetLang}

HTML:
${html}
`.trim();

        // Timeout para não ficar pendurado
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);

        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4.1-mini",
                temperature: 0.2,
                input: [
                    {
                        role: "system",
                        content: [{ type: "input_text", text: systemPrompt }],
                    },
                    {
                        role: "user",
                        content: [{ type: "input_text", text: userPrompt }],
                    },
                ],
            }),
        }).finally(() => clearTimeout(timeout));

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return res.status(response.status).json({
                error: data?.error?.message || "OpenAI API error",
                raw: data,
            });
        }

        // 🔥 EXTRAÇÃO CORRETA DO TEXTO
        let translatedHTML = "";

        if (typeof data.output_text === "string" && data.output_text.trim()) {
            translatedHTML = data.output_text.trim();
        } else if (Array.isArray(data.output)) {
            for (const block of data.output) {
                if (!block?.content) continue;
                for (const part of block.content) {
                    if (part?.type === "output_text" && part.text) {
                        translatedHTML += part.text;
                    }
                }
            }
            translatedHTML = translatedHTML.trim();
        }

        translatedHTML = unwrapCodeFences(translatedHTML);

        if (!translatedHTML) {
            return res.status(500).json({
                error: "Translation returned empty output",
                raw: data,
            });
        }

        return res.status(200).json({
            html: translatedHTML,
        });
    } catch (err) {
        console.error("TRANSLATE ERROR:", err);
        const isAbort = err?.name === "AbortError";
        return res.status(500).json({
            error: isAbort ? "OpenAI request timeout" : err?.message || "Internal server error",
        });
    }
}
