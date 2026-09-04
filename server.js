import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// دالة تحويل الأرقام الشرقية/الهندية (٠-٩) إلى أرقام غربية (0-9) لضمان صحة الفحص
function normalizeArabicNumerals(str) {
  if (!str) return '';
  const easternNumbers = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  const westernNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  
  for (let i = 0; i < 10; i++) {
    str = str.replace(easternNumbers[i], westernNumbers[i]);
  }
  return str;
}

// قواعد وضوابط الخدمات القضائية الأربعة المعتمدة
const SERVICE_RULES = {
  NewLawsuit: `
نوع الخدمة: إنشاء دعوى جديدة (الصفحة الأولى)
قواعد الشروط والضوابط الإلزامية والاختيارية:

تنبيه هام لأرقام الهواتف: قد تكتب بأرقام غربية (771237727) أو أرقام شرقية (٧٧١٢٣٧٧٢٧). يعتبر الرقم صالحاً وموجوداً إذا كان يتكون من 9 أرقام ويبدأ بـ (77, 78, 73, 71, 70).

1. بيانات المدعين (Plaintiffs) - يتم فحص كافة المدعين المذكورين شخصاً بشخص:
   - اسم المدعي (LitName): مطلوب لكل مدعٍ. 3 أسماء على الأقل مع اللقب (رباعي)، حد أقصى 70 حرف، بدون أرقام/رموز.
   - العمل/المهنة (JobDet): مطلوب لكل مدعٍ. حد أقصى 70 حرف.
   - رقم الهاتف (LitPhone): مطلوب إجبارياً للمدعي الأول فقط (9 أرقام يبدأ بـ 77, 78, 73, 71, 70). للمدعين الآخرين هو اختيار، وإن وجد يخضع لنفس الشرط.
   - العنوان (LitAdres): مطلوب لكل مدعٍ. حد أقصى 70 حرف.
   - اسم الوكيل (LitEmail): مطلوب لكل مدعٍ. حد أقصى 70 حرف، بدون أرقام أو رموز.
   * ملاحظة: الجنسية (NatiNo) والجنس (GenNo) غير مطلوبة لأي مدعٍ.

2. بيانات المدعى عليهم (Defendants) - يتم فحص كافة المدعى عليهم شخصاً بشخص:
   - اسم المدعى عليه (LitName): مطلوب لكل مدعى عليه. 3 أسماء على الأقل مع اللقب (رباعي)، حد أقصى 70 حرف، بدون أرقام/رموز.
   - العمل/المهنة (JobDet): مطلوب لكل مدعى عليه. حد أقصى 70 حرف.
   - رقم الهاتف (LitPhone): مطلوب إجبارياً للمدعى عليه الأول فقط (9 أرقام يبدأ بـ 77, 78, 73, 71, 70). للمدعى عليهم الآخرين اختياري.
   - العنوان (LitAdres): مطلوب لكل مدعى عليه. حد أقصى 70 حرف.
   - اسم الوكيل (LitEmail): مطلوب لكل مدعى عليه. حد أقصى 70 حرف، بدون أرقام أو رموز.

3. بيانات الدعوى الأساسية (Lawsuit):
   - نوع الدعوى (LawsTypeNo): مطلوب.
   - رقم القضية (CaNO): مطلوب فقط إذا كان نوع الدعوى فرعية أو طلب تدخل أو دعوى بالحق المدني (نمط: YYYY/).
   - المحكمة (Side2No): مطلوب.
   - موضوع الدعوى (PayServes): مطلوب. حد أقصى 150 حرف.
   - وقائع الدعوى (LawsDetls): مطلوب.
   - الأسباب والأسانيد القانونية (LawsRes): مطلوب.
   - طلبات الدعوى (PlaReq): مطلوب.
   * ملاحظة: المحافظة (Side1No) غير مطلوبة صراحة.

4. المرفقات والأدلة المذكورة في النص (Attachments) - يتم فحص كل مرفق مذكور:
   - نوع المستند/اسم المرفق (AttName): مطلوب لكل مرفق. حد أقصى 70 حرف.
   - تاريخه ميلادي (AttD): مطلوب لكل مرفق (تاريخ).
   - مضمون المستند ووجه الاستدلال (Att): مطلوب لكل مرفق. حد أقصى 70 حرف.
   - عدد الصفحات (AttPage): مطلوب لكل مرفق. رقم صحيح موجب.
   * ملاحظة: تاريخه هجري (AttDH) غير مطلوب للمرفقات.
  `,

  AppealPetition: `
نوع الخدمة: إنشاء عريضة طعن جديدة (الصفحة الثانية)
قواعد الشروط والضوابط الإلزامية والاختيارية:

1. بيانات المستأنفون (Plaintiffs) - فحص كل مستأنف مذكور:
   - اسم المستأنف (LitName): مطلوب لكل مستأنف. 3 أسماء على الأقل مع اللقب (رباعي)، حد أقصى 70 حرف.
   - العمل (JobDet): مطلوب لكل مستأنف. حد أقصى 70 حرف.
   - رقم الهاتف (LitPhone): مطلوب للمستأنف الأول فقط (9 أرقام يبدأ بـ 77, 78, 73, 71, 70).
   - العنوان (LitAdres): مطلوب لكل مستأنف. حد أقصى 70 حرف.
   - اسم الوكيل (LitEmail): مطلوب لكل مستأنف. حد أقصى 70 حرف.

2. بيانات المستأنف ضدهم (Defendants) - فحص كل مستأنف ضده مذكور:
   - اسم المستأنف ضده (LitName): مطلوب لكل شخص. 3 أسماء على الأقل مع اللقب (رباعي)، حد أقصى 70 حرف.
   - العمل (JobDet): مطلوب لكل شخص. حد أقصى 70 حرف.
   - رقم الهاتف (LitPhone): مطلوب للشخص الأول فقط (9 أرقام يبدأ بـ 77, 78, 73, 71, 70).
   - العنوان (LitAdres): مطلوب لكل شخص. حد أقصى 70 حرف.
   - اسم الوكيل (LitEmail): مطلوب لكل شخص. حد أقصى 70 حرف.

3. بيانات العريضة الأساسية (Lawsuit2):
   - نوع الطعن (LawsTypeNo): مطلوب.
   - رقم القضية (CaNO): مطلوب (نمط: YYYY/).
   - المحكمة - نوع الاستئناف (side11No): مطلوب.
   - الموضوع (PayServes): مطلوب. حد أقصى 150 حرف.
   - الوقائع (LawsDetls): مطلوب.
   - الأسباب والأسانيد - من الناحية الشكلية (LawsRes): مطلوب.
   - الأسباب والأسانيد - من الناحية الموضوعية (LawsRes2): مطلوب.
   - الطلبات (PlaReq): مطلوب.

4. المرفقات (Attachments) - فحص كل مرفق أو دليل مذكور:
   - نوع المستند (AttName)، التاريخ الميلادي (AttD)، مضمون المستند (Att)، وعدد الصفحات (AttPage): جميعها مطلوبة لكل مرفق مذكور.
  `,

  PetitionOrder: `
نوع الخدمة: إنشاء طلب أمر على عريضة (الصفحة الثالثة)
قواعد الشروط والضوابط الإلزامية والاختيارية:

1. بيانات طالب الأمر (Plaintiffs) - فحص جميع المذكورين:
   - طالب الأمر (LitName): مطلوب لكل شخص. 3 أسماء مع اللقب (رباعي)، حد أقصى 70 حرف.
   - المهنة (JobDet): مطلوب لكل شخص. حد أقصى 70 حرف.
   - رقم الهاتف (LitPhone): مطلوب للشخص الأول فقط (9 أرقام يبدأ بـ 77, 78, 73, 71, 70).
   - الموطن/العنوان (LitAdres): مطلوب لكل شخص. حد أقصى 70 حرف.
   - اسم الوكيل وهاتفه (LitEmail): مطلوب لكل شخص. حد أقصى 70 حرف.

2. بيانات مطلوب الأمر ضده (Defendants) - فحص جميع المذكورين:
   - مطلوب الأمر ضده (LitName): مطلوب لكل شخص. 3 أسماء مع اللقب (رباعي)، حد أقصى 70 حرف.
   - المهنة (JobDet): مطلوب لكل شخص. حد أقصى 70 حرف.
   - رقم الهاتف (LitPhone): مطلوب للشخص الأول فقط (9 أرقام يبدأ بـ 77, 78, 73, 71, 70).
   - الموطن/العنوان (LitAdres): مطلوب لكل شخص. حد أقصى 70 حرف.
   - اسم الوكيل وهاتفه (LitEmail): مطلوب لكل شخص. حد أقصى 70 حرف.

3. بيانات طلب أمر على عريضة (Lawsuit):
   - نوع الأمر (LawsTypeNo): مطلوب.
   - المحكمة (Side2No): مطلوب.
   - موضوع الأمر (PayServes): مطلوب عند اختيار نوع الأمر 14. حد أقصى 150 حرف.
   - وقائع الطلب (LawsDetls): مطلوب.
   - أسانيد الطلب (LawsRes): مطلوب.
   - الطلبات (PlaReq): مطلوب.

4. المرفقات (Attachments) - فحص كل مرفق مذكور:
   - نوع المستند (AttName)، التاريخ الميلادي (AttD)، مضمون المستند (Att)، وعدد الصفحات (AttPage): جميعها مطلوبة لكل مرفق.
  `,

  PerformanceOrder: `
نوع الخدمة: إنشاء أمر أداء (الصفحة الرابعة)
قواعد الشروط والضوابط الإلزامية والاختيارية:

1. بيانات طالب الأمر (Plaintiffs):
   - طالب الأمر (LitName)، المهنة (JobDet)، رقم الهاتف (LitPhone - للشخص الأول فقط)، الموطن (LitAdres)، اسم الوكيل (LitEmail): جميعها مطلوبة بحد أقصى 70 حرف لكل شخص.

2. بيانات مطلوب الأمر ضده (Defendants):
   - مطلوب الأمر ضده (LitName)، المهنة (JobDet)، رقم الهاتف (LitPhone - للشخص الأول فقط)، الموطن (LitAdres)، اسم الوكيل (LitEmail): جميعها مطلوبة بحد أقصى 70 حرف لكل شخص.

3. بيانات أمر الأداء (Lawsuit):
   - المحكمة (Side2No): مطلوب.
   - تاريخ سند المديونية (LawsEDate): مطلوب (تاريخ).
   - نوع السند (LawsDetls): مطلوب.
   - مبلغ الدين (LawsRes): مطلوب (قيمة رقمية).
   - أجل السداد (PlaReq): مطلوب.
   - تاريخ التكليف بالوفاء (LawsLDate): مطلوب (تاريخ).
   - محضر المحكمة (RCourt): مطلوب.
   * ملاحظة: تاريخ السداد (LawsFDate) والمبلغ المسدد (LawsFes) هما حقلان اختياربان.

4. المرفقات (Attachments) - فحص كل مرفق مذكور:
   - نوع المستند (AttName)، التاريخ الميلادي (AttD)، مضمون المستند (Att)، وعدد الصفحات (AttPage): جميعها مطلوبة لكل مرفق.
  `
};

// دالة التنقل بين نماذج الذكاء الاصطناعي لتفادي توقف الخدمة
async function generateContentWithFallback(ai, prompt) {
  const modelsToTry = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-2.5-flash'
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      return response;
    } catch (err) {
      console.warn(`تعذر الاستجابة من النموذج ${modelName}: ${err.message}`);
      lastError = err;
    }
  }
  throw new Error(`جميع نماذج الفحص غير متاحة حالياً. التفاصيل: ${lastError?.message || 'خطأ في الاتصال'}`);
}

// المسار الرئيسي للتحليل والتدقيق
app.post('/api/analyze', upload.single('documentFile'), async (req, res) => {
  try {
    const { actionType, rawText } = req.body;
    let extractedText = rawText || '';

    // قراءة وتقشير النصوص من الملفات المرفقة
    if (req.file) {
      const fileName = req.file.originalname.toLowerCase();
      if (fileName.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        extractedText = result.value;
      } else if (fileName.endsWith('.pdf')) {
        const pdfData = await pdfParse(req.file.buffer);
        extractedText = pdfData.text;
      }
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'لم يتم العثور على نص لفحصه (يرجى إرفاق ملف Word/PDF أو لصق النص).' 
      });
    }

    // توحيد تنسيق الأرقام
    extractedText = normalizeArabicNumerals(extractedText);

    const rules = SERVICE_RULES[actionType || 'NewLawsuit'];
    if (!rules) {
      return res.status(400).json({ 
        success: false, 
        message: 'نوع الخدمة القضائية المحدد غير معروف.' 
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `
أنت محرك فحص وتدقيق للعرائض والنماذج القضائية. مهمتك مراجعة المستند المرفق وتدقيقه سواء كان مكتوباً على شكل فقرات، أو قوائم، أو نص حر، بناءً على الشروط والملاحظات التالية:

${rules}

النص المراد تدقيقه:
"""
${extractedText}
"""

تعليمات صارمة للإخراج:
1. قم باستخلاص البيانات من النص، وتحقق من توفر جميع الحقول المطلوبة وضوابطها لكافة الأطراف والمرفقات المذكورة.
2. انتبه جيداً لأرقام الهواتف: أرقام الهواتف المقبولة تتكون من 9 أرقام وتبدأ بالمفتاح (77, 78, 73, 71, 70) بغض النظر عما إذا كانت مكتوبة بأرقام شرقيه أو غربية.
3. تجاهل الحقول الاختيارية وغير المطلوبة (مثل الجنسية، الجنس، المحافظة، التاريخ الهجري للمرفقات).
4. استخدم العبارات والأسماء العربية الصريحة المفهومة للمستخدم العادي (مثال: "اسم المدعي الأول الرباعي", "رقم هاتف المدعى عليه الأول", "تاريخ المرفق الأول").
5. يمنع منعاً باتاً استخدام المصطلحات الإنجليزية أو أسماء الحقول البرمجية مثل (Plaintiffs, Defendants, LitName, LawsEDate, NatiNo, LitEmail, AttName).
6. اذكر فقط البيانات الناقصة أو غير المتطابقة مع القيود المحددة.

نسّق النتيجة كـ JSON كالتالي حصراً:
{
  "isReadyForSubmission": true / false,
  "missingFields": [
    "اسم الحقل أو الطرف أو المرفق الناقص باللغة العربية الواضحة"
  ],
  "validationErrors": [
    {"fieldName": "اسم الحقل أو المرفق بالعربي المفهوم", "issueDescription": "شرح الخطأ أو التعارض بأسلوب عربي بسيط مع تحديد الشخص أو المرفق"}
  ]
}`;

    const response = await generateContentWithFallback(ai, prompt);
    const analysisResult = JSON.parse(response.text);
    return res.json(analysisResult);

  } catch (error) {
    console.error('خطأ في السيرفر:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'حدث خطأ في السيرفر أثناء تدقيق المستند.' 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
