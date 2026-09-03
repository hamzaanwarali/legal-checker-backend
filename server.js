import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 1. إعدادات CORS للسماح للواجهة الأمامية بالاتصال
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// 2. قائمة الحقول المطلوبة لكل نوع طلب
const FIELDS_BY_ACTION = {
  NewLawsuit: `
- الطرف الأول (Plaintiffs[0]): LitName, NatiNo, GenNo, LitAge, JobDet, LitPhone, LitAdres, LitEmail.
- الطرف الثاني (Defendants[0]): LitName, NatiNo, GenNo, LitAge, JobDet, LitPhone, LitAdres, LitEmail.
- تفاصيل الدعوى (Lawsuit): Side1No, Side2No, PayServes('عريضة دعوى'), LawsEDate, LawsDetls, PlaReq, LawsRes.`,

  AppealPetition: `
- الطاعن (Plaintiffs[0]): LitName, JobDet, LitPhone, LitAdres, LitEmail.
- المطعون ضده (Defendants[0]): LitName, JobDet, LitPhone, LitAdres.
- بيانات الطعن (Lawsuit): Side1No, Side2No, PayServes('عريضة طعن'), LawsEDate, LawsDetls, PlaReq.`,

  PerformanceOrder: `
- طالب الأمر (Plaintiffs[0]): LitName, NatiNo, GenNo, LitAge, JobDet, LitPhone, LitAdres, LitEmail.
- مطلوب الأمر ضده (Defendants[0]): LitName, NatiNo, GenNo, LitAge, JobDet, LitPhone, LitAdres, LitEmail.
- بيانات الطلب والمالية (Lawsuit): Side1No, Side2No, PayServes('طلب اصدار أمر أداء'), LawsEDate, LawsDetls, LawsRes, PlaReq, LawsFes, LawsTes, LawsLDate.`,

  PetitionOrder: `
- الطالب (Plaintiffs[0]): LitName, JobDet, LitPhone, LitAdres, LitEmail.
- المطلوب ضده (Defendants[0]): LitName, JobDet, LitPhone, LitAdres.
- بيانات الطلب (Lawsuit): Side1No, Side2No, PayServes('طلب أمر على عريضة'), LawsDetls, PlaReq.`
};

// 3. الدالة الاحتياطية المحدثة للنماذج المتاحة والمدعومة
async function generateContentWithFallback(ai, prompt) {
  // استخدام النماذج الحديثة الموصى بها فقط
  const modelsToTry = [
    'gemini-3.6-flash',
    'gemini-2.5-flash'
  ];

  for (const modelName of modelsToTry) {
    try {
      console.log(`محاولة الفحص باستخدام النموذج: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      console.log(`نجح الفحص باستخدام: ${modelName}`);
      return response;
    } catch (err) {
      console.warn(`تعذر استخدام ${modelName} بسبب (${err.message}). جارٍ الانتقال للنموذج التالي...`);
    }
  }

  throw new Error('تعذر الوصول إلى نماذج Gemini المتاحة، يرجى المحاولة بعد قليل.');
}

// 4. نقطة الاتصال الرئيسي
app.post('/api/analyze', upload.single('documentFile'), async (req, res) => {
  try {
    const { actionType, rawText } = req.body;
    let extractedText = rawText || '';

    if (req.file) {
      if (req.file.originalname.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        extractedText = result.value;
      } else if (req.file.originalname.endsWith('.pdf')) {
        const pdfData = await pdfParse(req.file.buffer);
        extractedText = pdfData.text;
      }
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ success: false, message: 'لم يتم العثور على نص لفحصه.' });
    }

    const actionFields = FIELDS_BY_ACTION[actionType];
    if (!actionFields) {
      return res.status(400).json({ success: false, message: 'نوع الخدمة غير مدعوم.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `
أنت محرك فحص وتدقيق قانوني. مهمتك فحص النص التالي بناءً على قائمة الحقول الإلزامية الخاصة بـ (${actionType}) فقط.

قائمة الحقول المطلوبة:
${actionFields}

النص المراد فحصه:
"""
${extractedText}
"""

المطلوب: قم بإرجاع النتيجة بصيغة JSON فقط بالتنسيق التالي:
{
  "isReadyForSubmission": boolean,
  "completedFields": [{"fieldName": "اسم الحقل", "extractedValue": "القيمة"}],
  "missingFields": ["اسم الحقل الناقص"],
  "validationErrors": [{"fieldName": "اسم الحقل", "issueDescription": "وصف المشكلة"}]
}`;

    const response = await generateContentWithFallback(ai, prompt);
    const analysisResult = JSON.parse(response.text);
    return res.json(analysisResult);

  } catch (error) {
    console.error('خطأ في السيرفر:', error);
    return res.status(500).json({ success: false, message: error.message || 'حدث خطأ في السيرفر أثناء الفحص.' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
