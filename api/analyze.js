export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { promptText, mimeType, base64Data } = req.body;
    
    if (!promptText || !mimeType || !base64Data) {
      return res.status(400).json({ error: 'Missing required fields (promptText, mimeType, base64Data)' });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set in environment variables.');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // APIキーを使って利用可能な最新のフラッシュモデルを動的に取得する
    let targetModel = 'gemini-1.5-flash';
    try {
        const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (modelsRes.ok) {
            const md = await modelsRes.json();
            const generateModels = md.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
            const preferred = 
                generateModels.find(m => m.name.includes("2.5-flash")) ||
                generateModels.find(m => m.name.includes("2.0-flash")) ||
                generateModels.find(m => m.name.includes("1.5-flash")) ||
                generateModels.find(m => m.name.includes("flash")) ||
                generateModels[0];
            if (preferred) {
                targetModel = preferred.name.split('models/')[1];
            }
        }
    } catch (e) {
        console.warn("Model fetch failed, falling back to default", e);
    }
    console.log("Selected model:", targetModel);

    
    const reqBody = {
      contents: [{
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType, data: base64Data } }
        ]
      }]
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API Error:', errText);
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
