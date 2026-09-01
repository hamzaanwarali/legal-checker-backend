import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.get('/', (req, res) => {
    res.send('الخادم يعمل بنجاح!');
});

app.post('/api/analyze', async (req, res) => {
    try {
        const { documentText } = req.body;
        if (!documentText) {
            return res.status(400).json({ error: 'لم يتم تقديم نص المستند' });
        }

        const promptSystem = `أنت خبير قضائي ومحلل بيانات قانونية. قم بتحليل صحيفة الدعوى المرفقة واستخراج البيانات الشكليّة ودراسة ما إذا كان هناك أي نقص (مثل: مهنة المدعي، مهنة المدعى عليه، العنوان التفصيلي، أرقام الهواتف، اسم المحكمة، السن).
أرجع النتيجة حصراً بصيغة JSON نظيفة ومطابقة للهيكل التالي بالضبط دون أي كود خارجي:
{
  "court": "اسم المحكمة أو null",
  "subject": "موضوع الدعوى أو null",
  "plaintiff": { "name": null, "age": null, "job": null, "phone": null, "address": null },
  "defendant": { "name": null, "age": null, "job": null, "phone": null, "address": null },
  "missing_fields": [ {"field": "اسم البيان الناقص", "reason": "سبب اعتباره ناقصاً"} ]
}`;

        // استخدام نموذج gemini-3.6-flash المحدد في سجل الأخطاء
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: `${promptSystem}\n\nنص الصحيفة القضائية:\n${documentText}`,
            config: {
                responseMimeType: "application/json"
            }
        });

        if (!response || !response.text) {
            throw new Error("لم يتم استلام نص استجابة من الذكاء الاصطناعي");
        }

        const rawText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const resultJson = JSON.parse(rawText);
        
        return res.json(resultJson);

    } catch (error) {
        console.error("Server Error Details:", error);
        return res.status(500).json({ 
            error: 'حدث خطأ في معالجة المستند عبر الخادم',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`الخادم يعمل بنجاح على المنفذ: ${PORT}`));
