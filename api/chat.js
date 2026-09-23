export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method tidak diizinkan" });
  }

  try {
    const { model, message, image } = req.body;

    if (!message && !image) {
      return res.status(400).json({ error: "Pesan atau gambar wajib diisi" });
    }

    const apiKey = process.env.KIE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "KIE_API_KEY belum diatur" });
    }

    let url;
    let body;

    if (model === "gemini-pro") {
      url = "https://api.kie.ai/gemini-3.1-pro/v1/chat/completions";

      const content = [
        {
          type: "text",
          text: message || "Jelaskan gambar ini."
        }
      ];

      if (image) {
        content.push({
          type: "image_url",
          image_url: {
            url: image
          }
        });
      }

      body = {
        messages: [
          {
            role: "user",
            content
          }
        ],
        stream: false,
        reasoning_effort: "high"
      };
    }

    if (model === "gemini-flash") {
      url = "https://api.kie.ai/gemini/v1/models/gemini-3-8-flash:streamGenerateContent";

      const parts = [
        {
          text: message || "Jelaskan gambar ini."
        }
      ];

      if (image) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: image.split(",")[1]
          }
        });
      }

      body = {
        stream: false,
        contents: [
          {
            role: "user",
            parts
          }
        ]
      };
    }

    if (model === "gpt-luna" || model === "gpt-terra") {
      const selectedModel =
        model === "gpt-luna" ? "gpt-5-6-luna" : "gpt-5-6-terra";

      url = "https://api.kie.ai/codex/v1/responses";

      const content = [
        {
          type: "input_text",
          text: message || "Jelaskan gambar ini."
        }
      ];

      if (image) {
        content.push({
          type: "input_image",
          image_url: image
        });
      }

      body = {
        model: selectedModel,
        input: [
          {
            role: "user",
            content
          }
        ],
        reasoning: {
          effort: "high"
        }
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const raw = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: raw
      });
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }

    const reply = extractReply(data);

    return res.status(200).json({
      reply: reply || "Model tidak mengembalikan jawaban."
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}

function extractReply(data) {
  if (typeof data === "string") {
    const lines = data.split("\n");
    let result = "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      const value = line.replace("data:", "").trim();

      if (value === "[DONE]") continue;

      try {
        const json = JSON.parse(value);

        result +=
          json?.choices?.[0]?.delta?.content ||
          json?.choices?.[0]?.message?.content ||
          json?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "";
      } catch {}
    }

    return result;
  }

  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }

  if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }

  if (Array.isArray(data?.output)) {
    return data.output
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");
  }

  return "";
}
