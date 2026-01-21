export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const { targetLang, texts } = req.body || {};

        if (!targetLang || typeof targetLang !== 'string') {
            return res.status(400).json({ error: 'targetLang is required' });
        }
        if (!Array.isArray(texts) || texts.length === 0) {
            return res.status(400).json({ error: 'texts must be a non-empty array' });
        }
        if (texts.length > 60) {
            return res.status(400).json({ error: 'too many texts in one request (max 60)' });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'OPENAI_API_KEY not set in environment' });
        }

        // Prompt de tradução “segura” para HTML: mantém placeholders/UTMs/tags/variáveis
        const system = [
            'Você é um tradutor profissional.',
            'Traduza para o idioma alvo com naturalidade (tom de anúncio/UX).',
            'NÃO traduza: URLs, códigos, tokens, {{placeholders}}, %PLACEHOLDER%, variáveis, números de modelo, nomes de marca.',
            'Mantenha exatamente a mesma quantidade de itens na saída (uma tradução por item).',
            'Retorne SOMENTE JSON válido no formato: {"translations":["...","..."]}.',
            'Não inclua comentários.'
        ].join(' ');

        const user = {
            target_language: targetLang,
            items: texts
        };

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                input: [
                    { role: 'system', content: system },
                    { role: 'user', content: JSON.stringify(user) }
                ],
                // pede saída estruturada (o modelo vai obedecer o JSON)
                max_output_tokens: 1200
            })
        });

        if (!response.ok) {
            const errTxt = await response.text().catch(() => '');
            return res.status(500).json({ error: 'OpenAI request failed', details: errTxt });
        }

        const data = await response.json();

        // responses api: texto final costuma vir em output_text
        const outText = data.output_text || '';
        let parsed;
        try {
            parsed = JSON.parse(outText);
        } catch {
            // fallback: tenta achar JSON dentro do texto
            const m = outText.match(/\{[\s\S]*\}/);
            if (!m) throw new Error('Could not parse JSON from model output');
            parsed = JSON.parse(m[0]);
        }

        if (!parsed || !Array.isArray(parsed.translations)) {
            return res.status(500).json({ error: 'Invalid model JSON output' });
        }

        return res.status(200).json({ translations: parsed.translations });
    } catch (e) {
        return res.status(500).json({ error: 'Server error', message: e?.message || String(e) });
    }
}
