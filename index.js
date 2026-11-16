const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.redirect('/index.html');
});

app.post('/api/chat', async (req, res) => {
    try {
        const messages = req.body.messages;

        if (!Array.isArray(messages)) {
            return res.status(400).json({
                error: 'Messages harus berupa array'
            });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: 'API key OpenRouter belum diatur.'
            });
        }

        const response = await fetch('https://api.openrouter.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages,
                temperature: 0.7,
                max_tokens: 1000,
                stream: true
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenRouter Error:', errorData);
            return res.status(response.status).json({
                error: errorData
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const reader = response.body?.getReader();
        if (!reader) {
            return res.status(502).json({
                error: 'Tidak ada body streaming dari upstream.'
            });
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || '';

            for (const chunk of chunks) {
                const lines = chunk.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data:')) {
                        continue;
                    }

                    const data = trimmedLine.slice(5).trim();
                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const json = JSON.parse(data);
                        const content = json?.choices?.[0]?.delta?.content;
                        if (typeof content === 'string' && content) {
                            res.write(`data: ${JSON.stringify(content)}\n\n`);
                        }
                    } catch (error) {
                        console.error('Gagal parsing streaming data:', error);
                    }
                }
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('Server Error:', error);

        if (!res.headersSent) {
            return res.status(500).json({
                error: 'Terjadi kesalahan pada server'
            });
        }

        res.write(`data: ${JSON.stringify('Terjadi kesalahan pada server')}\n\n`);
        res.end();
    }
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});