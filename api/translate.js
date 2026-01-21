// api/translate.js

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method Not Allowed" });
        }

        const { html, targetLang } = req.body || {};

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

        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
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
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data?.error?.message || "OpenAI API error",
                raw: data,
            });
        }

        // 🔥 EXTRAÇÃO CORRETA DO TEXTO
        let translatedHTML = "";

        if (typeof data.output_text === "string") {
            translatedHTML = data.output_text.trim();
        } else if (Array.isArray(data.output)) {
            for (const block of data.output) {
                if (!block?.content) continue;
                for (const part of block.content) {
                    if (part.type === "output_text" && part.text) {
                        translatedHTML += part.text;
                    }
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

        return res.status(200).json({
            html: translatedHTML,
        });
    } catch (err) {
        console.error("TRANSLATE ERROR:", err);
        return res.status(500).json({
            error: err.message || "Internal server error",
        });
    }
}
