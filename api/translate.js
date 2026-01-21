// api/translate.js
export default async function handler(req, res) {
    try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY env var" });

        const body = req.body || {};
        const targetLang = (body.targetLang || "").toString().trim();

        if (!targetLang) return res.status(400).json({ error: "Missing targetLang" });

        // ✅ MODO NOVO (RECOMENDADO): traduz apenas lista de textos (rápido)
        if (Array.isArray(body.texts)) {
            const texts = body.texts.map((t) => (t == null ? "" : String(t)));

            if (!texts.length) return res.status(400).json({ error: "Missing texts" });

            // Limite de segurança (evita payload gigante)
            if (texts.length > 400) {
                return res.status(400).json({ error: "Too many texts (max 400). Use batching." });
            }

            const systemPrompt = `
Você é um tradutor profissional.
Objetivo: traduzir uma LISTA de textos curtos para o idioma de destino.

REGRAS OBRIGATÓRIAS:
- Traduza APENAS o conteúdo humano.
- NÃO altere placeholders/variáveis: {{...}}, %%...%%, {{$...}}, \${...}
- NÃO adicione explicações, markdown ou comentários.
- Retorne SOMENTE um JSON válido no formato: ["...", "...", ...] com o MESMO tamanho da lista.
- Se um item for número/código curto e não fizer sentido traduzir, retorne exatamente igual.
`.trim();

            const userPrompt = `
Idioma de destino: ${targetLang}

LISTA (JSON):
${JSON.stringify(texts)}
`.trim();

            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 25000);

            let data;
            try {
                const r = await fetch("https://api.openai.com/v1/responses", {
                    method: "POST",
                    signal: ctrl.signal,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4.1-mini",
                        temperature: 0.2,
                        input: [
                            { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
                            { role: "user", content: [{ type: "input_text", text: userPrompt }] },
                        ],
                    }),
                });

                data = await r.json();

                if (!r.ok) {
                    return res.status(r.status).json({
                        error: data?.error?.message || "OpenAI API error",
                        raw: data,
                    });
                }
            } finally {
                clearTimeout(timeout);
            }

            // Extrai output_text
            let out = "";
            if (typeof data?.output_text === "string" && data.output_text.trim()) {
                out = data.output_text.trim();
            } else if (Array.isArray(data?.output)) {
                for (const block of data.output) {
                    if (!block?.content) continue;
                    for (const part of block.content) {
                        if (part?.type === "output_text" && part?.text) out += part.text;
                    }
                }
                out = out.trim();
            }

            if (!out) {
                return res.status(500).json({ error: "Empty output from OpenAI", raw: data });
            }

            // Parse robusto: tenta pegar o primeiro JSON array dentro do texto
            let parsed = null;
            try {
                parsed = JSON.parse(out);
            } catch {
                const a = out.indexOf("[");
                const b = out.lastIndexOf("]");
                if (a !== -1 && b !== -1 && b > a) {
                    const slice = out.slice(a, b + 1);
                    parsed = JSON.parse(slice);
                }
            }

            if (!Array.isArray(parsed)) {
                return res.status(500).json({
                    error: "Could not parse JSON array from model output",
                    rawText: out,
                    raw: data,
                });
            }

            // garante tamanho
            if (parsed.length !== texts.length) {
                return res.status(500).json({
                    error: `Returned array length mismatch. Expected ${texts.length}, got ${parsed.length}`,
                    rawText: out,
                });
            }

            return res.status(200).json({ texts: parsed });
        }

        // (Opcional) modo antigo (HTML inteiro) — mantém compatibilidade
        const html = body.html;
        if (!html) return res.status(400).json({ error: "Missing html or texts" });

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

        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 25000);

        let data;
        try {
            const r = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                signal: ctrl.signal,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "gpt-4.1-mini",
                    temperature: 0.2,
                    input: [
                        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
                        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
                    ],
                }),
            });

            data = await r.json();

            if (!r.ok) {
                return res.status(r.status).json({
                    error: data?.error?.message || "OpenAI API error",
                    raw: data,
                });
            }
        } finally {
            clearTimeout(timeout);
        }

        let translatedHTML = "";
        if (typeof data.output_text === "string") {
            translatedHTML = data.output_text.trim();
        } else if (Array.isArray(data.output)) {
            for (const block of data.output) {
                if (!block?.content) continue;
                for (const part of block.content) {
                    if (part.type === "output_text" && part.text) translatedHTML += part.text;
                }
            }
            translatedHTML = translatedHTML.trim();
        }

        if (!translatedHTML) {
            return res.status(500).json({
                error: "Translation returned empty output",
                raw: data,
            });
        }

        return res.status(200).json({ html: translatedHTML });
    } catch (err) {
        const msg =
            err?.name === "AbortError"
                ? "Timeout in translate function (took too long)"
                : err?.message || "Internal server error";

        console.error("TRANSLATE ERROR:", err);
        return res.status(500).json({ error: msg });
    }
}
