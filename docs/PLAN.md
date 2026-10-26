# CSS ERP — Claude Code দিয়ে পূর্ণাঙ্গ ডেভেলপমেন্ট প্ল্যান ও ধাপে ধাপে প্রম্পট

**আস-সুন্নাহ ফাউন্ডেশন · চ্যারিটি এন্ড সোশ্যাল সার্ভিস ডিপার্টমেন্ট**
সংস্করণ ১.৪ · ১০ অক্টোবর ২০২৬

> **১.১-এ যা বদলেছে:** রিপোজিটরি `D:\Charity Website\Charity_ERP`-এ প্রস্তুত ও GitHub-এ যুক্ত (M2 ও M3 সম্পন্ন, push হয়েছে) · প্রস্তাবিত Node.js 22 → 24 LTS (আপনার মেশিনে ২৪ আছে) · `/css-start` প্রথম দিনে DECISION_LOG না থাকলেও ঠিকমতো চলে · ব্লুপ্রিন্টের Markdown রূপ নতুন করে বানানো: ক্রমিক তালিকা, ৮১টি উপ-শিরোনাম ও ছবির ক্যাপশন ঠিক, মূল docx-এর সাথে অনুচ্ছেদ ধরে মিলিয়ে যাচাই করা।
>
> **১.২-এ যা বদলেছে:** ডিজাইন ইন্টারভিউ হয়েছে: ১২টি সিদ্ধান্ত (UX-01…12) `docs/ui/DESIGN_BRIEF.md`-এ · আপনার Figma নেই, তাই নতুন টাস্ক T0.19b: ব্রাউজারে দেখার HTML মকআপ (মোট টাস্ক ৭৮) · মাস্টার প্রম্পটে সংশোধন: সংখ্যা সবসময় ইংরেজি অঙ্কে, অফিসিয়ালরা ফোন ও ডেস্কটপ সমান ব্যবহার করেন, কিছু স্বেচ্ছাসেবক আইফোন ব্যবহার করেন · লোগো ও ব্র্যান্ডের রং আপনার দেওয়ার তালিকায়।
>
> **১.৩-এ যা বদলেছে:** রং ও ফন্ট ওয়েবসাইট থেকে নেওয়া হয়েছে (UX-01, UX-13): প্রধান সবুজ `#008E48`, গাঢ় সবুজ `#0F2920`, সোনালি `#E8B65D`; ফন্ট `UbuntuSans, Bornomala, sans-serif`, ওজন ৪০০ ও ৭০০ (Hind Siliguri বাদ) · ছোট লেখার জন্য গাঢ়তর সবুজ `#007B3E`, কারণ `#008E48`-এ সাদা লেখার কনট্রাস্ট ৪.২৩, যা AA-এর ৪.৫-এর নিচে · বিস্তারিত `docs/ui/brand/colors.md`-এ · Bornomala ফন্ট নিজেই SIL OFL 1.0 ঘোষণা করে; ওয়েবসাইট-নির্মাতার কাছ থেকে উৎস নিশ্চিত করা বাকি। লোগো (`logo.png` ও ভেক্টর `logo.svg`) এবং ফন্ট ফাইল `docs/ui/brand/`-এ আছে।
>
> **১.৪-এ যা বদলেছে:** নতুন `docs/MODEL_GUIDE.md`: ৭৮টি টাস্কের প্রতিটিতে কোন Claude মডেল ও কোন effort, কেন, আর সীমা ফুরোলে কী করবেন · §২.৩ খ-এর ধাপ ১ ও ছ, "কীভাবে ব্যবহার করবেন"-এর ধাপ ৩, প্রথম সেশনের লাইন ও Phase 2-এর ভূমিকা সেই অনুযায়ী হালনাগাদ।

উৎস ডকুমেন্ট (তিনটিই পুরো পড়ে বিশ্লেষণ করা হয়েছে):

| # | ফাইল | কী | ভূমিকা |
|---|---|---|---|
| ১ | চ্যারিটি এন্ড সোশ্যাল সার্ভিস ERP সিস্টেম — প্রস্তাবনা ও কার্যপ্রণালী.docx | ব্লুপ্রিন্ট, সংস্করণ ২ (৫ অক্টোবর ২০২৬), Part A–D + পরিশিষ্ট, ৬টি ডায়াগ্রাম | ব্যবসায়িক কর্তৃত্ব: বিভাগ কীভাবে কাজ করে তার একমাত্র উৎস |
| ২ | MASTER_PROMPT_CSS_ERP.md | AI ডেভেলপারের "সংবিধান": §0–§18, ৪৯টি অনুমোদিত সিদ্ধান্ত (BD-01…49), রোডম্যাপ, স্ট্যান্ডার্ড, কাজের নিয়ম | প্রতিটি সেশনে Claude যে নিয়মে কাজ করবে |
| ৩ | charity_ERP.md | প্রম্পট লাইব্রেরি P0–P8 + §A নিয়মিত প্রম্পট | কোন ক্রমে কী করাতে হবে |

এই ফাইলটি তিনটিকে এক সুতোয় বেঁধে **Claude Code-এর জন্য** সাজিয়েছে: কী কী অসঙ্গতি পাওয়া গেল ও কীভাবে ঠিক করা হলো (§১), কৌশল ও কাজের পদ্ধতি (§২), Claude ছাড়া আপনার ম্যানুয়াল প্রস্তুতি (§৩), এবং ৭৮টি টাস্ক-প্রম্পট ক্রম অনুযায়ী (§৪), নিয়মিত প্রম্পট/slash command (§৫), টিপস (§৬), পরিশিষ্ট।

---

## এই ফাইলটি কীভাবে ব্যবহার করবেন

1. ✅ **সম্পন্ন (১০ অক্টোবর ২০২৬):** starter-kit-এর সব ফাইল রিপোর রুটে আছে এবং প্রথম commit হয়েছে; এই ফাইলটি এখন `docs/PLAN.md`। রিপোতে আছে: `CLAUDE.md`, `docs/MASTER_PROMPT.md` (সংশোধিত মাস্টার প্রম্পট), `docs/source/ERP_BLUEPRINT_BN.md` (ব্লুপ্রিন্টের Markdown রূপ, ছবিসহ), `docs/STATUS.md`, `.claude/commands/` (১০টি slash command), `.claude/settings.json`, `README.md`, `.gitignore`, `.gitattributes`।
2. §৩-এর বাকি ম্যানুয়াল প্রস্তুতি (M1, M4–M6) শেষ করুন; M2 ও M3 সম্পন্ন।
3. §৪-এর টাস্কগুলো **ক্রম অনুযায়ী, একটি একটি করে** Claude Code-এ দিন। প্রতিটি টাস্ক = একটি সেশন। টাস্কের ওপরের লাইনগুলো (কখন, মোড, আগে কী লাগবে, শেষে কী দেখে নেবেন) আপনার জন্য; `code block`-এর ভেতরের ইংরেজি লেখাটুকু হুবহু কপি করে Claude Code-এ পেস্ট করবেন। কোন মডেল ও effort দিয়ে সেশন শুরু করবেন, তা `docs/MODEL_GUIDE.md`-এ টাস্ক ধরে ধরে লেখা আছে।
4. `[...]` চিহ্নের ভেতরের অংশ নিজের তথ্য দিয়ে বদলে নিন।
5. ফলাফলে সন্তুষ্ট না হলে পরের টাস্কে যাবেন না; §৫-এর `/css-fix`, `/css-bug`, `/css-review` ব্যবহার করুন।

মোড-চিহ্ন (প্রতিটি টাস্কের শিরোনামের পাশে):

| চিহ্ন | অর্থ | Claude Code-এ কীভাবে |
|---|---|---|
| 📄 | শুধু ডকুমেন্ট; কোনো অ্যাপ্লিকেশন কোড নয় | Plan mode-এ শুরু করুন (Shift+Tab চেপে "plan mode"), প্ল্যান দেখে অনুমোদন দিন |
| 🛠 | বাস্তবায়ন (কোড + টেস্ট + ডক) | Plan mode-এ প্রম্পট দিন → প্ল্যান পড়ুন → অনুমোদন → কাজ শেষে `/css-end` |
| 🧪 | ফেজের টেস্ট একত্রীকরণ | সাধারণ মোড; রিপোর্টে টেস্ট রান-এর আউটপুট না থাকলে গ্রহণ করবেন না |
| 🚪 | ফেজ গেট: ডক-সিঙ্ক, রিভিউ, UAT স্ক্রিপ্ট, ট্যাগ | `/css-gate N` দিয়েও চালানো যায় |
| 🧑‍⚖️ | আপনার সিদ্ধান্ত লাগবে (টেমপ্লেট দেওয়া আছে) | উত্তরগুলো বসিয়ে পেস্ট করুন |

---

## ০. এক নজরে

- **মোট টাস্ক:** ৭৮টি (Phase 0: ২৩ · Phase 1: ১৭ · Phase 2: ১০ · Phase 3: ৭ · Phase 4: ৭ · Phase 5: ৭ · Phase 6: ৭)। প্রতিটি টাস্ক একটি "controlled change request", মাস্টার প্রম্পট §15 অনুযায়ী।
- **গেট:** প্রতিটি ফেজের শেষে বাস্তব ব্যবহারকারীর পরীক্ষা (ব্লুপ্রিন্ট D১)। গেট পার না হলে পরের ফেজ নয়। Phase 3 (শীতবস্ত্র/ইফতার পাইলট) থেকে মাঠে ব্যবহার, তাই ডিপ্লয়মেন্ট Phase 3-এর শুরুতেই (T3.0)।
- **Claude Code-এর "স্মৃতি":** `CLAUDE.md` (প্রতি সেশনে স্বয়ংক্রিয়ভাবে লোড হয়, ভেতরে `@docs/MASTER_PROMPT.md` import) + `docs/STATUS.md` (প্রতি টাস্কের শেষে Claude হালনাগাদ করে) + `docs/` ডকুমেন্ট + git log। এজন্য মাস্টার প্রম্পট প্রতি সেশনে পেস্ট করতে হবে না।
- **সময়সীমা:** মাস্টার প্রম্পট অনুযায়ী নেই; মান ও ধারাবাহিকতা আগে। তবু হিসাবের সুবিধার জন্য: Phase 0 প্রায় ২২ সেশন, বাকি ফেজ মিলিয়ে ৫৫ সেশন; জটিল টাস্ক একাধিক সেশনে ভাঙতে হতে পারে।
- **প্রস্তাবিত স্ট্যাক (আপনার অনুমোদন সাপেক্ষ, T0.7):** pnpm monorepo · Next.js PWA + Tailwind + next-intl · NestJS REST + Prisma + PostgreSQL 16 · pg-boss (background jobs) · MinIO (ফাইল) · Nodemailer/SMTP · SMS adapter · Docker Compose · Vitest/Supertest/Playwright/k6/axe। যুক্তি §২.১-এ।

---

## ১. তিন ডকুমেন্টের বিশ্লেষণ

### ১.১ কোন ডকুমেন্ট কী কাজ করে, কীভাবে পরস্পরকে ধরে আছে

- **ব্লুপ্রিন্ট** = *কী* বানাতে হবে। Part A (কার্যক্রম: ভূমিকা, নিবন্ধন, প্রকল্প সেটআপ, আবেদন, ছয় ধরনের প্রকল্প-কার্যপ্রবাহ, দাওয়াহ, মনিটরিং/SOP/মিডিয়া, ড্যাশবোর্ড), Part B (টেকনিক্যাল: ডেটা মডেল, ফর্ম প্ল্যাটফর্ম, ভূমিকা × স্কোপ, ওয়ার্কফ্লো ইঞ্জিন, বাজেট বাকেট, অফলাইন PWA, নিরাপত্তা, স্ট্যাক, পারফরম্যান্স), Part C (৪৭টি প্রশ্ন, সবগুলোর অবস্থা "সিদ্ধান্ত হয়েছে"; C৩-এ Phase 0 গেটের তালিকা), Part D (Phase 0–6 ও কাজের পদ্ধতি), পরিশিষ্ট ক (পরিভাষা), খ (বর্তমান দুই ফর্মের ফিল্ড ম্যাপিং — এটি ফর্ম প্ল্যাটফর্মের সিড ডেটার উৎস)।
- **মাস্টার প্রম্পট** = *কীভাবে* বানাতে হবে। ব্লুপ্রিন্টের সিদ্ধান্তগুলোকে ৪৯টি BD-তে সংক্ষেপ করেছে, precedence (§0), নীতি (§2: no guessing / no silent change / tested means executed), ডকুমেন্ট তালিকা (§3), স্কোপ, ভূমিকা, রোডম্যাপ, আর্কিটেকচার, ডিজাইন টোকেন, স্ট্যান্ডার্ড, টেস্টিং, রিপোর্ট টেমপ্লেট (§15) ও স্টার্টআপ (§16)।
- **প্রম্পট লাইব্রেরি** = *কোন ক্রমে*। P0 (শুরু) → P1 (ডিসকভারি) → P2 (আর্কিটেকচার) → P3 (ডেটাবেস) → P4 (API) → P5 (ডিজাইন সিস্টেম/i18n) → P6 (১৭টি মডিউল) → P7 (টেস্টিং) → P8 (প্রোডাকশন) + §A নিয়মিত প্রম্পট।

তিনটি মিলিয়ে ভিত্তি খুব শক্ত: ব্যবসায়িক নিয়ম স্পষ্ট, সিদ্ধান্তগুলো লিখিত, কাজের শৃঙ্খলা ঠিক করা। মূল ঘাটতি ছিল **Claude Code-এর বাস্তবতা** (সেশনভিত্তিক স্মৃতি, CLAUDE.md, plan mode, slash command, permission) অনুযায়ী সাজানো, এবং লাইব্রেরির ক্রম ও রোডম্যাপের মধ্যে কিছু অমিল। নিচে সব।

### ১.২ অসঙ্গতি ও ফাঁক যা পেলাম, এবং এই প্ল্যানে কী করা হলো

| # | কী পেলাম | কোথায় | কী করা হলো |
|---|---|---|---|
| a | সিদ্ধান্তের গণনা তিন রকম: Part C-তে প্রশ্ন ১–৪৭; মাস্টার প্রম্পটে BD-01…49 (নতুন করে সাজানো, ১:১ নয়); লাইব্রেরি P1.3 বলছে "47 decisions in Part C" | ব্লুপ্রিন্ট C১–C২, মাস্টার §7, charity_ERP P1.3 | DECISION_LOG-এ দুটি সিরিজ (Q-01…47 ও BD-01…49) পরস্পর রেফারেন্সসহ রাখা হবে (T0.5) |
| b | লাইব্রেরি "MASTER PROMPT §33, §34, §49" উল্লেখ করে; মাস্টার প্রম্পটে §0–§18 পর্যন্ত আছে | charity_ERP P6 ভূমিকা, P8.2, §B | সব রেফারেন্স §15 (রিপোর্ট টেমপ্লেট + Definition of Done) ও §14 (টেস্টিং)-এ ঠিক করা হয়েছে |
| c | §9-এ backend "[TO BE FILLED]" — Claude Code দিয়ে করলে প্রথম কোডের আগেই আটকে যাবে | মাস্টার §9 | starter-kit-এর `docs/MASTER_PROMPT.md` §9-এ প্রস্তাবিত স্ট্যাক বসানো আছে "proposed" হিসেবে; T0.7-এ আপনি অনুমোদন দিলে চূড়ান্ত। যুক্তি §২.১ |
| d | মাস্টার প্রম্পটের শেষ লাইন "Now begin with the STARTUP PROCEDURE" — CLAUDE.md দিয়ে প্রতি সেশনে লোড হলে Claude প্রতিবার স্টার্টআপ করতে চাইবে | মাস্টার §16 শেষ লাইন | শেষ লাইন বদলে: STATUS.md-এ Phase 0 শুরু না হলে তবেই স্টার্টআপ, নইলে সেশন-রিচুয়াল |
| e | ডিপ্লয়মেন্ট (P8.1) লাইব্রেরির একদম শেষে, অথচ রোডম্যাপে Phase 3 থেকেই মাঠে ব্যবহার | charity_ERP P8.1 বনাম মাস্টার §8 / ব্লুপ্রিন্ট D১ | T3.0-তে ডিপ্লয়মেন্ট পাইপলাইন, staging, ব্যাকআপ-রিস্টোর পাইলটের আগে; Phase 6-এ চূড়ান্ত হার্ডেনিং (T6.5) |
| f | স্বাবলম্বী (Phase 4) পরীক্ষা-পাশে টাকা পাঠানোর গেট আছে, কিন্তু পরীক্ষা দাওয়াহ মডিউলের অংশ (Phase 5) | মাস্টার BD-27 বনাম §8 Phase 4/5 | T4.2-এ ন্যূনতম exam activity (অফিসিয়াল দায়ী ফল লেখেন); T5.1-এ পূর্ণ দাওয়াহ একই টেবিল ব্যবহার করবে |
| g | লাইব্রেরিতে নেই: repo scaffold/toolchain, API backbone (envelope, audit writer, jobs, storage/notification adapter), ফাইল সার্ভিস, নোটিফিকেশন বাস্তবায়ন, এক্সপোর্ট সার্ভিস, My Work হোম, নিয়মাবলি-সম্মতি flow, প্রকল্পে স্বেচ্ছাসেবক অ্যাসাইন ও পারমিশন সেট, টিম অ্যাসাইন, ভলান্টিয়ার/উপকারভোগী ট্যাব, ক্লোজ/রিওপেন, ফলো-আপ মূল্যায়ন, SECURITY_POLICY.md (§3-এ আছে, প্রম্পট নেই), permissions.yaml, workflow-template সংজ্ঞা, লোকেশন ডেটাসেট, পাইলটের আগে লোড টেস্ট, গেট/UAT প্রম্পট, ম্যানুয়াল ও হ্যান্ডওভার | — | যোগ: T1.1, T1.6, T2.1, T1.14, T2.8, T1.15, T1.12, T1.10, T1.11, T5.3, T0.21, T0.10, T0.11, T1.2, T3.4, প্রতি ফেজের গেট, T6.7 |
| h | ডকুমেন্ট রেজিস্টার: মাস্টার Phase 5, ব্লুপ্রিন্ট D১ Phase 6, কিন্তু C৩ বলছে চেকলিস্ট/সময়সীমা/কোড Phase 1 ডিজাইনের আগে চূড়ান্ত | মাস্টার §8, ব্লুপ্রিন্ট C৩, D১ | ডেটা মডেল Phase 0 (ERD); O-34 অনুযায়ী চেকলিস্ট-টেমপ্লেট এডিটর ও পূর্ণ রেজিস্টার (T5.4) সবার শেষে, Phase 6-এর রিপোর্টিং (T6.1)-এর পরে ও সিকিউরিটি অডিট (T6.3)-এর আগে |
| i | ব্লুপ্রিন্টের ভেতরের অসঙ্গতি: B৩ স্তর-টেবিলে "উপকারভোগী মাস্টার প্রোফাইল … মোবাইল নম্বর ইউনিক", অথচ B৩-এর শেষ অংশ, প্রশ্ন ২১ ও BD-01 বলছে মোবাইল পরিচয় নয়, একই মোবাইল একাধিক প্রোফাইলে থাকতে পারে (সতর্কবার্তা) | ব্লুপ্রিন্ট B৩ টেবিল | T0.7-এ উত্তর আগে থেকেই লেখা: মোবাইল ইউনিক নয়; টেবিলের লেখা পুরোনো |
| j | P3.2 Phase 0-তেই মাইগ্রেশন লিখতে বলে, অথচ Phase 0 = "No code before sign-off" | charity_ERP P3.2 বনাম মাস্টার §8 | ভাগ: T0.16 (ডেটা ডিকশনারি), T1.2 (Prisma schema + migrations) |
| k | P5.1/P5.2 (ডিজাইন সিস্টেম, i18n) ডক ও কোড এক প্রম্পটে | charity_ERP P5 | T0.19/T0.20 ডক; T1.4/T1.5 কোড |
| l | P6.17 admin লাইব্রেরির শেষে, কিন্তু রোডম্যাপ Phase 1-এ "admin settings" এবং নিসাব ভার্সনিং Phase 4-এর আগে দরকার | মাস্টার §8 Phase 1 | T1.13 core admin; T6.2 বাকি অংশ |
| m | এক্সপোর্ট রোডম্যাপে Phase 2, লাইব্রেরিতে শুধু P6.16 (শেষে) | মাস্টার §8 Phase 2 | T2.8 এক্সপোর্ট সার্ভিস, ফিল্ড-লেভেল সুরক্ষাসহ |
| n | নামের ভিন্নতা: "মনিটরিং অফিসার" (ব্লুপ্রিন্ট) = "Monitoring Team" (মাস্টার); RM = RPM; প্রজেক্ট অফিসার = প্রজেক্ট এক্সিকিউটিভ | পরিশিষ্ট ক, A৪ | CLAUDE.md-এ সমার্থক হিসেবে লেখা; কোড ও ডকে মাস্টার §5-এর ইংরেজি নাম |
| o | Figma নেই (মালিক ১০ অক্টোবর জানিয়েছেন), অথচ মাস্টার §12 "approved mockups" বলত; SOP v2.3-এর পূর্ণ টেক্সট নেই (শুধু সারাংশ); কুরবানী SSL শীটের নমুনা নেই | মাস্টার §12, §17; ব্লুপ্রিন্ট A১০, A৮.৬ | ডিজাইন ইন্টারভিউ থেকে `docs/ui/DESIGN_BRIEF.md`; T0.19b-তে ব্রাউজারে দেখার HTML মকআপ; রং ও ফন্ট ওয়েবসাইট থেকে নেওয়া (`docs/ui/brand/colors.md`), লোগো `docs/ui/brand/`-এ; SOP `docs/source/`, নমুনা শীট `docs/source/samples/`; না থাকলে সংশ্লিষ্ট টাস্কে Claude জিজ্ঞেস করবে |

### ১.৩ যা ভালো আছে (বদলানো হয়নি)

- মাস্টার প্রম্পটের নীতি ও স্ট্যান্ডার্ড (§2, §13, §14, §15) হুবহু রাখা হয়েছে; শুধু §3-এ কয়েকটি কাজের-ডকুমেন্ট যোগ, §9-এ স্ট্যাক প্রস্তাব, শেষ লাইন সংশোধন (starter-kit-এর কপিতে "Version 1.1" হেডারে লেখা)।
- ৪৯টি BD সিদ্ধান্ত ব্লুপ্রিন্টের সাথে মিলিয়ে দেখা হয়েছে (যেমন BD-13 ↔ প্রশ্ন ৩১, BD-14 ↔ ২৭, BD-15 ↔ ২৬, BD-28 ↔ ২৯/৩০, BD-33 ↔ ৪৭, BD-36/37 ↔ A১০ SOP ৬–৭); কোনো বিরোধ পাইনি। ব্লুপ্রিন্টে "(প্রস্তাবিত)" লেখা কিছু বিষয় (মার্জ নিয়ম, Rejected/Implementation/Completed স্টেট, রিওপেন, প্রোফাইল সংশোধন অনুরোধ) মাস্টার প্রম্পটে অনুমোদিত হিসেবে আছে; Claude সেগুলোকে অনুমোদিত ধরবে (precedence §0: DECISION_LOG > মাস্টার প্রম্পট > ব্লুপ্রিন্টের "প্রস্তাবিত")।
- লাইব্রেরির প্রম্পট-লেখার ধরন (একটাই পরিবর্তন, কী করবেন না, রিপোর্ট দিন) ঠিক; সেগুলো পরিমার্জিত ও সম্পূর্ণ করা হয়েছে, বাদ দেওয়া হয়নি। পরিশিষ্ট A-তে P-id → T-id ম্যাপ।

### ১.৪ ব্লুপ্রিন্টে যা অস্পষ্ট — Claude স্টার্টআপে জিজ্ঞেস করবে, আমার প্রস্তাবিত উত্তর (T0.7-এ ব্যবহার করুন)

| # | অস্পষ্টতা | প্রস্তাবিত উত্তর |
|---|---|---|
| ১ | উপকারভোগীর মোবাইল ইউনিক কি না (B৩ টেবিল বনাম BD-01) | ইউনিক নয়; একই মোবাইল একাধিক প্রোফাইলে হলে সতর্কবার্তা; স্বেচ্ছাসেবকের নিজের নম্বর ব্লক (BD-03) |
| ২ | BEN-ID ও APP-ID-এর ফরম্যাট (উদাহরণ BEN-000123, APP-2026-00125, SBL-2026-00012) | BEN-NNNNNNN (৭ অঙ্ক, বছর ছাড়া — এক মানুষ এক আইডি); আবেদন: প্রকল্পের কোড-বছর-ক্রম (প্রকল্প সেটআপে কোড, যেমন WNT-2026-00125); প্রকল্পের কোড ইউনিক |
| ৩ | মনিটরিং সতর্কবার্তার N দিন (রিভিউ/অনুমোদন অপেক্ষায়, নিষ্ক্রিয়, বাজেট %) | ডিফল্ট: রিভিউ ৭ দিন, অনুমোদন ৫ দিন, আপডেট নেই ৭ দিন, নিষ্ক্রিয় স্বেচ্ছাসেবক ১৪ দিন, বাজেট ৯০%; সব admin সেটিংয়ে বদলানো যায় |
| ৪ | পাসওয়ার্ড নিয়ম, সেশনের মেয়াদ, লকআউট | ন্যূনতম ৮ অক্ষর; access token ১৫ মিনিট, refresh ৩০ দিন (ডিভাইসভিত্তিক, বাতিলযোগ্য); ৫ বার ভুলে ১৫ মিনিট লক; ভূমিকা বদলালে সেশন রিফ্রেশ (B৮) |
| ৫ | RPO/RTO (§10 বলছে আপনি প্রস্তাব দেবেন, IT অনুমোদন দেবে) | RPO ২৪ ঘণ্টা (দৈনিক ব্যাকআপ) শুরুতে, WAL আর্কাইভিং চালু হলে ১ ঘণ্টা; RTO ৪ ঘণ্টা; মাসিক রিস্টোর মহড়া |
| ৬ | অফলাইনে ফোনে কতটুকু ডেটা থাকবে, কত দিন | অ্যাসাইন করা প্রকল্পের বর্তমান ফর্ম ভার্সন, নিজের উপকারভোগী/আবেদন তালিকা, সিলেবাস, লোকেশন তালিকা (B৭); ছবি সর্বোচ্চ ২০০ MB কিউ; লগআউট/রিমোট রিভোকে সব মুছবে |
| ৭ | public link-এর (বৃক্ষরোপণ) অপব্যবহার রোধ | rate limit + একই NID/মোবাইলে একাধিক এন্ট্রি হলে "যাচাই দরকার"-এ জমা; CAPTCHA এখন নয় |
| ৮ | লোকেশন মাস্টারের উৎস (৬৪ জেলা, ৪৯৫ উপজেলা, ইউনিয়ন, ওয়ার্ড) | ওপেন ডেটাসেট থেকে CSV (T1.2-এ Claude সংগ্রহ করবে), পরে বিভাগ মিলিয়ে দেখবে; ওয়ার্ড ঐচ্ছিক, ফাঁকা রাখা যাবে |
| ৯ | রেটিংয়ের "গড়" (A৫ বলছে প্রোফাইলে সব প্রকল্পের রেটিং ও গড়; BD "never averaged") | প্রকল্পভিত্তিক রেটিং + একই কাজের ধরনের (আবেদন-বিতরণ বনাম দাওয়াহ) গড় আলাদা; দুই ধরনের মধ্যে কখনো গড় নয় |
| ১০ | দাওয়াহ ক্লাসে পরিবারের সদস্যদের উপস্থিতি (প্রস্তাবিত) | হ্যাঁ: আবেদনের রিপিট-গ্রুপে থাকা পরিবারের সদস্য ধরে উপস্থিতি রাখা যাবে; রিপোর্টে উপকারভোগী ও সদস্য আলাদা |

### ১.৫ ঝুঁকি ও প্রতিকার

| ঝুঁকি | প্রতিকার (এই প্ল্যানে কোথায়) |
|---|---|
| পরিধি বিশাল; একজন মানুষ + Claude Code | ফেজ ও গেট মানা; এক টাস্ক এক সেশন; টাস্কের ভেতরে ধাপে ভাঙা (CLAUDE.md নিয়ম) |
| Claude Code-এর সেশনভিত্তিক স্মৃতি: আগের সেশন মনে থাকে না | CLAUDE.md + STATUS.md + docs/ = স্মৃতি; `/css-start` ও `/css-end` রিচুয়াল; প্রতিটি সিদ্ধান্ত DECISION_LOG-এ |
| তিনটি কঠিন ইঞ্জিন: ফর্ম প্ল্যাটফর্ম, ওয়ার্কফ্লো ইঞ্জিন, অফলাইন সিঙ্ক | Phase 0-তে আলাদা ডিজাইন ডক (T0.11, T0.12, T2.3 স্পেসিফিকেশন), লজিক `packages/shared`-এ একবার, YAML/JSON-এ কনফিগারেশন; §২.৫ |
| "টেস্ট পাশ করেছে" দাবি | CLAUDE.md: আউটপুটসহ দেখাতে হবে; আপনি নিজে `pnpm test` চালান; CI সবুজ |
| NID/ব্যাংক/ডোনার ডেটা ফাঁস | authorization-matrix টেস্ট (T1.8), এক্সপোর্টেও একই ফিল্টার (T2.8), security audit (T6.3) |
| বিতরণের দিনে ২,০০০ স্বেচ্ছাসেবক | k6 লোড টেস্ট পাইলটের আগে (T3.4), পেজিনেশন ও ক্যাশিং (NFR) |
| বাইরের নির্ভরতা: লোকেশন ডেটা, SMS প্রোভাইডার, SMTP, সার্ভার, লোগো ও ফন্ট ফাইল, SOP, ডোনার শীট | §৩ M4 তালিকা; যে টাস্কে দরকার সেখানে উল্লেখ |
| ব্লুপ্রিন্ট বদলালে Claude পুরোনো তথ্যে কাজ করবে | `docs/source/ERP_BLUEPRINT_BN.md` হালনাগাদ + `/css-change` দিয়ে প্রভাব বিশ্লেষণ |
| লম্বা টাস্কে context শেষ হয়ে যাওয়া | টাস্ক ভাঙা, `/compact`, STATUS.md-এ অগ্রগতি লিখে রাখা; বড় টাস্কগুলো (T2.3–T2.7) দুই সেশনে করা স্বাভাবিক |

---

## ২. ব্রেনস্টর্মিং: কৌশলগত সিদ্ধান্ত

### ২.১ প্রস্তাবিত টেক স্ট্যাক (T0.7-এ আপনার অনুমোদন দরকার)

মাস্টার প্রম্পট §9 ইতিমধ্যে অনুমোদন করেছে: PostgreSQL + JSONB, React (Next.js) PWA, versioned REST + openapi.yaml, নিজস্ব সার্ভারে ফাইল স্টোরেজ, background jobs, dev/test/staging/production। বাকি ফাঁকা জায়গাগুলো এভাবে পূরণের প্রস্তাব (starter-kit-এর `docs/MASTER_PROMPT.md` §9-এ লেখা আছে):

| স্তর | প্রস্তাব | কেন | বিকল্প (বাদ দেওয়ার কারণসহ) |
|---|---|---|---|
| Monorepo | pnpm workspaces: `apps/web`, `apps/api`, `packages/shared`, `packages/ui`, `packages/config` | এক রিপোতে সব; business logic (স্কোর, যাকাত, বাজেট হিসাব, পারমিশন নাম, zod schema) `packages/shared`-এ একবার লেখা, API ও UI দুই জায়গায় ব্যবহার (মাস্টার §13: "no duplicated calculations") | দুই আলাদা রিপো: contract সিঙ্ক রাখা কঠিন |
| Frontend / PWA | ~~Next.js (App Router)~~ Vite + React 19 + TypeScript SPA with React Router (D-073, 2026-10-11); Tailwind CSS (§12 টোকেন CSS variable হিসেবে); next-intl (bn/en); TanStack Query; react-hook-form + zod; Serwist (service worker); Dexie (IndexedDB outbox) | §9-এ Next.js অনুমোদিত; অফলাইন/PWA টুলিং পরিণত; Claude Code এই স্ট্যাক ভালো জানে | Vite + React SPA: হালকা, কিন্তু §9 Next.js বলে |
| Backend / API | NestJS + TypeScript; `@nestjs/swagger` → OpenAPI; Passport-JWT; validation pipeline (zod বা class-validator, একটিই) | ব্লুপ্রিন্ট B১-এর ১০টি কোর মডিউল → NestJS module; guard = permission × scope সরাসরি প্রকাশ করা যায়; OpenAPI স্বয়ংক্রিয়, drift test সম্ভব | Next.js route handlers (এক অ্যাপ, কিন্তু REST versioning, jobs, OpenAPI দুর্বল); Fastify (হালকা, কাঠামো কম — একক ডেভেলপারের জন্য NestJS-এর শৃঙ্খলা বেশি কাজে লাগে) |
| ORM / migrations | Prisma + PostgreSQL 16; প্রতিটি migration-এর সাথে হাতে লেখা `down.sql` | `schema.prisma` = ERD-এর কোড রূপ (ডক-কোড সিঙ্ক সহজ); টাইপ-সেফ; লাইব্রেরি P3.2-এর "reversible migrations" চাহিদা down.sql দিয়ে পূরণ | Drizzle (হালকা, কম পরিণত migration), TypeORM (up/down আছে, কিন্তু বাগপ্রবণ) |
| Background jobs | pg-boss | PostgreSQL-ই কিউ; Redis-এর মতো বাড়তি সার্ভিস নেই ("simplest adequate architecture", §2) | BullMQ + Redis: বেশি ক্ষমতা, কিন্তু আরেকটি সার্ভিস চালাতে হয় |
| ফাইল স্টোরেজ | MinIO (self-hosted, S3-compatible) + presigned expiring URL; টেস্টে local-filesystem adapter | §9-এর "signed, expiring URLs only after permission check" সরাসরি পাওয়া যায়; ব্যাকআপ/মিরর ও স্টোরেজ বৃদ্ধি (BD-46) সামলানো সহজ | শুধু filesystem: সহজ, কিন্তু signed URL নিজে বানাতে হয়, বছরে বছরে ছবি জমলে ব্যবস্থাপনা কঠিন |
| ইমেইল / SMS | Nodemailer + সংস্থার SMTP (dev-এ Mailpit); SMS: provider-agnostic adapter interface + dev-এ logging stub | BD-47; প্রোডাকশনের আগে প্রোভাইডার বসালেই চলবে, কোড বদলাবে না (প্রশ্ন ১১) | — |
| টেস্টিং | Vitest, React Testing Library, Supertest, Playwright, MSW, k6, axe-core | মাস্টার §14 ও লাইব্রেরি P7.1-এর তালিকা | — |
| Dev infra | Docker Compose (postgres, minio, mailpit); CI আপনার Git hosting-এ (GitHub Actions / GitLab CI / Gitea Actions) | runtime-এ cloud-নির্ভরতা নেই (BD-45); CI যেকোনো জায়গায় চলতে পারে | — |
| Production | Docker Compose + Caddy (স্বয়ংক্রিয় TLS) সংস্থার সার্ভারে; `pg_dump` + WAL আর্কাইভ + MinIO mirror ব্যাকআপ | এক সার্ভারে সব, IT টিমের জন্য সহজ | Kubernetes: এই আকারে অপ্রয়োজনীয় |

**যদি আপনার IT টিম অন্য স্ট্যাক চায়** (যেমন Laravel/PHP বা Django): T0.7-এ শুধু সেটা লিখে দিন; Claude মাস্টার §9 ও ADR বদলে বাকি সব টাস্ক একইভাবে চালাবে, কারণ টাস্কগুলো স্ট্যাক-নিরপেক্ষভাবে লেখা। তবে PWA/অফলাইনের জন্য frontend React/Next.js-ই থাকা উচিত (ইতিমধ্যে অনুমোদিত)।

### ২.২ রিপোজিটরির কাঠামো (T1.1-এ Claude এটি তৈরি করবে)

```text
css-erp/
├── CLAUDE.md                      ← Claude Code প্রতি সেশনে পড়ে; ভেতরে @docs/MASTER_PROMPT.md
├── .claude/
│   ├── settings.json              ← permission allowlist
│   └── commands/                  ← /css-start, /css-end, /css-fix, /css-change, /css-bug, /css-review, /css-docsync, /css-status, /css-gate, /css-uat
├── docs/
│   ├── MASTER_PROMPT.md           ← সংবিধান (v1.1)
│   ├── STATUS.md                  ← সেশন হ্যান্ডঅফ (Claude লেখে)
│   ├── MASTER_SPEC.md · PROJECT_RULES.md · MODULE_CATALOG.md · BUSINESS_RULES.md · DECISION_LOG.md · NON_FUNCTIONAL_REQUIREMENTS.md
│   ├── source/                    ← ERP_BLUEPRINT_BN.md, images/, SOP, samples/, data/
│   ├── architecture/              ← SYSTEM_ARCHITECTURE, AUTH, WORKFLOW_ENGINE, OFFLINE_SYNC, FILES_AND_DOCUMENTS, NOTIFICATIONS, ADR/, workflow-templates/
│   ├── database/                  ← ERD.md, erd.mermaid, DATABASE_SCHEMA.md
│   ├── api/                       ← API_STANDARDS.md, openapi.yaml
│   ├── security/                  ← RBAC.md, permissions.yaml, SECURITY_POLICY.md
│   ├── ui/                        ← DESIGN_BRIEF.md, DESIGN_SYSTEM.md, SCREENS.md, I18N.md, mockups/ (HTML), brand/
│   ├── testing/                   ← TEST_STRATEGY.md, uat/
│   ├── gates/                     ← PHASE_N_SIGNOFF / RELEASE_NOTES
│   └── ops/                       ← DEPLOYMENT.md, RUNBOOK.md
├── apps/
│   ├── web/                       ← React PWA, Vite SPA (D-073; officials desktop + volunteers mobile, এক কোডবেস)
│   └── api/                       ← Express 5 REST /api/v1 (D-074), Prisma, pg-boss workers
├── packages/
│   ├── shared/                    ← zod schemas, permission names, i18n keys, pure business rules (score, zakat, budget, form evaluator)
│   ├── ui/                        ← design system components + tokens
│   └── config/                    ← eslint, tsconfig, prettier
├── infra/                         ← docker-compose (dev/prod), Caddyfile, backup scripts
└── .github/ (বা .gitlab-ci.yml)   ← CI
```

### ২.৩ Claude Code দিয়ে কাজের পদ্ধতি (এটিই এই প্ল্যানের মূল)

**ক. স্মৃতি কীভাবে কাজ করে।** Claude Code-এর প্রতিটি সেশন শূন্য থেকে শুরু হয়; আগের সেশনের কথা মনে থাকে না। তাই "স্মৃতি" হলো ফাইল: `CLAUDE.md` (স্বয়ংক্রিয়ভাবে লোড; ভেতরের `@docs/MASTER_PROMPT.md` লাইনটি মাস্টার প্রম্পটকে import করে), `docs/STATUS.md` (কোথায় আছি, পরের টাস্ক কী), `docs/DECISION_LOG.md`, বাকি `docs/`, আর `git log`। এজন্য লাইব্রেরির "প্রতি সেশনে মাস্টার প্রম্পট পেস্ট করুন" ধাপটি আর লাগে না। (আপনার Claude Code সংস্করণ `@` import না বুঝলে CLAUDE.md-এর শেষ লাইনের বদলে মাস্টার প্রম্পটের পুরো লেখা বসিয়ে দিন।)

**খ. একটি টাস্কের জীবনচক্র (প্রতিবার একই):**

1. নতুন সেশন খুলুন (টার্মিনালে রিপো ফোল্ডারে `claude`, বা ডেস্কটপ অ্যাপের Code ট্যাবে রিপো ফোল্ডার খুলে) অথবা আগের সেশনে `/clear` দিন। এরপর `docs/MODEL_GUIDE.md` থেকে টাস্কের মডেল ও effort বেছে নিন; সেশনের মাঝখানে বদলাবেন না।
2. `/css-start` — Claude STATUS.md পড়ে বলবে কোথায় আছি, পরের টাস্ক কোনটি।
3. **Plan mode চালু করুন** (Shift+Tab চাপতে থাকুন যতক্ষণ না নিচে "plan mode" দেখা যায়; টার্মিনালে `claude --permission-mode plan` দিয়েও শুরু করা যায়)। এ মোডে Claude শুধু পড়ে ও পরিকল্পনা করে, কিছু বদলায় না।
4. এই ফাইল থেকে টাস্কের প্রম্পট পেস্ট করুন। Claude মাস্টার §15 অনুযায়ী বলবে: কী পেল, কী বদলাবে, কী বদলাবে না, ঝুঁকি, কোন টেস্ট।
5. প্ল্যান পড়ুন। প্রশ্ন থাকলে উত্তর দিন (নতুন সিদ্ধান্ত হলে `/css-change` দিয়ে)। ঠিক থাকলে অনুমোদন দিন (plan mode থেকে বেরোলে Claude কাজ শুরু করে)।
6. কাজ চলার সময় permission prompt এলে পড়ে অনুমোদন দিন। `.claude/settings.json`-এর allowlist-এ থাকা কমান্ড (pnpm test, git commit ইত্যাদি) জিজ্ঞেস করবে না।
7. শেষে `/css-end` — টেস্ট রান, STATUS.md, ডক আপডেট, commit, §15 রিপোর্ট (বাংলায়)।
8. রিপোর্টের "Tests" অংশে আসল কমান্ড ও আউটপুট আছে কি না দেখুন; "Decisions needed" থাকলে উত্তর দিন; "Remaining issues" STATUS.md-এ গেছে কি না দেখুন।
9. সন্তুষ্ট হলে পরের টাস্ক; নইলে `/css-fix` বা `/css-bug`।

**গ. slash command (starter-kit `.claude/commands/`):** `/css-start`, `/css-end`, `/css-fix <ব্যাখ্যা>`, `/css-change <সিদ্ধান্ত>`, `/css-bug <বিবরণ>`, `/css-review <module>`, `/css-docsync`, `/css-status`, `/css-gate <N>`, `/css-uat <phase/module>` (পরে ফিডব্যাক পেস্ট)। আপনার সংস্করণে এগুলো `/project:css-start` নামে দেখালে সেভাবেই দিন।

**ঘ. context-শৃঙ্খলা।** এক সেশনে এক টাস্ক; দুই টাস্ক একসাথে নয়। সেশন লম্বা হলে `/compact`। বড় টাস্ক (T2.3–T2.7, T3.1, T4.4) দুই সেশনে হতে পারে: প্রথম সেশনের শেষে `/css-end` দিলে STATUS.md-এ "T2.3 step 3 of 6 done" লেখা থাকবে, পরের সেশনে একই প্রম্পট আবার দিয়ে বলবেন "Continue T2.3 from STATUS.md"।

**ঙ. Git.** `main` ব্রাঞ্চে ছোট ছোট commit (প্রতি টাস্কে এক বা একাধিক); চাইলে ফেজপ্রতি ব্রাঞ্চ (`phase-1`) ও গেটে merge। গেটে ট্যাগ `gate-phase-N`। আপনি কোড না পড়লেও `git log --oneline` ও রিপোর্ট পড়ুন; বড় পরিবর্তনে Claude-কে বলুন "এই commit-এর diff বাংলায় সংক্ষেপে বলো"।

**চ. permission ও নিরাপত্তা।** `--dangerously-skip-permissions` ব্যবহার করবেন না। allowlist-এ শুধু নিরাপদ কমান্ড; `deny`-তে `git push --force`, `git reset --hard`, `rm -rf`, `.env` পড়া। প্রোডাকশন সার্ভারে Claude Code চালাবেন না; ডিপ্লয় স্ক্রিপ্ট Claude লিখবে, চালাবেন আপনি/IT।

**ছ. মডেল ও চিন্তা।** কোন টাস্কে কোন মডেল ও effort, তা `docs/MODEL_GUIDE.md`-এ টাস্ক ধরে ধরে লেখা আছে। সংক্ষেপে: নকশা, নিরাপত্তা ও ফেজ গেটে `fable`; বড় ও সূক্ষ্ম কাজে `opus`; নিয়মিত বাস্তবায়নে `opusplan`; UI ও টেস্টে `sonnet`। ঝুঁকির টাস্কের শেষে আলাদা মডেলে `/css-review`। Fable-এর আলাদা সাপ্তাহিক সীমা আছে, তাই `ছাড় নেই` চিহ্নিত সারি ছাড়া অন্যগুলোতে সীমা ফুরোলে `opus` `xhigh` চলে। রিভিউ ও অডিট টাস্কে Claude subagent ব্যবহার করতে পারে (`/css-review`-এ বলা আছে)।

**জ. আপনার যাচাই (প্রতি টাস্কে "শেষে দেখে নিন" অংশ)।** আপনি কোড না জানলেও তিনটি জিনিস দেখতে পারেন: (১) রিপোর্টে টেস্ট রান-এর আউটপুট, (২) `pnpm dev` দিয়ে ব্রাউজারে পর্দাটি নিজে চালিয়ে দেখা (Claude বলবে কোন URL, কোন demo account), (৩) `/css-docsync`-এ mismatch শূন্য।

**ঝ. যখন Claude ভুল পথে যায়।** `Esc` দিয়ে থামান; `/css-fix` দিয়ে কোথায় ব্লুপ্রিন্টের সাথে মিলছে না বলুন; কখনো "যেভাবে হোক চালিয়ে দাও" বলবেন না — মাস্টার §2-এর "no silent change" তখন ভাঙে। নতুন ব্যবসায়িক নিয়ম Claude নিজে বানাবে না; বানালে সেটা bug হিসেবে ধরুন।

**ঞ. মকআপ (Figma নেই)।** আপনার Figma ফাইল নেই, তাই T0.19b-তে Claude ব্রাউজারে ক্লিক করে দেখা যায় এমন HTML মকআপ বানাবে: `docs/ui/mockups/index.html` ব্রাউজারে খুলুন এবং ফোন ও ডেস্কটপ মাপে দেখুন। রং ও ফন্ট ওয়েবসাইট থেকে নেওয়া হয়েছে (`docs/ui/brand/colors.md`); লোগো ও ফন্ট ফাইল `docs/ui/brand/`-এ রাখুন। মতামত দিয়ে ঠিক করিয়ে অনুমোদন দিন। ডিজাইনের সিদ্ধান্তগুলো `docs/ui/DESIGN_BRIEF.md`-এ।

### ২.৪ ফেজ, গেট ও টাস্ক-ম্যাপ

| Phase | লক্ষ্য (মাস্টার §8 / ব্লুপ্রিন্ট D১) | টাস্ক | গেটে কারা পরীক্ষা করবেন |
|---|---|---|---|
| 0 · Requirement & Architecture Freeze | সব ডকুমেন্ট, ERD, API চুক্তি, পর্দার তালিকা, ওয়ার্কফ্লো টেমপ্লেট, খোলা প্রশ্নের উত্তর; **কোনো অ্যাপ কোড নয়** | T0.1–T0.22 (T0.19b সহ) | ম্যানেজমেন্ট সাইন-অফ (বাংলা সারাংশ T0.22) |
| 1 · Foundation | scaffold, DB, সিড, ডিজাইন সিস্টেম, i18n, API backbone, auth/সেশন, RBAC/পারমিশন প্যানেল, নিবন্ধন-অনুমোদন-হ্যান্ডওভার, ভলান্টিয়ার/উপকারভোগী ট্যাব, প্রোগ্রাম-প্রকল্প সেটআপ, টেমপ্লেট/সম্মতি/অ্যাসাইন, admin core, নোটিফিকেশন, My Work | T1.1–T1.17 | অফিসিয়াল টিম |
| 2 · Beneficiary + Application + Form + Offline | ফাইল সার্ভিস, উপকারভোগী মাস্টার, ফর্ম ইঞ্জিন ও বিল্ডার, ওয়ার্কফ্লো ইঞ্জিন ও আবেদন, আবেদনের নিয়ম, অফলাইন PWA, এক্সপোর্ট | T2.1–T2.10 | স্বেচ্ছাসেবক ও RPM |
| 3 · Winter/Iftar Pilot | ডিপ্লয়মেন্ট, বিতরণ কার্যপ্রবাহ, খরচ-ভাউচার-পরিশোধ-লেজার, প্রকল্প ড্যাশবোর্ড, লোড টেস্ট; এক রিজিওনে পাইলট → সব | T3.0–T3.6 | পাইলট রিজিওন (RPM, স্বেচ্ছাসেবক) |
| 4 · Project-specific Workflows | ঘর নির্মাণ+ইস্যু লগ, স্বাবলম্বী (যাকাত, পরীক্ষা-গেট), নিরাপদ পানি, বৃক্ষরোপণ, কুরবানী, অ্যাক্টিভিটি ইঞ্জিন ও বাজেট পূর্ণাঙ্গ | T4.1–T4.7 | প্রকল্পভিত্তিক টিম (ক্রম অগ্রাধিকার অনুযায়ী বদলানো যাবে, যেমন কুরবানী আগে) |
| 5 · Dawah + Monitoring + Follow-up | দাওয়াহ পূর্ণ, মনিটরিং কন্ট্রোল সেন্টার, অডিট ভিউয়ার, কাজের সারসংক্ষেপ, রেটিং-ক্যাটাগরি-ক্লোজ-ফলো-আপ, মিডিয়া (ডকুমেন্ট রেজিস্টার T5.4 সবার শেষে, O-34) | T5.1–T5.7 | MEAL ও মনিটরিং টিম |
| 6 · Central Reporting & Optimization | ড্যাশবোর্ড/রিপোর্ট, admin বাকি, security ও performance audit, production hardening, go/no-go, ম্যানুয়াল | T6.1–T6.7 | ম্যানেজমেন্ট রিভিউ, IT টিম |

### ২.৫ সবচেয়ে কঠিন তিনটি অংশ ও কৌশল

1. **ফর্ম প্ল্যাটফর্ম (B৩, BD-12…14):** সংজ্ঞা JSON Schema-তে; শর্ত/হিসাবের evaluator `packages/shared`-এ একবার লিখে সার্ভার ও ক্লায়েন্ট দুই জায়গায় একই কোড (নইলে মোবাইলে এক ফল, সার্ভারে আরেক); প্রকাশিত ভার্সন immutable; পরিশিষ্ট খ-এর দুটি বর্তমান ফর্ম সিড-টেমপ্লেট হিসেবে ঢোকানো — এতে বাস্তব ফর্ম দিয়ে পরীক্ষা হয় (T2.3)।
2. **ওয়ার্কফ্লো/অ্যাক্টিভিটি ইঞ্জিন (B৫, BD-11):** স্টেট ও ট্রানজিশন YAML-এ (T0.11), guard-এর বাস্তবায়ন কোডে নাম ধরে রেজিস্টার; ছয় টেমপ্লেট কনফিগারেশন মাত্র; নতুন প্রকল্প-ধরন = নতুন YAML (T2.5)।
3. **অফলাইন সিঙ্ক (B৭, BD-48):** outbox pattern — প্রতিটি রেকর্ডে `client_uuid`, সার্ভারে idempotent; টেক্সট আগে, ছবি আলাদা কিউতে; conflict নিয়ম সার্ভারে; "যাচাই দরকার" স্টেট; Playwright-এ offline emulation দিয়ে টেস্ট (T2.7)।

এই তিনটির প্রতিটিতে Phase 0-এর ডিজাইন ডক ছাড়া কোড লিখতে দেবেন না; Claude প্ল্যানে "ডক থেকে বিচ্যুতি" উল্লেখ করলে আগে ডক ঠিক করুন।

---

## ৩. শুরু করার আগে: আপনার ম্যানুয়াল প্রস্তুতি (Claude ছাড়া)

**M1 · টুল ইনস্টল।** ১০ অক্টোবর ২০২৬ তারিখে আপনার মেশিন যাচাই করা হয়েছে: ✅ Git 2.54 · ✅ Node.js v24.15.0 (প্রস্তাবিত 24 LTS-এর সাথে মেলে) · ✅ Claude Code CLI 2.1.294 · ✅ Docker CLI 29.8, কিন্তু Docker Desktop তখন চালু ছিল না (daemon-এ সংযোগ হয়নি) · ❌ **pnpm নেই**। করণীয়: `npm install -g pnpm` (অ্যাডমিন লাগে না; `corepack enable` অ্যাডমিন টার্মিনাল চায়); T1.1-এর আগে Docker Desktop চালু করুন (WSL2 backend)। VS Code ঐচ্ছিক। Windows 11-এ সব native চলে।

**M2 · রিপোজিটরি তৈরি — ✅ সম্পন্ন (১০ অক্টোবর ২০২৬)।** `D:\Charity Website\Charity_ERP`-এ starter-kit-এর সব ফাইল বসানো, `git init -b main` ও প্রথম commit (`chore: bootstrap docs, blueprint and Claude Code setup`) হয়েছে। আপনার কিছু করার নেই।

**M3 · Git hosting — ✅ সম্পন্ন (১০ অক্টোবর ২০২৬)।** রিপো GitHub-এ আছে: `https://github.com/rajuofficialasf-hub/charity_ERP`, ব্রাঞ্চ `main`। রিপোতে ব্লুপ্রিন্ট ও বিভাগের অভ্যন্তরীণ প্রক্রিয়া আছে, তাই এটি প্রাইভেট রাখুন। CI কোথায় চলবে সেটা T1.1-এ Claude-কে বলবেন।

**M4 · ইনপুট ফাইলগুলো রিপোতে রাখুন** (যা আছে; না থাকলে সংশ্লিষ্ট টাস্কে Claude জিজ্ঞেস করবে)। ফোল্ডারগুলো তৈরি আছে; একই তালিকা টিক-বক্সসহ `docs/source/README.md`-তেও আছে:

| কী | কোথায় রাখবেন | কোন টাস্কে লাগবে |
|---|---|---|
| লোগো ✅ আছে: `docs/ui/brand/logo.png` (৩০০×১৯৬ px) ও `logo.svg` (ভেক্টর, ওয়েবসাইট থেকে)। রং ওয়েবসাইট থেকে নেওয়া হয়ে গেছে, দেখুন `docs/ui/brand/colors.md` | `docs/ui/brand/` | T0.19b, T1.4 |
| ফন্ট ফাইল ✅ ওয়েবসাইটের `/fonts/` থেকে কপি করা হয়েছে (UbuntuSans, Bornomala Regular ও Bold, সাথে লাইসেন্সের লেখা); Bornomala-র উৎস ওয়েবসাইট-নির্মাতার কাছ থেকে নিশ্চিত করুন | `docs/ui/brand/fonts/` | T0.19b, T1.4 |
| SOP v2.3 (সেপ্টেম্বর ২০২৬) — Markdown/PDF | `docs/source/SOP_v2.3_BN.md` বা `.pdf` | T0.4, T5.4 (O-34: সবার শেষে) |
| কুরবানী ডোনার SSL শীটের নমুনা (নাম-ফোন বদলে, ৫–১০ সারি) ও ক্যাশ-ডোনার গুগল ফর্মের ফিল্ড তালিকা | `docs/source/samples/` | T4.4 |
| বর্তমান স্বেচ্ছাসেবক নিবন্ধন ফর্ম ও দুই আবেদন ফর্মের (গুগল ফর্ম) এক্সপোর্ট, কয়েকটি পূরণ করা নমুনা (anonymized) | `docs/source/samples/` | T2.3, T2.9 |
| বাংলাদেশের লোকেশন তালিকা CSV (`division,district,upazila,union`; ওয়ার্ড নেই, O-09) | `docs/source/data/bd-locations.csv` | T1.2 (না থাকলে Claude ওপেন ডেটাসেট থেকে আনবে) |
| প্রতিটি প্রকল্প-ধরনের ডকুমেন্ট চেকলিস্ট (SOP ধারা ৫) ও হার্ড-কপি কোডের নিয়ম (ধারা ৮–৯) | SOP-এর ভেতরেই থাকলে আলাদা লাগবে না | T5.4 (O-34) |

**M5 · সিদ্ধান্ত হাতে রাখুন (T0.7-এ লাগবে):** স্ট্যাক অনুমোদন (§২.১); §১.৪-এর ১০টি প্রস্তাবিত উত্তর; SMTP (dev-এ Mailpit; staging-এ আসল সার্ভার কবে); SMS প্রোভাইডার কবে ঠিক হবে (কুরবানীর আগে); সার্ভারের বিবরণ (Phase 3-এর আগে); প্রকল্প কোড (WNT, IFT, QRB, SBL, HSE, SWT, TRP — প্রস্তাব)।

**M6 · গেটের পরীক্ষক ঠিক করুন:** Phase 1 অফিসিয়াল টিম (হেড/মনিটরিং/PM/RPM/এক্সিকিউটিভ একজন করে), Phase 2 ২০–৩০ স্বেচ্ছাসেবক + RPM, Phase 3 পাইলট রিজিওন, Phase 4 প্রকল্পভিত্তিক, Phase 5 MEAL/মনিটরিং, Phase 6 ম্যানেজমেন্ট + IT। প্রতিটি গেটে Claude বাংলা UAT স্ক্রিপ্ট বানাবে (`/css-gate N`)।

**প্রথম সেশন:** রিপো ফোল্ডারে `claude`, মডেল `fable` ও effort `high` (`docs/MODEL_GUIDE.md`) → `/css-start` (Claude বলবে Phase 0 শুরু হয়নি, পরের টাস্ক T0.1) → Shift+Tab দিয়ে plan mode → T0.1 পেস্ট।

---

## ৪. টাস্ক প্রম্পট — ধাপে ধাপে

প্রতিটি টাস্কের শিরোনামে: আইডি, মোড-চিহ্ন, নাম, `[পুরোনো লাইব্রেরির P-id]`। code block-এর ভেতরের লেখাটুকু Claude Code-এ পেস্ট করবেন।

---

### Phase 0 · Requirement & Architecture Freeze (শুধু ডকুমেন্ট; কোনো অ্যাপ কোড নয়)

> Phase 0-এর প্রতিটি টাস্ক plan mode-এ দিন। Claude কোড লিখতে চাইলে থামান: মাস্টার §8 "No code before sign-off"। ২২টি টাস্ক অনেক মনে হলেও এগুলোই পরের ৫৫ টাস্কের ভিত্তি; এখানে সময় বাঁচালে পরে দশগুণ খরচ হয়।

#### T0.1 📄 স্টার্টআপ (মাস্টার §16) `[P0.1]`
- কখন: একদম প্রথম সেশন। আগে দরকার: M1–M3 শেষ।
- শেষে দেখে নিন: `docs/` ফোল্ডারে §3-এর সব ফাইল আছে (কিছু outline হতে পারে); DECISION_LOG-এ BD-01…49, D-050…053 ও UX-01…13; Claude-এর খোলা প্রশ্নের তালিকা; কোনো `apps/` ফোল্ডার তৈরি হয়নি।

```text
Begin the STARTUP PROCEDURE (constitution §16).
Context: docs/source/ERP_BLUEPRINT_BN.md is the owner's blueprint (auto-converted from the Claude Doc export; the six diagrams are in docs/source/images/ and are referenced inline). The repository contains only docs/, CLAUDE.md, .claude/ and README.md; there is no application code. The proposed stack is in constitution §9: record it in DECISION_LOG.md as D-050…D-053 with status "proposed" and do not treat it as approved yet.
Deliver in this session, in this order, committing after each file so nothing is lost if the context runs out:
1. docs/MASTER_SPEC.md — faithful English specification of the whole blueprint (Parts A, B, C, D and both appendices).
2. docs/PROJECT_RULES.md — the constitution's process rules as a checklist.
3. docs/MODULE_CATALOG.md; docs/BUSINESS_RULES.md (every rule as BR-nnn with its source section); docs/DECISION_LOG.md (BD-01…BD-49, each cross-referenced to the blueprint Part C question numbers ১–৪৭ and to the blueprint sections, plus the owner's design decisions UX-01 to UX-13 imported from docs/ui/DESIGN_BRIEF.md); docs/NON_FUNCTIONAL_REQUIREMENTS.md.
4. Outline files (headings plus one line per section on what it will contain) for every remaining document listed in constitution §3.
5. docs/STATUS.md updated.
Finish with the list of open questions that need my decision — only items affecting business rules, data structure, API contracts, security, permissions, workflows, money or major UX — each with your recommendation. Then stop. Do not write application code. If you cannot finish everything, say exactly which files are complete and which are outlines so I can continue with tasks T0.2–T0.6.
```

#### T0.2 📄 MASTER_SPEC সম্পূর্ণ করা `[P0.2]`
- কখন: T0.1-এ MASTER_SPEC অসম্পূর্ণ/সংক্ষিপ্ত হলে; নইলে বাদ। শেষে দেখে নিন: A১–A১১, B১–B১০, C, D, পরিশিষ্ট খ — সব আছে; "Open Questions" অংশ আছে।

```text
Read docs/source/ERP_BLUEPRINT_BN.md completely (Parts A, B, C, D and both appendices; look at the six diagrams too).
Rewrite docs/MASTER_SPEC.md as a faithful and complete English specification. Required sections: organization and department context; scope and out-of-scope; official roles, volunteer types and data scopes with the default permission matrix (A৪, both tables) and the "My Work" home per role; the three master records; programs → projects → components model, configuration groups, component list, templates and copy/not-copy rules, rules & consent, project lifecycle draft/active/closing/closed (A৬); registration, approval, correction and edit requests, teams, ratings, categories, blocklist, application transfer, staff handover (A৫); application status cycle with who-can-do-what per status, review/approval permissions, field unlock, priority score / quotas / waitlist, beneficiary 360°, beneficiary blocklist, family-duplicate warning and profile merge (A৭); every project-type workflow A৮.১–A৮.৬ including distribution edge states and stock reconciliation; dawah (A৯); monitoring alerts, audit log, work summaries, documentation SOP mapping, media team (A১০); dashboards, KPIs, statistics, downloads (A১১); technical architecture B১–B১০ summarized with the entity tables; Part C decisions as a table; Part D roadmap; appendix খ field mapping as tables.
Naming: RM = RPM = Regional Program Manager; Monitoring Officer = Monitoring Team; Project Officer = Project Executive.
Do not invent anything. Mark every item the blueprint labels "(প্রস্তাবিত)" as PROPOSED and every "(প্রশ্ন N)" with its Part C status. Where the blueprint is silent or contradicts itself, add it to an "Open Questions" section at the end instead of guessing.
```

#### T0.3 📄 মডিউল ক্যাটালগ `[P1.1]`
- কখন: T0.1-এর MODULE_CATALOG পাতলা হলে। শেষে দেখে নিন: প্রতিটি মডিউলে ফেজ ও B১-এর কোর মডিউল লেখা আছে।

```text
Create or complete docs/MODULE_CATALOG.md from the blueprint and MASTER_SPEC.md.
Modules to cover: Auth & Sessions; Users, Roles & Permissions (permission panel, data scopes); Registration & Approval (staff and volunteer, correction and edit requests, handover); Volunteer Management (project assignment, permission sets, teams, ratings, categories, blocklist, transfer, volunteer tab); Beneficiary Master (identity, auto-fill, locked fields and correction requests, family-duplicate warning, merge, blocklist, 360° profile, beneficiary tab); Programs & Projects (setup, components, budget, areas, templates, rules & consent, lifecycle); Form Platform (sections, fields, logic, calculations, versions, public link); Application Workflow (engine, review/approval, field unlock, score/quota/waitlist, transfer, needs-verification); Project Activities (dispatch/receive, distribution & photos, stock reconciliation, construction stages, issue log, site verification, beneficiary payments, vouchers, volunteer expense claims); Budget & Ledger; Qurbani (donors, animals, allocation, photos, donor messages); Dawah (syllabus, classes, attendance, exams, tracking, call log); Documents (SOP register, deficiency reports, quarterly audit); Monitoring & Follow-up; Audit Log; Dashboards, Reports & Exports; Notifications; Files & Media (storage, consent, story tracker); Locations master; i18n; Admin & Settings (incl. nisab, thresholds, SMS provider); Offline Sync.
For each module: purpose, primary users, key entities, dependencies on other modules, which of the ten core modules of blueprint B১ it belongs to, roadmap phase (constitution §8), blueprint sections implemented, and the task ids of the owner's plan if known. Mark anything not covered by the blueprint as "needs decision".
```

#### T0.4 📄 বিজনেস রুল ক্যাটালগ `[P1.2]`
- শেষে দেখে নিন: BR-id ধারাবাহিক; প্রতিটিতে উৎস ও enforcement layer; "gaps" তালিকা আলাদা।

```text
Create or complete docs/BUSINESS_RULES.md.
Extract every business rule from the blueprint (and MASTER_SPEC.md) as a numbered, testable statement BR-001, BR-002… grouped by module. Include the rules hidden inside tables: both permission-matrix tables (A৪), the team member table (A৫), the application status table (A৭), the distribution edge-state table and stock reconciliation (A৮.১), the template copy / not-copy lists (A৬), the monitoring alert table (A১০), the SOP mapping table (A১০), the budget bucket table (B৬), the offline requirements (B৭), the security controls (B৮), the dummy-OTP rule (A৫, B৯), the workflow guard conditions (B৫), and the field mapping rules of appendix খ (mandatory fields, calculated fields, system-filled fields, "অন্যান্য" text box).
For each rule record: id, statement, source (blueprint section and table/paragraph), BD-id if one exists, module, affected entities, enforcement layer (database constraint / service / UI / background job / report), test type (unit / integration / API / E2E / manual / none) and status (approved / proposed / open).
Pay special attention to: NID and birth-registration identity, auto-fill and locked fields, volunteer's own number, family duplicate warning, profile merge, blocklist (both kinds), application transfer, handover, limits and deadlines with extension, photo rules and metadata, duplicate photo warning, priority score / quota / waitlist and the mandatory comment, field unlock, stock reconciliation, budget buckets and fund sources, zakat net-asset computation with nisab snapshot, unique transaction id and single payment per claim, exam-gated payment, voucher lock after verification, animal allocation exclusivity, document deadlines with soft warning and 3 working days, deficiency escalation on the second report within a year, media consent gating "publishable", ratings visibility, category change comment, retention (nothing hard-deleted).
Do not invent rules. List gaps and ambiguities separately at the end.
```

#### T0.5 📄 ডিসিশন লগ (সংশোধিত কাঠামো) `[P1.3]`
- শেষে দেখে নিন: Q-01…47, BD-01…49, D-050… ও UX-01…13 মিলিয়ে চার সিরিজ; প্রতিটি BD-তে Q রেফারেন্স।

```text
Rebuild docs/DECISION_LOG.md with this structure:
1. A header rule: every new architectural or business decision is appended here with id, date, decision, rationale, affected modules and documents, approved-by, before implementation; proposals carry status "proposed" until the owner confirms in chat.
2. Blueprint decisions Q-01…Q-47: one row per Part C question ১–৪৭ (C১ and C২): question, decision, status, blueprint sections affected.
3. Constitution decisions BD-01…BD-49 (§7), each with the Q-ids it derives from (several BDs map to one Q; some BDs come from Part A/B text with no Q — cite the section instead).
4. Technical proposals D-050… from constitution §9 (monorepo, backend, ORM and down.sql migrations, jobs, storage, SMTP/SMS adapters, dev infrastructure) with status "proposed — awaiting owner".
5. The owner's design decisions UX-01 to UX-13 imported from docs/ui/DESIGN_BRIEF.md, status approved, source "owner interview 2026-10-10".
6. An "Open" section listing every question you raised in T0.1 that I have not answered yet, numbered so I can answer by number.
```

#### T0.6 📄 নন-ফাংশনাল চাহিদা `[P1.4]`
- শেষে দেখে নিন: মাপা যায় এমন লক্ষ্য; "PROPOSAL" চিহ্ন।

```text
Create or complete docs/NON_FUNCTIONAL_REQUIREMENTS.md from blueprint B৭, B৮, B১০ and constitution §10:
about 2,000 concurrent volunteers on distribution days; low-end Android (2 GB RAM) and older browsers; 2G/3G and intermittent connectivity; offline-first PWA; image compression and resumable upload; data-usage economy and pagination; session revocation for lost phones; Bangla + English; permanent retention with storage-growth reporting; self-hosted deployment; accessibility.
Add measurable targets where the blueprint gives none — p95 latency for the main field endpoints (NID lookup, application submit, sync batch, today's distribution save), initial JS payload for the volunteer PWA, maximum photo size after compression, offline storage budget per device, RPO/RTO, backup frequency and restore-drill cadence, availability target, load-test pass criteria — and mark each as PROPOSAL needing approval. Reference the owner's answers in DECISION_LOG where they exist.
```

#### T0.7 🧑‍⚖️ আপনার সিদ্ধান্ত (খোলা প্রশ্নের উত্তর) `[A.2-এর ধাঁচে]`
- কখন: T0.1–T0.6-এর পর, Claude-এর খোলা প্রশ্ন পড়ে। §১.৪-এর প্রস্তাবিত উত্তর নিচে বসানো আছে; বদলাতে চাইলে বদলান; Claude যে নম্বরে প্রশ্ন করেছে সেই নম্বরে উত্তর দিন।
- শেষে দেখে নিন: DECISION_LOG-এ প্রতিটি উত্তর নতুন id-সহ; "Open" তালিকা ফাঁকা বা ছোট।

```text
Decisions from the project owner. Record each in docs/DECISION_LOG.md with today's date and a new id, then update every document that depends on it (MASTER_SPEC, BUSINESS_RULES, NFR, architecture outlines) and list the files you changed. Documents only; no code.
1. Technical stack D-050…D-053: APPROVED as proposed in constitution §9. [অথবা: "Change backend to …" ইত্যাদি]
2. Beneficiary mobile number is NOT unique and is not identity (BD-01 governs). The "মোবাইল নম্বর ইউনিক" wording in the blueprint B৩ layer table is legacy. Same mobile on several profiles → warning only; the volunteer's own mobile is blocked (BD-03).
3. Identifiers: BEN-ID = "BEN-" + 7-digit sequence, never reused, no year. Application id = project code + year + 5-digit sequence (e.g. WNT-2026-00125); the project code is set in project setup and unique. Proposed project codes: WNT winter, IFT iftar, MEAT meat distribution, QRB qurbani, SBL self-reliance, HSE house construction, SWT safe water, TRP tree planting.
4. Monitoring thresholds (all editable in admin settings): review pending 7 days, approval pending 5 days, no update from a local দায়ী / volunteer / paid volunteer 7 days, inactive volunteer 14 days, budget alert at 90%.
5. Authentication: minimum password 8 characters with at least one letter and one digit; access token 15 minutes; refresh token 30 days, bound to the device session, revocable; lock for 15 minutes after 5 failed attempts; role or permission change forces session refresh.
6. Backup targets: RPO 24 hours initially (daily backup), 1 hour once WAL archiving is enabled; RTO 4 hours; restore drill monthly.
7. Offline scope on the phone: the assigned projects' current form versions, the volunteer's own beneficiaries and applications, syllabus, locations; photo queue up to 200 MB; everything wiped on logout or remote revocation.
8. Public application link: rate-limited; repeated NID/mobile entries go to "needs verification"; no CAPTCHA for now.
9. Locations master: load from an open dataset (division → district → upazila → union; ward optional and may be empty); the department will verify against the latest official list later.
10. Ratings: per project; averages only within the same kind of work (application/distribution vs dawah), never across the two kinds.
11. Dawah attendance may be recorded for family members listed in the application's family repeat group; reports count beneficiaries and family members separately.
12. [Claude-এর বাকি প্রশ্নের উত্তর, ওর নম্বর ধরে]
```

#### T0.8 📄 সিস্টেম আর্কিটেকচার ও ADR `[P2.1]`
- শেষে দেখে নিন: deployment diagram, request lifecycle-এর চেক-ক্রম, ADR ফোল্ডারে ৬টি ফাইল।

```text
Create docs/architecture/SYSTEM_ARCHITECTURE.md for the approved stack (DECISION_LOG D-050…D-053).
Cover: the single-deployment topology (web PWA, API, PostgreSQL, MinIO, pg-boss workers — decide whether workers run inside the API process or as a separate process and justify it — SMTP, SMS adapter); layering (controllers → application services → domain services and engines → repositories); the ten core modules of blueprint B১ mapped to NestJS modules and Next.js route groups; cross-cutting services (authentication, authorization with scope resolution, audit log, files, notifications, jobs, i18n, exports, locations); the request lifecycle with the exact order of checks (authentication → role → permission → data scope → object-level ASSIGNED/SELF check → field-level filtering); the offline sync flow at a high level (details in OFFLINE_SYNC.md); environments dev / test / staging / production on the organization's server with a deployment diagram; configuration and secrets strategy; logging and monitoring; storage growth reporting. State trade-offs. No microservices, no message bus.
Also write one ADR per technical decision in docs/architecture/ADR/ (ADR-001 monorepo, ADR-002 NestJS, ADR-003 Prisma with hand-written down.sql, ADR-004 pg-boss, ADR-005 MinIO with filesystem adapter for tests, ADR-006 Next.js PWA stack): context, decision, consequences, status.
```

#### T0.9 📄 অথেনটিকেশন ও সেশন `[P2.2]`

```text
Create docs/architecture/AUTH.md.
Cover: mobile-number login with password; registration OTP on mobile and on email as two separate OTPs, with the fixed dummy code in dev/test behind configuration and a clearly separate real-gateway path for production (BD-44, BD-49); password rules; access token plus per-device refresh token stored in device_sessions; session lifetime, refresh, idle timeout, lockout after failed attempts; listing and remote revocation of devices for lost phones (blueprint B১০) and the local-data wipe it triggers; account states pending / active / blocked / deactivated and what each allows (blocked volunteers see the block message at login); role or permission change forcing session refresh; staff handover before deactivation (BD-08); Main Admin protection; rate limiting; every audit event. Use the owner's decisions from DECISION_LOG for password rules, token lifetimes and lockout, and mark anything still open. Design only; no code.
```

#### T0.10 📄 RBAC ও permissions.yaml `[P2.3]`
- শেষে দেখে নিন: `permissions.yaml`-এ প্রতিটি মডিউলের permission; A৪-এর দুই টেবিল ম্যাপ করা; "sensitive" ফিল্ডের তালিকা।

```text
Create docs/security/RBAC.md and docs/security/permissions.yaml.
Model: permission = role × data scope (GLOBAL, PROGRAM, PROJECT, REGION, DISTRICT / UPAZILA / UNION, ASSIGNED, SELF — blueprint B৪). Define granular permission names (resource.action, e.g. application.approve, application.unlock_field, volunteer.block, payment.record, animal.allocate, export.beneficiaries) for every module in MODULE_CATALOG.md. Map the default matrix from blueprint A৪ — both tables: the project roles (PM, RPM, Executive, Volunteer, Team Member, Local দায়ী, Paid Volunteer, plus Department Head and Monitoring Team with full access, Official দায়ী, Implementer) and the Media / Finance / Procurement teams — and the three volunteer permission sets (application + distribution; + dawah; work progress) onto those names. Explain project-level grants, RPM-granted extras ("RM দিলে"), the permission panel (Department Head and Monitoring Team only, every change audited), and "the same person holds different sets on different projects". Specify server-side enforcement: guard declaration per endpoint, scope resolution per role, object-level checks for ASSIGNED and SELF, IDOR prevention, and field-level protection (NID numbers and NID photos, bank details, ratings, categories and their comments, donor data, official form sections, blocklist reasons) applied in serializers and exports alike. Default: deny unless explicitly authorized.
permissions.yaml is machine-readable (name, description, module, default roles with scope, sensitive true/false) and will be loaded by the implementation as the single source of truth; the matrix in RBAC.md must be generated from or verified against it.
```

#### T0.11 📄 ওয়ার্কফ্লো ইঞ্জিন ও ছয় টেমপ্লেট `[P2.4]`
- শেষে দেখে নিন: `workflow-templates/` ফোল্ডারে ৬টি YAML; কোনটি কোড (guard) কোনটি ডেটা, স্পষ্ট।

```text
Create docs/architecture/WORKFLOW_ENGINE.md and the folder docs/architecture/workflow-templates/.
Design the configurable workflow engine of blueprint B৫ and BD-11: common states exactly Draft → Submitted → Under Review → Reviewed → Approved / Rejected → Implementation or Distribution → Completed → Closed, plus Needs Verification for public-link and offline-conflict entries (BD-48) and Waitlisted (BD-17); per-template post-approval stages; transitions with allowed permission names (never role names), guard conditions referenced by name (e.g. photos.required_per_rule, stock.balanced, exam.passed, vouchers.verified, limit.not_exceeded, deadline.open), side effects (ledger entries, notifications, audit, status of linked activities), and the activity model (Distribution, Construction, Purchase, Training, Visit, Payment, Voucher, Expense, Issue, Inspection, Follow-up) with the bulk-update screen pattern (today's distribution / class / construction / visit / follow-up). Define the definition format (YAML validated by a JSON Schema) and write one file per project type: distribution (winter, iftar, meat), construction, advance-voucher (safe water), implementation-evidence-followup (self-reliance), qurbani (beneficiary side reuses distribution; donor/animal side Imported → Animal Allocated → Notified → Photos Sent → Voucher), open-application-visit (tree planting), using the stage names from blueprint A৮ and B৫ and the exceptions (PM final approval in house construction). Show how a new project type is added by configuration only. State explicitly what is code (guard implementations, activity handlers, side-effect handlers) and what is data.
```

#### T0.12 📄 অফলাইন ও সিঙ্ক `[P2.5]`

```text
Create docs/architecture/OFFLINE_SYNC.md based on blueprint B৭ and BD-48.
Cover: what is cached on the device (DECISION_LOG answer), client_uuid idempotency on every offline record, the outbox pattern and sync_status lifecycle pending → syncing → synced / failed with reason and automatic retry with backoff, batch sync endpoint design, text before photos with a separate compressed photo queue and resumable upload, no completion while photos are pending, conflict rules (server wins on approved data; last write wins on drafts and field updates; both versions logged), the offline NID lookup limitation and the "needs verification" path when an existing NID is found at sync, encrypted local storage (key derived from the session) and wipe on logout or remote revocation, form-version handling when a form was republished while the volunteer was offline, sync status UI and the offline banner, and the test strategy (Playwright offline emulation, throttled 3G profile, installed PWA on Android Chrome and on an iPhone).
Cover iOS explicitly (some volunteers use iPhones, UX-06 in docs/ui/DESIGN_BRIEF.md): installed PWA versus a Safari tab, the risk of storage eviction, no background sync (so sync on app open and on reconnect), push only for installed PWAs, a request for persistent storage, Bangla install guidance, and mitigations such as warning before logout or clearing data while records are unsynced.
```

#### T0.13 📄 ফাইল ও ডকুমেন্ট `[P2.6]`

```text
Create docs/architecture/FILES_AND_DOCUMENTS.md.
Cover: file metadata model and entity links; access control (private files only through signed, expiring URLs issued after a permission check; never public links); upload validation (types, sizes, virus-scan hook); image handling (client-side compression, server-side thumbnails, EXIF capture of date/time and GPS for distribution photos, perceptual-hash duplicate detection that warns but never blocks); resumable uploads; storage path conventions (documents: Program → Project → Year → District per SOP ধারা ১০; photos and vouchers under project/application); the SOP-driven document register (per-project checklist from templates, required / if needed / optional, responsible official role — never volunteers, deadline, status chain collection → verification → approval → archived, soft-copy file, hard-copy location code CSS-ALM-… / CSS-LKR-…, retention 5 years from submission), soft warning and 3-working-day countdown then non-compliance (BD-36), deficiency reports with the 11 SOP fields and the central log with automatic escalation on a second report within a year (BD-37), legacy deficiency marking, the quarterly audit report, media consent gating of "publishable" photos (BD-38), and storage growth reporting (BD-46).
Also cover the per-project photo source setting (UX-11 in docs/ui/DESIGN_BRIEF.md): camera only, or camera or gallery with a flag; defaults are camera only for distribution and construction proof and gallery allowed for vouchers and paper documents; how camera only is realised on the web (in-app capture versus the device camera through a file input), the trade-offs on 2 GB Android phones and on iOS, how capture time and GPS are recorded, and how a photo without them is flagged.
```

#### T0.14 📄 নোটিফিকেশন `[P2.7]`

```text
Create docs/architecture/NOTIFICATIONS.md.
Channels: in-app for staff and volunteers, email through the organization's SMTP, SMS through a provider-agnostic adapter (no provider chosen yet; logging stub in dev). Produce the full notification matrix: event → recipients (by role/scope) → channel(s) → template key (bn/en) → phase in which the event exists, covering registration and approvals, edit and correction requests, permission changes, blocklist, handover, project assignment and consent, deadline extensions, application submitted/reviewed/approved/rejected/waitlisted, field unlock requests, transfer, dispatch/receive, stock mismatch, expense claim verified/paid, issue raised/assigned/resolved, exam results, payment recorded, document deadline soft warning and non-compliance, deficiency escalation, monitoring alerts, Qurbani donor pre-notification and photo emails with sent-status tracking, OTP (dummy in dev/test).
Note the approved decisions: beneficiaries receive no notifications for now (BD-47); OTP is dummy in dev/test and real before production (BD-49); volunteers read operational messages such as correction requests and approvals in the app only, with no SMS, WhatsApp or email for them for now (UX-12 in docs/ui/DESIGN_BRIEF.md), while SMS stays for OTP and Qurbani donor messages. Evaluate Web Push for installed PWAs (Android Chrome, iOS 16.4 and later) as an optional enhancement of the in-app channel and recommend yes or no. Define template storage (bilingual data, variables), user preferences, retry and delivery-status logging, and rate limits.
```

#### T0.15 📄 ERD `[P3.1]`

```text
Create docs/database/ERD.md (conceptual and logical) and docs/database/erd.mermaid (Mermaid erDiagram of the same entities).
Derive entities from blueprint B২ and the later additions: programs, projects, project_components, project_areas, project_staff, project_templates, project_quotas, fund_sources, budget_ledger; forms, form_versions, form_sections, form_fields, field_options; applications, application_answers, application_scores, field_changes, application_transfers; beneficiaries, beneficiary_family_members, profile_merges, profile_correction_requests, media_consents; volunteers, volunteer_teams, project_volunteers, volunteer_ratings, volunteer_categories_log, blocklist; users, roles, permissions, user_permissions, device_sessions, handovers, otp_codes; workflow_definitions, workflow_transitions, activities; distributions, stock_movements, construction_stages, issues, site_verifications; payments, expense_claims, expense_items, vouchers; donors, animals, animal_shares, animal_photos, donor_messages; dawah_syllabus_topics, dawah_classes, class_attendance, learning_progress, exams, exam_results, call_logs, followup_evaluations; documents, document_templates, deficiency_reports; media_stories; locations; notifications, notification_templates; files; audit_log; sync_batches.
Show relationships and cardinality, which entities are permanent masters vs project transactions, and the JSONB usages. Flag anything ambiguous instead of guessing; do not add entities without a documented requirement.
```

#### T0.16 📄 ফিজিক্যাল স্কিমা ও ডেটা ডিকশনারি (শুধু ডক) `[P3.2-এর ডক অংশ]`
- শেষে দেখে নিন: প্রতিটি টেবিলের কলাম তালিকা; id ফরম্যাট DECISION_LOG অনুযায়ী; JSONB-এর JSON Schema।

```text
Create docs/database/DATABASE_SCHEMA.md as the data dictionary for PostgreSQL 16 — documents only, migrations come in Phase 1 (task T1.2).
Include: naming conventions (snake_case, uuid primary keys, *_at timestamps in UTC, created_by/at and updated_by/at audit columns everywhere); human ids (BEN-, project-code-prefixed application ids, per DECISION_LOG) with their generation strategy; table-by-table columns with types, nullability, defaults and comments; reference tables instead of Postgres enums for anything configurable (statuses, beneficiary types, expense categories, issue types, document statuses); unique constraints (nid, birth_reg, payment transaction_id, client_uuid, one animal → one assigned volunteer, one application per beneficiary per project); check constraints; the BD-03 rule (beneficiary mobile ≠ submitting volunteer's mobile) and how it is enforced at database level; indexes for the main query paths (lists by project/region/status, NID lookup, audit by entity, today's distribution); JSONB columns with a JSON Schema for each (application_answers, component settings, workflow definitions, form field logic, handover scope, score criteria); soft-delete policy (nothing hard-deleted; where a "deleted" flag is allowed); retention; partitioning or archiving considerations for audit_log and files given permanent retention.
```

#### T0.17 📄 API স্ট্যান্ডার্ড `[P4.1]`

```text
Create docs/api/API_STANDARDS.md: versioning (/api/v1), resource naming, request/response envelope, pagination (cursor or offset — choose and justify), filtering, sorting, searching, validation errors with codes and localized messages (bn/en by Accept-Language and user preference), error code catalogue, idempotency keys for offline sync and payments, rate limiting (auth, OTP, public forms), auth headers and token refresh, file upload and signed URL conventions, bulk-update endpoint pattern, export job pattern (async with download link), audit requirements per endpoint, OpenAPI annotations required on every endpoint (operationId, x-permission, x-scope, request/response schemas, error responses), and the rule that breaking changes need impact analysis, approval, OpenAPI update, migration and tests.
```

#### T0.18 📄 OpenAPI (Phase 1–2 এন্ডপয়েন্ট) `[P4.2]`
- শেষে দেখে নিন: ফাইলটি valid (Claude linter চালিয়ে দেখাবে); প্রতিটি এন্ডপয়েন্টে x-permission।

```text
Create docs/api/openapi.yaml covering the Phase 1 and Phase 2 modules: auth & OTP & device sessions, users, roles & permissions & permission panel, registration & approval & edit/correction requests & handover, volunteers (tab, profile, assignment, teams, blocklist, transfer), beneficiaries (tab, lookup by NID / birth registration, profile 360°, correction requests, merge, blocklist), programs, projects & components & areas & staff & templates & consent, forms & versions & public link, applications & workflow transitions & field unlock & scores & waitlist, activities (generic), files (upload, signed URL), notifications (inbox), exports (jobs), locations, settings (nisab, thresholds), sync (batch endpoints).
Each endpoint: operationId, auth requirement, x-permission (name from docs/security/permissions.yaml), x-scope, request shape, response shape, error behaviour with codes, idempotency where applicable, pagination. Validate the file with an OpenAPI linter and keep it valid. Later phases extend this file; never break an existing contract silently.
```

#### T0.19 📄 ডিজাইন সিস্টেম ডক ও পর্দার তালিকা `[P5.1-এর ডক অংশ]`
- আগে দরকার: `docs/ui/DESIGN_BRIEF.md` ও `docs/ui/brand/colors.md` (দুটোই আছে); লোগো ও ফন্ট ফাইলও আছে। শেষে দেখে নিন: SCREENS.md-এ §12-এর প্রতিটি key screen + প্রতি ভূমিকার My Work।

```text
Create docs/ui/DESIGN_SYSTEM.md and docs/ui/SCREENS.md. Documents only; no code.
Inputs: constitution §12 tokens and component list; docs/ui/DESIGN_BRIEF.md (the owner's decisions UX-01 to UX-13 and the mockup set); docs/ui/brand/colors.md (colour tokens, contrast checks and fonts taken from the website: use them and do not invent colours) and the logo files in docs/ui/brand/ (logo.svg and logo.png).
DESIGN_SYSTEM.md: tokens as CSS variables (colors, spacing, radius, typography with UbuntuSans, Bornomala and a sans-serif fallback at weights 400 and 700 (UX-13), elevation, breakpoints), the component inventory with props, states, sizes and accessibility behaviour for every base component of §12, layout patterns per device as in DESIGN_BRIEF section 5 (officials work equally on desktop and phone, UX-03; setup screens are desktop first, UX-04), the bulk-update list, review detail with timeline, form renderer, mobile-first rules for 2 GB Android phones and iPhones, Bengali typography rules (line-height, truncation; numbers always use English digits, UX-05), empty / loading / error / offline states, and a theming note for a future dark theme.
SCREENS.md: every key screen of §12 plus the My Work home per role (blueprint A৪) and the registration, consent, permission panel, document register, issue log, donor list and today's class screens: purpose, roles, data shown, actions and the permission each needs, states, components used, phone, tablet and desktop layouts, and the phase in which it is built.
```

#### T0.19b 📄 ক্লিক-করা-যায় এমন HTML মকআপ (Figma-র বদলে) `[নতুন; ব্লুপ্রিন্ট D২]`
- আগে দরকার: T0.19; `docs/ui/DESIGN_BRIEF.md`; `docs/ui/brand/colors.md` (আছে); লোগো (`logo.svg`, `logo.png`) ও ফন্ট ফাইল (`fonts/`) `docs/ui/brand/`-এ আছে।
- শেষে দেখে নিন: ব্রাউজারে `docs/ui/mockups/index.html` খুলে ৩৬০, ৭৬৮ ও ১২৮০ px-এ প্রতিটি পর্দা দেখুন; আপনার লোগো, ফন্ট ও রং এসেছে কি না; ফোনে অফিসিয়াল পর্দাগুলো পড়া ও চালানো যায় কি না; সংখ্যা সবখানে ইংরেজি অঙ্কে। মতামত দিয়ে ঠিক করিয়ে নিন, তারপর অনুমোদন দিন (Phase 0 গেটের শর্ত)।

```text
Build clickable HTML mockups for the owner's approval (blueprint D২ and the Phase 0 deliverable "main screen mockups"). Static files only: HTML, CSS and a little vanilla JavaScript; no build step, no network access or CDN at view time, and no application code under apps/ or packages/.
Inputs: docs/ui/DESIGN_BRIEF.md (owner decisions UX-01 to UX-13 and the mockup set in its section 6), docs/ui/DESIGN_SYSTEM.md and SCREENS.md, constitution §12, the blueprint, docs/ui/brand/colors.md (the colour tokens and fonts, taken from the website) and the logo at docs/ui/brand/logo.svg (vector, use it everywhere) with docs/ui/brand/logo.png as a fallback (300 by 196 px, never upscaled).
Create docs/ui/mockups/: index.html listing every screen with its role and phase and a viewport switcher (360, 768 and 1280 px preview frames); tokens.css and components.css built from the design system tokens as CSS variables, so a brand colour change is a one-line edit; a local fonts/ folder with copies of the font files from docs/ui/brand/fonts/ (UbuntuSans declared for weights 400 to 700, Bornomala Regular 400 and Bold 700; do not subset or rename them in the mockups) so nothing loads from the internet at view time; and one HTML file per screen of the pilot set in DESIGN_BRIEF.md section 6, in Bangla with realistic fake data (obviously fake NIDs, phone numbers and names). English digits everywhere (UX-05).
Make them clickable, not functional: navigation between screens, tabs, filter sheets, the NID lookup that auto-fills after a sample number is typed, the duplicate warning, approve / waitlist / reject with a reason dialog, field unlock, an offline banner toggle, the in-app camera frame with capture time and GPS stamp, and live toggles in the form builder preview.
Rules: volunteer and official screens work at 360 px (tables become cards, filters in a bottom sheet, sticky action bar); setup screens are desktop first and show a "best on a larger screen" notice on phones (UX-03, UX-04); semantic HTML, labels, visible focus, colour contrast AA using the tokens of colors.md (the dark green for small text on green); no screens beyond the pilot set.
Verify: render every page at 360, 768 and 1280 px with a headless browser (for example Playwright through npx) or the desktop app's browser pane, look at the screenshots, and fix what breaks. List any deviation from the design system. Commit. Then tell me how to open the mockups and stop. Apply my feedback in follow-up commits, and when I approve, record "Phase 0 mockups approved" with the date in docs/DECISION_LOG.md.
```

#### T0.20 📄 i18n ডক `[P5.2-এর ডক অংশ]`

```text
Create docs/ui/I18N.md. Bangla and English are both first-class and switchable per user. Define: message catalogue structure (namespaced keys such as application.approve), the rule that no user-facing string is hard-coded (labels, buttons, validation, notifications, errors, statuses, menus, reports, email and SMS templates) and how a test or lint rule enforces it; server-side localization of API messages; number and date formatting (all numbers use English digits 0-9 in both languages, UX-05; one central formatting utility so Bengali digits could be added later by a new decision; optional Hijri date display behind a setting that is off by default); bilingual data fields (form labels, section names, option lists, status and stage names, document names) and how they are stored and rendered; fallback rules; export and PDF localization including font embedding; the process for adding a third language without rewriting.
```

#### T0.21 📄 টেস্ট স্ট্র্যাটেজি ও সিকিউরিটি পলিসি `[P7.1 + নতুন]`

```text
Create docs/testing/TEST_STRATEGY.md and docs/security/SECURITY_POLICY.md.
TEST_STRATEGY: the testing pyramid for this project; tools (Vitest, React Testing Library, Supertest, Playwright, MSW, k6, axe-core); what each layer must cover — BR unit tests, integration, API contract tests against openapi.yaml with a drift test, E2E critical journeys from constitution §14, load tests for distribution-day concurrency, accessibility, visual regression for key screens, security tests including the authorization matrix and IDOR, data-integrity tests (unique constraints, idempotency, migration up/down), smoke tests per deployment; test data strategy (deterministic seeds, factories, never production data); coverage expectations per layer; the CI gate; how BUSINESS_RULES.md tracks test status; what each phase gate must run.
SECURITY_POLICY: the OWASP baseline mapped to this system; authentication and session rules (from AUTH.md); authorization and field-level protection (from RBAC.md); input validation; file upload rules; secrets management; logging without sensitive data; dependency scanning; error handling without stack traces or SQL; audit requirements (constitution §13); data retention (BD-46); backup and restore responsibilities; incident response basics; the pre-production checklist (real OTP gateways on and dummy off, seed data removed, Main Admin protected, backups verified by restore, audit logging active).
```

#### T0.22 🚪 Phase 0 গেট: সামঞ্জস্য যাচাই ও সাইন-অফ প্যাকেজ `[A.5 + নতুন]`
- শেষে দেখে নিন: `docs/gates/PHASE_0_SIGNOFF.md`-এর বাংলা সারাংশ ম্যানেজমেন্টকে দেখান; ট্যাগ `gate-phase-0`। সাইন-অফ পেলে Phase 1।

```text
Phase 0 gate.
1. Cross-check every document of constitution §3 against each other and against the blueprint: contradictions, gaps, stale items, inconsistent names (roles, states, permission names, entity names). Fix the documents (never the blueprint) and record anything that needed a decision as "open" in DECISION_LOG.md.
2. Confirm every open question is answered; list the ones that are not, with your recommendation.
3. Verify the Phase 0 gate list of blueprint C৩ is covered: role and scope model with the default matrix; component list and common workflow states with the template exceptions; form platform (section library, standard fields, versioning, mandatory fields, beneficiary type options); budget bucket model, cost per beneficiary, volunteer expense categories and approval rule; offline conflict rules; security, audit and retention; stack and hosting; document checklist, deadlines and storage codes; ratings method, category list, close/reopen and follow-up; nisab handling; SMS provider timing; the owner's design decisions UX-01 to UX-13 reflected in the design documents; the HTML mockups approved by the owner (blueprint D১, Phase 0) with that approval recorded in DECISION_LOG.md.
4. Write docs/gates/PHASE_0_SIGNOFF.md: an English checklist plus a one-page Bengali summary for management describing exactly what is being frozen.
5. Update docs/STATUS.md (Phase 0 complete pending sign-off; next task T1.1), commit, and tag gate-phase-0. Do not start Phase 1 work.
```

---

### Phase 1 · Foundation

> Phase 0 সাইন-অফের পর। প্রতিটি 🛠 টাস্ক: plan mode → প্ল্যান অনুমোদন → কাজ → `/css-end`। প্রতিটি টাস্কের ভেতরে টেস্ট ও ডক আপডেট বাধ্যতামূলক (মাস্টার §15); প্রম্পটে আলাদা করে না বললেও Claude তা করবে, না করলে `/css-fix`।

#### T1.1 🛠 রিপোজিটরি scaffold ও toolchain `[নতুন]`
- আগে দরকার: M1–M3; Docker Desktop চালু। শেষে দেখে নিন: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` সবুজ (রিপোর্টে আউটপুট); `docker compose up -d` চলে; CLAUDE.md-এর "Repository map" ভরা।

```text
Scaffold the repository exactly per docs/architecture/SYSTEM_ARCHITECTURE.md and the approved stack (DECISION_LOG D-050…D-053). No business features in this task.
- pnpm workspace monorepo: apps/web (Next.js App Router, TypeScript, PWA-ready with Serwist configured but no offline features yet; manifest name "চ্যারিটি ও সোশ্যাল সার্ভিস" per UX-09, short name CSS until the owner decides), apps/api (NestJS, TypeScript, Prisma initialised, /api/v1 prefix, health endpoint), packages/shared, packages/ui, packages/config (eslint, prettier, tsconfig base).
- infra/: Docker Compose for dev with postgres 16, minio (+ bucket bootstrap), mailpit; .env.example files for api and web (never real secrets); root package.json scripts: dev, build, test, e2e, lint, typecheck, db:migrate, db:seed, db:reset (dev only, guarded).
- Testing toolchain proven with one passing sample test per layer: Vitest unit (packages/shared), Supertest API (health endpoint), React Testing Library (a ui component), Playwright E2E (home page loads, mobile and desktop projects), MSW set up for web tests, axe-core helper.
- CI pipeline for [GitHub Actions / GitLab CI / Gitea Actions — আপনারটা লিখুন]: install, lint, typecheck, unit + API tests with a Postgres service, build; E2E on main.
- README.md (English) with setup, scripts and troubleshooting; CONTRIBUTING.md with the commit convention; fill in the "Repository map and commands" section of CLAUDE.md.
Prove it: run pnpm install, pnpm lint, pnpm typecheck, pnpm test and pnpm e2e and show the outputs. Commit in small steps (chore(scaffold): …).
```

#### T1.2 🛠 ডেটাবেস স্কিমা, migrations ও লোকেশন মাস্টার `[P3.2-এর কোড অংশ]`
- শেষে দেখে নিন: `prisma/schema.prisma` ERD-এর সাথে মেলে; প্রতিটি migration ফোল্ডারে `down.sql`; লোকেশন টেবিলে ৬৪ জেলা, ~৪৯৫ উপজেলা; up/down টেস্ট সবুজ।

```text
Implement the physical database from docs/database/DATABASE_SCHEMA.md and ERD.md:
- Prisma schema for every documented entity (no undocumented tables); initial migration(s) each with a hand-written down.sql; audit columns everywhere; unique constraints (nid, birth_reg, payment transaction_id, client_uuid, one animal → one assigned volunteer, one application per beneficiary per project); check constraints; indexes on the documented query paths; the BD-03 rule (beneficiary mobile ≠ submitting volunteer's mobile) enforced at database level as documented; reference tables for configurable lists; JSONB columns validated in the service layer against the JSON Schemas of DATABASE_SCHEMA.md (put the schemas in packages/shared).
- Locations master (division → district → upazila → union; four levels, no ward, O-09) loaded by a script from docs/source/data/bd-locations.csv. If that file is missing, obtain the data from an open dataset (for example the public "bangladesh-geocode" style datasets), convert it to our CSV (columns: division_code, division_bn, division_en, district_code, district_bn, district_en, upazila_code, upazila_bn, upazila_en, union_code, union_bn, union_en; no ward, O-09), record the source and licence in docs/source/data/README.md, and flag in STATUS.md that the department must verify the list against the latest official BBS geocode.
- Data-integrity tests: every unique constraint, the BD-03 constraint, soft-delete behaviour, and a migration up → down → up round trip on an empty database.
Update DATABASE_SCHEMA.md and ERD.md if the implementation needed any change, and explain why in the report.
```

#### T1.3 🛠 সিড ফ্রেমওয়ার্ক ও ডেমো ডেটা `[P3.3]`
- শেষে দেখে নিন: `pnpm db:seed` দুবার চালালে একই ফল; কোনো আসল NID/মোবাইল নেই।

```text
Create the deterministic seed framework for development and test (never production; the seed runner must refuse to run when NODE_ENV=production or when the database name does not match the dev/test pattern).
Seed sets: "base" (roles and permissions generated from docs/security/permissions.yaml; workflow definitions from docs/architecture/workflow-templates/; document checklist templates are not seeded now (the documentation module is built last, O-34; T5.4 seeds them from the SOP); beneficiary type defaults BD-14; expense categories; issue types; notification templates bn/en; the two current application forms of blueprint appendix খ as form templates — data only, the form engine arrives in Phase 2) and "demo" (one Department Head as Main Admin, one Monitoring Team user, one PM per program, two RPMs, one Project Executive, one Official দায়ী, one Implementer, one procurement, one media and one finance user, 20 volunteers including one দাঈ-স্বেচ্ছাসেবক, one local দায়ী, one team member linked by NID reference and one paid volunteer, 50 beneficiaries spread over two divisions, one draft winter project with components enabled).
All NIDs, birth registration numbers, mobiles and emails must be obviously fake yet pass format validation; passwords documented in docs/testing/DEMO_ACCOUNTS.md (dev only). Factories for tests in packages/shared or apps/api test utils. Tests: seeding twice is idempotent; base seed matches permissions.yaml exactly.
Later tasks extend the demo set as entities become functional.
```

#### T1.4 🛠 ডিজাইন সিস্টেম বাস্তবায়ন `[P5.1-এর কোড অংশ]`
- আগে দরকার: T0.19 ও T0.19b (অনুমোদিত HTML মকআপ), এবং UX-14 অনুযায়ী প্রিমিয়াম চেহারায় নতুন করা মকআপ ও DESIGN_SYSTEM.md — মালিকের অনুমোদনসহ (T1.4-এর আগে Claude এটি মনে করিয়ে দেবে)। শেষে দেখে নিন: `/dev/components` গ্যালারিতে §12-এর সব কম্পোনেন্ট; ৩৬০px-এ ঠিক দেখায়; axe টেস্ট সবুজ।

```text
Implement packages/ui from docs/ui/DESIGN_SYSTEM.md: tokens from docs/ui/brand/colors.md as CSS variables and a Tailwind preset bound to them; UbuntuSans and Bornomala at weights 400 and 700 with a sans-serif fallback (self-hosted files from docs/ui/brand/fonts/ with their licence texts; UbuntuSans declared for weights 400 to 700 and either shipped unmodified or subset to Latin letters, digits and punctuation with its internal font name suffixed derivative CSS ERP as Ubuntu Font Licence clause 2(c) requires; font-display swap; no external CDN at runtime); and every base component of constitution §12: Button (primary/secondary/danger/ghost), Badge/Status, Card/Stat, Field (text, textarea, number, phone, select, combobox, date, file), Form layout, Nav/Item, Row/Toggle, Table with filters/search/pagination, Modal, Drawer, Confirm dialog, File upload with preview, Alert, Tabs, Breadcrumb, Empty/Loading/Error states, Offline banner, Bulk-update list row with checkbox, Step/timeline, Progress bar.
Each component: typed props, keyboard and screen-reader support, visible focus, tests with React Testing Library plus axe, and an entry in a dev-only /dev/components gallery route in apps/web with both languages. Mobile-first; verify every component at 360×640 and 1280×800. Match the approved HTML mockups in docs/ui/mockups/ and note any deviation. No page or feature work in this task.
```

#### T1.5 🛠 i18n বাস্তবায়ন `[P5.2-এর কোড অংশ]`
- শেষে দেখে নিন: ভাষা সুইচে গ্যালারি বাংলা/ইংরেজি হয়; hard-coded string ধরার টেস্ট আছে।

```text
Implement the i18n system per docs/ui/I18N.md: bn and en message catalogues (namespaced JSON) in packages/shared, the t() integration in apps/web (next-intl), server-side localization of API error and notification messages (Accept-Language and user preference), number and date formatting utilities (English digits in both languages, UX-05; Taka display O-42; 12-hour time O-43; no Hijri date, O-43), bilingual-data helpers for form labels and status names, a per-user language switch persisted on the profile, and a test or lint rule that fails on hard-coded user-facing strings in apps/web and on keys missing in either language. Convert every existing string in the scaffold and the gallery. Tests for the formatting utilities, the fallback behaviour and the missing-key detector.
```

#### T1.6 🛠 API backbone ও cross-cutting services `[নতুন]`
- শেষে দেখে নিন: OpenAPI drift test আছে; audit writer service; pg-boss sample job চলে; MinIO adapter টেস্ট।

```text
Implement the API backbone in apps/api per docs/api/API_STANDARDS.md and SYSTEM_ARCHITECTURE.md: response envelope; error codes with localized messages; validation pipeline (one library, consistently); pagination, filtering, sorting and search helpers; idempotency-key middleware with stored keys and replay-safe responses; rate limiting for auth, OTP and public endpoints; request logging that never logs sensitive fields; OpenAPI generation from decorators with a test that fails when the generated spec drifts from docs/api/openapi.yaml; the audit-log writer service (actor, action, entity, entity id, before/after, reason, ip/device, client_uuid) that every write path must call; the background-job runner (pg-boss) with one sample job and a scheduled job pattern; the storage adapter interface with the MinIO implementation (signed expiring URLs) and a local-filesystem implementation for tests; the notification adapter interfaces (in-app, email SMTP via Nodemailer, SMS stub) without templates; health and readiness endpoints including storage and queue checks.
Tests for each piece. Document the patterns in SYSTEM_ARCHITECTURE.md under "Cross-cutting services" and add a short "how to add an endpoint" guide to CONTRIBUTING.md.
```

#### T1.7 🛠 অথেনটিকেশন, ইউজার, ডিভাইস সেশন `[P6.1-এর অংশ ১]`
- শেষে দেখে নিন: ব্রাউজারে লগইন/OTP/ডিভাইস তালিকা চলে (demo account); negative API টেস্ট আছে; audit entry দেখা যায়।

```text
Implement authentication per docs/architecture/AUTH.md: login with mobile number or email and password; the OTP service with the fixed dummy code in dev/test behind configuration and a separate real-gateway adapter path (BD-44, BD-49) with a loud startup warning when dummy mode is on; account states pending / active / blocked / deactivated; password rules; access and refresh tokens with device_sessions (list my devices, revoke one, officials with permission revoke another user's device); lockout after repeated failures; logout and remote revocation wiping the device session; role or permission change forcing refresh; user CRUD for admins with Main Admin protection.
Web screens using packages/ui: login, OTP step, device list, change password. Tests: unit for rules, API tests for every endpoint including negative cases and lockout, E2E login/logout. Audit entries for login failures, revocations and role changes. Update openapi.yaml.
```

#### T1.8 🛠 ভূমিকা, পারমিশন, স্কোপ, পারমিশন প্যানেল `[P6.1-এর অংশ ২]`
- শেষে দেখে নিন: authorization-matrix টেস্ট রিপোর্ট (প্রতিটি endpoint × প্রতিটি role); পারমিশন প্যানেল পর্দা; audit।

```text
Implement RBAC per docs/security/RBAC.md and permissions.yaml: roles, permission grants with data scope (GLOBAL / PROGRAM / PROJECT / REGION / DISTRICT / UPAZILA / UNION / ASSIGNED / SELF), project-level permission sets for volunteers, the server-side guard that every endpoint declares (permission name + scope resolution + object-level ASSIGNED/SELF check), field-level protection filters applied in serializers and later reused by exports (NID numbers and photos, bank details, ratings, categories and comments, donor data, official form sections, blocklist reasons), the permission panel screen (Department Head and Monitoring Team only; grant or revoke any permission for anyone, per project where applicable; every change audited with reason), and Main Admin protection (cannot be deleted, demoted or locked out via CRUD).
Tests: an authorization matrix test that runs every registered endpoint against every role (and against unauthenticated) and asserts allow/deny per the default matrix; IDOR tests across regions and projects; field-level tests on responses. Default: deny. Update openapi.yaml x-permission values from permissions.yaml automatically.
```

#### T1.9 🛠 কর্মী ও স্বেচ্ছাসেবক নিবন্ধন, অনুমোদন, সংশোধন, ব্লকলিস্ট, হ্যান্ডওভার `[P6.2]`
- শেষে দেখে নিন: মোবাইলে নিবন্ধন ফ্লো (OTP দুটি → ফর্ম → পেন্ডিং); অফিসিয়াল ট্যাব থেকে অনুমোদন/সংশোধন অনুরোধ; হ্যান্ডওভার ছাড়া deactivate হয় না।

```text
Implement staff and volunteer registration and approval per MASTER_SPEC A৫ and BD-44, BD-06, BD-08:
- Registration: mobile OTP and email OTP as two separate steps (dummy in dev/test), then the full form — name, father's and mother's name, NID, WhatsApp, address (cascading locations), education, experience, work details, previous projects, Facebook id, optional bank details, reference (team member gives the main volunteer's NID; the system shows that volunteer's name when it matches), volunteer type (general / local দায়ী / both / paid), photo and NID photo; staff registration uses the same form plus designation, program and region. Mobile-first using the form renderer primitives of packages/ui (the dynamic form engine comes in Phase 2; this form is static).
- Approval: pending state visible in the volunteer tab; approve or send a field-level correction request (only the flagged fields reopen; the volunteer fixes and resubmits); approvers per DECISION Q-19; staff approval and role assignment by Department Head or Monitoring Team.
- Profile rules: before approval only own profile with the "not yet in any project" message; after approval no direct edits — edit request flow approved by RPM or Project Executive, field reopened, then locked again.
- Blocklist for volunteers (RPM and above, reason mandatory, lift with reason): no new applications, no new assignments, loses visibility of own applications, block message at login; blocklist filter in the volunteer tab. (Beneficiary blocklist comes in T2.2.)
- Staff handover before deactivation: marking "to be deactivated" shows the pending-work list (reviews/approvals, projects of their district/region, documents in their name, issues, follow-ups — items that do not exist yet are stubbed behind an interface so later modules plug in), per-item reassignment or one-click reassign-all, handover record kept, then deactivation (login off, history intact).
Field-level protection for bank and NID data; audit on every step; notifications hooks for T1.14. Tests: unit, API (positive and negative per role), E2E registration → approval. Update openapi.yaml.
```

#### T1.10 🛠 স্বেচ্ছাসেবক ট্যাব ও উপকারভোগী ট্যাব `[নতুন; A৫, A৭]`
- শেষে দেখে নিন: সারা দেশের তালিকা, ফিল্টার, পরিসংখ্যান; স্বেচ্ছাসেবক লগইনে ট্যাব নেই; রেটিং/NID ফিল্ড অফিসিয়াল ছাড়া আসে না।

```text
Implement the two central lists per MASTER_SPEC (A৫ volunteer tab, A৭ beneficiary tab):
- Volunteer tab: all volunteers nationwide for officials and Official দায়ীs; pending registrations inline; filters by division/district/upazila/union, type, status, project, category, rating, blocklist; statistics header (total volunteers, applications, approved, in review — fed by counters that later modules update); actions approve / request correction / block / open profile. Volunteer profile page with sections: identity (NID protected), projects and permission sets (read-only here; assignment in T1.12), team, work summary placeholder, ratings and category (officials only; editing in Phase 5), blocklist and transfer actions (transfer in T2.6), device sessions.
- Beneficiary tab: nationwide list with the same filter pattern, statistics, and the 360° profile shell with the sections of A৭ (basic info and address, projects by year, application history, distribution/implementation, dawah, follow-ups, activity history) rendered from real data where it exists and empty states elsewhere.
Scope rules server-side: both tabs are GLOBAL read for officials; volunteers and team members never see them; field-level protection enforced. Paginated and indexed; measure list performance on the seeded data and report. Exports deferred to T2.8. Tests incl. field-level and scope negative cases; E2E for filters.
```

#### T1.11 🛠 প্রোগ্রাম ও প্রকল্প সেটআপ (কোর) `[P6.4-এর অংশ ১]`
- শেষে দেখে নিন: প্রকল্প সেটআপ উইজার্ড (key screen) draft সেভ করে; component toggle-এর settings JSON Schema-তে validate হয়; closed প্রকল্পে এডিট সার্ভার আটকায়।

```text
Implement programs and project setup per MASTER_SPEC A৬ and BD-09, BD-13, BD-14, BD-16, BD-20:
- Programs: CRUD by Department Head; PM assignment; program list visible to officials only.
- Projects: CRUD with draft save of partial setup and explicit activation; project code (unique, used for application ids); configuration groups — basic info (name, year, program, description, workflow template chosen from the seeded definitions), component toggles with settings stored as JSONB and validated against the per-component JSON Schemas, budget (cost per beneficiary × target beneficiaries, fund-source tags zakat / sadaqah / general / specific donor with amounts), application window (from/to) with PM-only extension requiring a reason (logged), areas (division or one or more districts) with an RPM per area and optional district split among RPMs, staff assignment with view/edit/delete access, photo rule (group / individual / both) and photo source (camera only, or camera or gallery with a flag; defaults per UX-11), rating criteria (max 5, each 1–5), per-volunteer application limit, stage names and order for stage-based projects, application kinds for tree planting, dawah enabled with the syllabus topic list, beneficiary type options with the BD-14 defaults editable per project.
- Lifecycle draft → active → closing → closed; close and reopen by PM only with reason (logged); closed and closing enforced server-side (no new applications; closed = read-only except follow-ups).
Screens: project list with status and progress placeholders, project setup wizard with component toggles (key screen, compare with the mockup), project overview. Audit log on every change. Tests for every rule; E2E create → draft → activate → close → reopen. Update openapi.yaml.
```

#### T1.12 🛠 টেমপ্লেট ও কপি, নিয়মাবলি-সম্মতি, প্রকল্পে স্বেচ্ছাসেবক অ্যাসাইন, টিম `[P6.4-এর অংশ ২ + নতুন]`
- শেষে দেখে নিন: "copy from previous project" ঠিক BD-10 তালিকা মানে (টেস্ট); সম্মতি না দিলে প্রকল্পে ঢোকা যায় না; RPM নিজ রিজিওনের স্বেচ্ছাসেবকই দেখেন।

```text
Implement:
- Master templates and "copy from a previous project" exactly per BD-10 (copied: components and settings, form as version 1, workflow stages, photo rule, rating criteria, issue types, expense categories, syllabus, document checklist, scoring criteria; not copied: applications, beneficiaries, budget amounts, dates, volunteer assignments, ratings, categories, logs, quota targets); copies are independent snapshots; "save as template" from any project; template library screen; templates editable by anyone with project-creation access; all audited.
- Rules & consent: the four texts per project (volunteer duties, implementation process, local দায়ী duties, consequences of misconduct) edited in setup; the volunteer acceptance flow (read each part → accept → next → final confirmation "আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী"); reject keeps the assignment pending; who accepted when is logged.
- Volunteer assignment by RPM: region-filtered list of approved, non-blocked volunteers; multi-select by district/upazila/union; permission set per type (application + distribution / + dawah / work progress); paid flag; the same volunteer on several projects with different sets; executives may assign when RPM grants the permission.
- Team members: the main volunteer (general or both type) sees the volunteers registered with their NID as reference and adds them to this project's team; the team-member capability table of A৫ enforced (create applications, edit own drafts, never submit).
- Per-volunteer application limit counters ready for Phase 2.
Volunteer side: "my projects" shows only active projects after consent. Tests incl. copy/not-copy lists, consent gating, region scope; E2E assign → consent → appears. Update openapi.yaml.
```

#### T1.13 🛠 অ্যাডমিন ও সেটিংস (কোর) `[P6.17-এর অংশ ১]`
- শেষে দেখে নিন: নিসাব ভার্সন তালিকা (effective date); থ্রেশহোল্ড সেটিং; dummy-OTP সতর্কবার্তা; audit viewer ফিল্টার।

```text
Implement the admin area core (only roles with the corresponding permissions; Main Admin protected): organization settings; localization defaults; notification channel settings (SMTP read from environment and shown read-only, SMS provider configuration screen writing the provider-agnostic adapter config, the dummy-OTP flag displayed with a red production warning); nisab value management (PM and above; versioned with effective dates; every application will store the nisab used at verification — model and API now, used in Phase 4); monitoring thresholds (review/approval pending days, no-update days, inactive days, budget %) with the DECISION_LOG defaults; expense category and issue type lists; audit log viewer with filters (actor, entity, action, date range) and entity drill-down; session monitoring (active device sessions, revoke); system health page (database, storage, queue, storage growth figures from the file service). Tests; openapi.yaml.
```

#### T1.14 🛠 নোটিফিকেশন বাস্তবায়ন `[P2.7-এর কোড অংশ]`
- শেষে দেখে নিন: Mailpit-এ ইমেইল আসে (bn ও en); in-app inbox; retry টেস্ট; উপকারভোগীকে কিছু যায় না।

```text
Implement notifications per docs/architecture/NOTIFICATIONS.md for every Phase 1 event in the matrix (registration submitted / approved / correction requested, edit request, permission change, blocklist, handover, project assignment, consent pending, deadline extension, device revoked): in-app inbox with unread counts and read state; email via SMTP (Nodemailer; Mailpit in dev); SMS through the adapter with a dev stub that logs; bilingual templates (bn/en) stored as data with variables and a preview screen in admin; user channel preferences; delivery through pg-boss with retry and a delivery-status log; rate limits. Beneficiaries receive nothing (BD-47). Tests: template rendering in both languages, recipient resolution by role and scope, retry behaviour, no notification to beneficiary records.
```

#### T1.15 🛠 ভূমিকাভিত্তিক হোম ("My Work") ও অ্যাপ শেল `[নতুন; A৪]`
- শেষে দেখে নিন: প্রতিটি demo account লগইনে নিজের হোম; মোবাইলে bottom nav; initial bundle size NFR-এর মধ্যে (রিপোর্টে সংখ্যা)।

```text
Implement the application shell per docs/ui/SCREENS.md and MASTER_SPEC A৪ "My Work": role-aware navigation (desktop sidebar for officials, mobile bottom navigation for volunteers), the home screen per role with the widgets that exist so far (volunteer: my projects, my applications placeholder, notifications; team member: main volunteer's projects; local দায়ী and paid volunteer: placeholders for today's class / today's work; Official দায়ী: tracking placeholder; Executive / RPM: pending registrations, my projects, notifications; PM: projects, templates; Department Head / Monitoring: admin, permission panel, audit entry points), the offline banner wired to navigator state (full offline arrives in Phase 2), the header with the As-Sunnah Foundation logo and the system name (UX-09), the volunteer home opening with a needs-your-attention list for corrections, approvals and unsynced items because notifications are in-app only (UX-12), officials' screens working at 360 px (UX-03), language switch, profile menu, device sessions link, notification bell. Run Lighthouse and axe on the mobile viewport and report the initial JS payload against the NFR target. Tests with RTL; E2E per role home.
```

#### T1.16 🧪 Phase 1 টেস্ট একত্রীকরণ `[P7.2/P7.3-এর Phase 1 অংশ]`
- শেষে দেখে নিন: BUSINESS_RULES.md-এ Phase 1-এর প্রতিটি BR-এর টেস্ট-স্ট্যাটাস; E2E তালিকা সবুজ।

```text
Consolidate Phase 1 testing:
1. List every BR in docs/BUSINESS_RULES.md that belongs to a Phase 1 module and make sure each testable one has an executed unit, integration or API test; add the missing ones.
2. API contract tests against docs/api/openapi.yaml for all Phase 1 endpoints; run the drift test.
3. Playwright E2E: login/logout; role-based denial for every role; volunteer registration with two OTPs → correction request → resubmit → approval → assignment → consent → project visible; team member registration with NID reference; staff handover before deactivation; permission panel change with audit entry; project draft → activate → close → reopen; language switch; device revocation ends the session.
4. axe on every Phase 1 screen in both languages.
Report coverage per layer, the executed commands with outputs, and the rules still untested with reasons. Update TEST_STRATEGY.md and the test-status column in BUSINESS_RULES.md.
```

#### T1.17 🚪 Phase 1 গেট `[নতুন]`
- পরীক্ষক: অফিসিয়াল টিম (M6)। শেষে দেখে নিন: UAT স্ক্রিপ্ট বাংলায়; `gate-phase-1` ট্যাগ; UAT ফিডব্যাক পরে `/css-uat Phase 1` দিয়ে।

```text
/css-gate 1
Testers for this phase: the official team — one Department Head, one Monitoring Team member, one PM, one RPM, one Project Executive — using the demo accounts. Scenarios must cover registration approval, permission panel, project setup from template, volunteer assignment and consent, handover, and admin settings.
```

---

### Phase 2 · Beneficiary + Application + Form Platform + Offline

> সবচেয়ে কঠিন ফেজ। T2.3, T2.5, T2.7-এ `fable`; প্রতিটি দুই সেশনে হতে পারে, দুটিতেই একই মডেল। ডক থেকে বিচ্যুতি দেখলে আগে ডক ঠিক করুন (`/css-change`)।

#### T2.1 🛠 ফাইল সার্ভিস `[P2.6-এর কোড অংশ]`
- নোট (2026-10-20): signed URL আর নেই (D-074, D-108)। ফাইল ও আপলোড দুটোই API দিয়ে, অনুমতি যাচাইয়ের পরে। নিচের প্রম্পটের signed URL-এর জায়গায় এটাই প্রযোজ্য। পরিকল্পনা: `docs/plans/2026-10-20-0918-feat-file-service-plan.md`।
- শেষে দেখে নিন: আপলোড → signed URL ছাড়া ফাইল খোলে না; EXIF তারিখ/GPS রেকর্ড; একই ছবি দ্বিতীয়বার দিলে সতর্কবার্তা; resumable upload টেস্ট।

```text
Implement files per docs/architecture/FILES_AND_DOCUMENTS.md: upload API with type and size validation and a virus-scan hook (no-op adapter in dev); file metadata with entity links; private access only through signed expiring URLs issued after a permission check (test the deny path); server-side thumbnails with sharp; EXIF capture (date/time, GPS) for photos and a flag when metadata is missing; perceptual-hash duplicate detection per O-30 (an identical file, same SHA-256, is rejected within the project; a near duplicate by perceptual hash only warns); client-side compression and resumable chunked upload in apps/web as a reusable upload component with progress and retry; storage path conventions (documents Program → Project → Year → District; photos and vouchers under project/application); storage growth metrics for the system health page; export of file lists per entity. Tests: authorization on URLs, expiry, duplicate warning, resume after interruption, EXIF extraction.
```

#### T2.2 🛠 উপকারভোগী মাস্টার `[P6.3]`
- শেষে দেখে নিন: NID দিলে auto-fill; লক ফিল্ড; নিজের নম্বর ব্লক (DB-ও); পারিবারিক সতর্কবার্তা; মার্জ টুল ও reversal; ব্লকলিস্ট।

```text
Implement the beneficiary master per MASTER_SPEC A৭/B৩ and BD-01…BD-06:
- Identity: NID or birth registration mandatory, each unique, format validated (NID 10/13/17 digits, birth registration 17 digits); mobile is contact data, not identity, not unique (warning when shared).
- Lookup API by NID / birth registration used by the application form: existing profile → auto-fill name, father/husband name, mobile, address and other basics; name, father/husband name and the id are locked; mobile and address editable with a change log; locked fields change only through the official "profile correction request" flow (request, review, approve, audit).
- Volunteer's own mobile cannot be a beneficiary's mobile (service and database level).
- Beneficiary blocklist (RPM and above, reason; lift with reason): no new application in any project, ongoing applications continue; message shown in the application form; reasons visible to officials only.
- Family-duplicate warning at review: same union + village, father/husband name or mobile as another beneficiary in the same project → warning with the matching name and BEN-ID; never auto-reject; official decides with a reason (no household id).
- Duplicate profiles: candidate suggestions (name + father/husband + mobile; name + date of birth + union; same mobile on several profiles), side-by-side comparison, merge by PM / Monitoring Team / Department Head (RPM proposes): keep one, both ids searchable, retired BEN-ID points to the kept one, everything (applications, support, dawah, photos, follow-ups) consolidated, fully logged, reversible by the Monitoring Team.
- 360° profile fed with real data; beneficiary tab updated.
Tests for every rule (these are core BR tests), API negative cases, E2E lookup → auto-fill, merge → revert. Update openapi.yaml.
```

#### T2.3 🛠 ফর্ম প্ল্যাটফর্ম: ইঞ্জিন ও API `[P6.5-এর অংশ ১]`
- শেষে দেখে নিন: evaluator `packages/shared`-এ, সার্ভার ও ক্লায়েন্ট একই কোড; প্রকাশিত ফর্ম বদলালে v2; পরিশিষ্ট খ-এর দুই ফর্ম টেমপ্লেট হিসেবে লোড হয়।

```text
Implement the form platform data layer and engine per MASTER_SPEC B৩ and BD-12, BD-13, BD-14 (the builder UI is T2.4):
section library (the ten sections of B৩), standard field library (appendix খ.৩, stored in beneficiary columns), custom fields (answers in application_answers JSONB), all field types of B৩ including the Bangladesh cascading address component, repeat groups, calculated fields (a small expression language evaluated by one evaluator in packages/shared used identically by server and client — family totals, income totals, gold/silver values, total assets, debts, net assets), conditional logic (show / hide / require / options-depend-on-previous-answer, incl. "অন্যান্য" opening a text box on the same field), bilingual labels, help texts and options, per-field and per-section visibility (volunteer / official-only), the mandatory core fields of BD-13 that cannot be removed or made optional, beneficiary type options with the BD-14 defaults, validation on submit server-side from the definition, versioning (publish makes a version immutable; any change creates the next version; applications store form_version_id; reports map fields across versions), and the public-link option (token, rate limited, entries land as "needs verification").
Load the two current forms from appendix খ (seeded in T1.3) through the engine and prove they validate and calculate correctly. API + openapi.yaml. Tests: evaluator (many cases), validation, versioning immutability, visibility filtering for volunteers, public-link limits.
```

#### T2.4 🛠 ফর্ম বিল্ডার UI ও রানটাইম রেন্ডারার `[P6.5-এর অংশ ২]`
- শেষে দেখে নিন: PM ফর্ম বানিয়ে প্রকাশ করে, বদলালে v2 (E2E); মোবাইলে রেন্ডারার ৩৬০px-এ, ক্যাসকেডিং ঠিকানা, রিপিট গ্রুপ, লাইভ হিসাব।

```text
Implement the form builder for PMs (key screen: section library on the left, live preview on the right, field settings panel, add by drag or tick, no-code logic editor, calculation editor, version list with a change summary, publish) and the runtime form renderer used by web and mobile (cascading address, repeat groups, live calculations, conditional logic, bilingual, official-only sections hidden from volunteers, photo and file fields using the T2.1 upload component, GPS field, draft autosave, validation messages localized). Mobile-first for the renderer; verify at 360×640 and keyboard-only. Match the approved mockups in docs/ui/mockups/ for the screens that exist. Tests with RTL for renderer behaviours; Playwright: PM builds a form from sections, publishes, edits → v2, old application keeps v1.
```

#### T2.4b 🛠 ফর্ম বিল্ডারের নতুন নকশা `[D-122]` — ✅ সম্পন্ন (২২ অক্টোবর ২০২৬)
- কম প্রযুক্তি-জ্ঞানের মানুষও যেন ফর্ম বানাতে পারেন, সেভাবে বিল্ডার নতুন করে সাজানো: তিন প্যানেল, ধরন দেখে প্রশ্ন যোগ, টেনে সাজানো (কীবোর্ডের বিকল্পসহ), শর্ত ও হিসাব বাক্যে পড়া যায়। প্ল্যান: `docs/plans/2026-10-22-2300-feat-form-builder-redesign-plan.md`।

#### T2.4c 🛠 রেডি ফর্ম, প্রশ্ন লাইব্রেরি ও পরিচয়ের চিহ্ন `[D-125, D-126, D-127]` — ✅ সম্পন্ন (২৪ অক্টোবর ২০২৬)
- মনিটরিং টিম ও বিভাগীয় প্রধান প্রকল্পের বাইরে রেডি ফর্ম আর প্রশ্ন লাইব্রেরি বানান; PM ফর্মটি প্রকল্পে বসান এবং নতুন সংস্করণ এলে নেন; সিস্টেম নিজে কোনো প্রশ্ন বসায় না। প্ল্যান: `docs/plans/2026-10-24-0930-feat-ready-forms-library-plan.md`।

#### T2.4d 🛠 Kobo-র মতো ফর্ম লজিক `[D-128, D-133]` — ✅ সম্পন্ন (২৬ অক্টোবর ২০২৬)
- শেষে দেখে নিন: ক্যারেট অনুযায়ী সোনার দাম আর মোট সম্পদের সূত্র বিল্ডারে বাক্য হিসেবে পড়া যায়, আর সার্ভার ও ফোনে একই ফল দেয়; আজকের তারিখ নিজে থেকে বসে; পরিবারের সদস্য সংখ্যা দিলে ততটি সারি আসে; মালিকের ডেমো ফর্মটি পুরোটা বিল্ডারে বানানো যায়।

```text
Extend the form engine and the builder per DECISION_LOG D-128, with the owner's Kobo XLSForm (SRP-26) as the reference case:
(1) calculations with conditions (if … then … else …, nested; e.g. the gold price by karat, the poverty class), rounding, and free formulas of several terms with + − × ÷ and brackets (e.g. total assets = cash + bank + gold weight × price …), evaluated exactly by the one evaluator in @css/shared/forms on server and client, and shown and edited in the builder as sentences (sentences.ts, CalculationEditor), never as raw code;
(2) a default value per question (today's date, a fixed text such as a number's prefix, a number) and read-only questions whose value only a calculation or the system sets;
(3) per D-133, the owner's demo form (https://rajuofficialasf-hub.github.io/self-reliance-demo-form/) in full: a group's row count from a number answer (D-124 (3)), counting a group's rows by a condition, a condition comparing two answers, an earlier answer in a question's text, and a number table question. D-128's assigned names are withdrawn (D-133): who sent, approved or paid an application is traced in its steps and the audit log.
Not in scope (D-128): an own regular expression or error message per question, images in a note, an "English only" text check, a unit after a shown value, gold prices from a setting.
Published versions stay immutable; the new settings apply to drafts and old versions evaluate as before. Tests: evaluator cases (nesting, rounding, empty inputs, division by zero), the SRP-26 calculations reproduced, a read-only value the client sends never kept, the assignment names by area and their masking, builder component tests; Playwright: the Monitoring Team builds the gold and total-assets calculations as sentences and publishes, and a volunteer at 360 px sees the computed values, today's date and the assigned names. Update the form definition JSON Schemas, openapi.yaml where the definition changes, BUSINESS_RULES, SCREENS SCR-061 and STATUS.
```

#### T2.5 🛠 ওয়ার্কফ্লো ইঞ্জিন ও আবেদনের কোর চক্র `[P6.6-এর অংশ ১ + P2.4 কোড]`
- শেষে দেখে নিন: প্রতিটি ট্রানজিশনের positive/negative টেস্ট (ভূমিকা অনুযায়ী); রিভিউ পর্দায় timeline ও change log; মোবাইলে নতুন আবেদন NID lookup-সহ।

```text
Implement the workflow engine per docs/architecture/WORKFLOW_ENGINE.md: definitions loaded from the seeded workflow-templates (editable in admin later), the common states exactly as BD-11 plus Needs Verification and Waitlisted, a transition service (who may by permission name, guards by name, side effects, audit, notifications), the activity model table with the generic activity types, and the bulk-update API pattern.
Then the application core on it: create on web and mobile with NID / birth-registration lookup and auto-fill (T2.2), draft and submit, status-dependent edit and delete rights per the A৭ table including the team-member rules, review with full-form edit by officials (no separate "correction needed" step — Q-05), reviewed → approve or reject with reason, PM final approval where the template says so, application ids with the project code, audit trail and timeline.
Screens: application list with filters and the review detail panel with step timeline and change log (key screen); mobile new application with NID lookup and auto-fill (key screen); volunteer "my applications" by status. Tests: every transition positive and negative per role, guard rejection, timeline correctness; E2E create → submit → review → approve. Update openapi.yaml.
```

#### T2.6 🛠 আবেদনের নিয়ম: লিমিট, স্কোর, কোটা, ওয়েটলিস্ট, আনলক, হস্তান্তর `[P6.6-এর অংশ ২]`
- শেষে দেখে নিন: লিমিট পূর্ণ/সময় শেষ হলে সার্ভার আবেদন নেয় না; স্কোরের বিপরীতে সিদ্ধান্তে মন্তব্য বাধ্যতামূলক; হস্তান্তরের পর পুরোনো স্বেচ্ছাসেবক কিছু দেখেন না।

```text
Add to the application module, each as a documented BR with tests:
- Per-volunteer application limit and project deadline enforced server-side; PM extension with reason (BD-16).
- Priority score from PM-defined criteria (BD-17) computed on submit and recomputed on edit; stored with the criteria snapshot; area quotas (district / union: target vs received vs approved) shown on the review screen; outcomes approved / waitlisted / rejected with reason; deciding against the score requires a comment; one-click pull from the waitlist; "not previously assisted" derived from beneficiary history; the score never approves or rejects by itself.
- Field unlock on approved applications: one field at a time, volunteer updates, official verifies, old and new value, requester, approver, reason and time logged; impossible on closed projects (BD-18).
- Family-duplicate warning surfaced at review (from T2.2); duplicate application of the same beneficiary in the same project blocked; beneficiary and volunteer blocklist checks at entry.
- Application transfer by RPM or a permitted executive: add the new volunteer, transfer all or selected applications, new volunteer gets full prior access, old one sees nothing, team re-parenting decision, fully logged on the application and in the audit log (BD-07).
- Needs Verification queue for public-link and offline-conflict entries with the official's "link to existing profile / create new / reject" actions.
E2E: score → waitlist → pull; unlock; transfer. Update openapi.yaml and BUSINESS_RULES test status.
```

#### T2.7 🛠 অফলাইন PWA ও সিঙ্ক `[P6.7]`
- শেষে দেখে নিন: ফোনে ইনস্টল হয়; নেটওয়ার্ক বন্ধ করে আবেদন নেওয়া → চালু করলে সিঙ্ক (Playwright offline টেস্ট); ছবি আলাদা কিউ; লগআউটে ডেটা মুছে যায়।

```text
Implement the offline-first PWA per docs/architecture/OFFLINE_SYNC.md and BD-48: installable app with the Serwist service worker and app-shell caching including the self-hosted font files (UX-13); offline data scope per DECISION_LOG (assigned projects' current form versions, own beneficiaries and applications, syllabus, locations); the Dexie/IndexedDB outbox with client_uuid on every offline record and sync_status pending → syncing → synced / failed with reason; the sync engine with batching, retry with backoff, server-side idempotency and deduplication; the separate compressed photo queue with resumable upload, text before photos, and no completion while photos are pending; conflict handling (server wins on approved data; last write wins on drafts and field updates; both logged); the "needs verification" path when an offline NID turns out to exist at sync; form-version handling when a form was republished meanwhile; encrypted local storage with a session-derived key, wiped on logout or remote revocation; sync status UI and offline banner; background sync where supported.
Verify on a throttled 3G profile and with the app installed on Android Chrome and on an iPhone (describe the manual steps and results). Tests: unit for the outbox and conflict rules, Playwright offline capture → reconnect → sync → needs-verification path, photo queue resume. Update openapi.yaml (sync endpoints).
```

#### T2.8 🛠 এক্সপোর্ট সার্ভিস (Excel/CSV/PDF) `[নতুন; A১১]`
- শেষে দেখে নিন: স্বেচ্ছাসেবক-ভূমিকার এক্সপোর্টে সুরক্ষিত ফিল্ড নেই (টেস্ট); বাংলা ফন্ট PDF-এ ঠিক; বড় এক্সপোর্ট background job।

```text
Implement the export service: Excel (xlsx), CSV and PDF for any filtered list (volunteers, beneficiaries, applications including form answers mapped across versions), the beneficiary 360° profile PDF, and later report exports through the same service; field-level permission filtering must reuse the exact serializer code path of the API (one implementation); font embedding in PDF (UbuntuSans for Latin letters and digits, Bornomala for Bengali) with English digits per UX-05 and I18N.md; large exports as pg-boss jobs with a signed download link and progress in the UI; an audit entry for every export of sensitive data (constitution §13). Tests: a volunteer-role export never contains protected fields; CSV/XLSX column parity with the on-screen list; PDF renders Bengali correctly (snapshot).
```

#### T2.8b 🛠 মিডিয়া টিম মডিউল `[D-101; T5.5 থেকে এগিয়ে আনা]`
- ক্রম (D-134, ২৬ অক্টোবর ২০২৬): এই কাজটি T2.7 ও T2.8-এর আগে হবে; T2.9 ও Phase 2 গেট তিনটিই শেষ হওয়ার পরে।
- শেষে দেখে নিন: সম্মতি ছাড়া referral যায় না; RPM-এর referral মিডিয়া ডিরেক্টর গ্রহণ করলে কাজ ধাপে ধাপে এগোয়; প্রকাশিত কাজ উপকারভোগীর প্রোফাইল ও সদস্যের পোর্টফোলিওতে দেখা যায়; মিডিয়া টিম আবেদন বা উপকারভোগীর তথ্য বদলাতে পারে না (matrix টেস্ট)।

```text
Implement the Media Team module per DECISION_LOG D-101 and BR-264 to BR-268: media consent on the beneficiary profile (recorded by an official with date, channels and by whom; audited; BD-38, O-17); a referral of an approved application by a PM (own program) or an RPM (own region) with a priority (high, normal, low) and a note, refused without consent, resendable after a return or a rejection; the decision of the Media Director or the Media Assistant Director (accept, send back for review with a comment, reject with a reason) shown beside the application as a media status badge that never changes the application's workflow state; the work with editable stages (accepted, planning and assignment, script, shooting preparation, shooting done, editing, internal review, ready to publish, published, done; special states in review, cancelled, on hold), members with production roles (one person may hold several), an optional script with the states draft, in review and final, a content type (video, photo, both), publications on one or more platforms (As-Sunnah Foundation Facebook, Ahmadullah Facebook, As-Sunnah Foundation YouTube, Ahmadullah YouTube; each with state, date, link and note; each platform mapped to a consent channel and gated by it), the director's final review before publication, comments and a history of every decision and stage change (audited); the stages, production roles and platforms as reference lists in admin settings; on a referred application the team sees the beneficiary's name, father's or husband's name, age, mobile number, full address, occupation, monthly income, program, project and year, the official's comment and the story (of the official section only the comment) and nothing of NID, ratings, categories or donor data (BR-265); the Media Team home with counts by program and overall and the works list; member profiles with a portfolio of published works (videos by link with a thumbnail, no embedded player; no photo files); the media section of the beneficiary 360° profile. Data model (replaces media_subjects and media_stories): media referrals, works, assignments, publications, comments, one reversible migration. Permissions: media.referral.create, media.referral.decide, media.work.view, media.work.manage, media.publication.review, story.manage, story.view (permissions.yaml). Tests: BR unit tests, integration (consent gate, scope of referrals, decisions, the workflow state untouched, publication gate), authorization matrix, Playwright (RPM refers → director accepts → member updates stages → published work on both profiles; a volunteer and the Finance Team are refused). openapi.yaml, SCREENS SCR-019 and SCR-108, ERD and DATABASE_SCHEMA.
```

#### T2.9 🧪 Phase 2 টেস্ট একত্রীকরণ

```text
Consolidate Phase 2 testing:
1. BR coverage for identity and duplicate rules, limits and deadlines, priority score and waitlist, field unlock, transfer, blocklists, form versioning and calculations, sync idempotency and conflict rules; add missing tests and update BUSINESS_RULES.md.
2. API contract tests for all Phase 2 endpoints; drift test.
3. Playwright E2E: mobile application with NID auto-fill; offline capture → sync → needs-verification path; review → score → waitlist → pull → approve; family-duplicate warning handling; field unlock; application transfer; public-link entry; form v2 keeps old answers; merge → revert; exports per role.
4. axe on every Phase 2 screen; bundle size and Lighthouse on the mobile PWA against NFR targets.
Report with executed commands and outputs.
```

#### T2.10 🚪 Phase 2 গেট
- পরীক্ষক: ২০–৩০ স্বেচ্ছাসেবক + RPM, মোবাইলে (M6); UAT স্ক্রিপ্ট মোবাইল-কেন্দ্রিক।

```text
/css-gate 2
Testers: 20–30 volunteers on their own Android phones and two RPMs. Scenarios must include installing the PWA, taking applications offline in the field and syncing later, NID auto-fill for a repeat beneficiary, review with score and waitlist on desktop, field unlock, and transfer. Add a short Bengali installation guide for Android Chrome and for iPhone Safari (Share, Add to Home Screen) to docs/testing/uat/.
```

---

### Phase 3 · Winter/Iftar Pilot (প্রথম মাঠ ব্যবহার)

> এই ফেজ থেকে আসল ব্যবহারকারী, আসল ডেটা। তাই T3.0 (ডিপ্লয়মেন্ট ও ব্যাকআপ) আগে; staging-এ পরীক্ষা, তারপর production-এ এক রিজিওন।

#### T3.0 🛠 ডিপ্লয়মেন্ট পাইপলাইন, পরিবেশ ও ব্যাকআপ `[P8.1-এর প্রথম অংশ]`
- আগে দরকার: সার্ভারের বিবরণ, ডোমেইন, SMTP (M5)। শেষে দেখে নিন: নতুন মেশিনে README থেকে staging চালু হয়; রিস্টোর মহড়া সফল; `docs/ops/` দুই ফাইল।

```text
Field use starts in this phase, so set up deployment now per constitution §9 environments: multi-stage Dockerfiles for api and web (production builds); infra/docker-compose.prod.yml with Caddy (TLS) as reverse proxy, PostgreSQL and MinIO as containers with persistent volumes (document the external-service alternative); environment and secret management without committing secrets; the release process (build → migrate with the down.sql rollback path → health check → switch) as a script; automated daily backups (pg_dump plus WAL archiving if feasible, MinIO mirror) to a separate location with a documented restore procedure and a scripted restore drill; structured logging; basic monitoring (health checks, disk and storage-growth alerts, queue backlog); a release checklist; docs/ops/DEPLOYMENT.md and docs/ops/RUNBOOK.md in English with a Bengali quick section for the IT team. Define staging to mirror production. Prove it: a clean deploy to a staging compose on a fresh machine following the README alone, with smoke tests passing and one backup restored successfully. Seed data and dummy OTP must be impossible to enable in production configuration.
```

#### T3.1 🛠 বিতরণ কার্যপ্রবাহ (শীতবস্ত্র/ইফতার/মাংস) `[P6.8-এর অংশ ১]`
- শেষে দেখে নিন: "আজকের বিতরণ" মোবাইল পর্দা (key screen) অফলাইনে চলে; ছবির নিয়ম ছাড়া "সম্পন্ন" হয় না; মিলকরণ না মিললে প্রকল্প সম্পন্ন করা যায় না।

```text
Implement the distribution workflow end to end on the engine per MASTER_SPEC A৮.১ and BD-21, BD-22, BD-23:
goods dispatch by the office (what, how many, to which volunteer, courier spot from the volunteer profile) and the volunteer's receive confirmation with the distribution date; the "today's distribution" bulk screen on mobile (list of approved beneficiaries, received tick, photo per rule, status per row, one save, works offline through the T2.7 outbox); photo rules per project (door-to-door = one photo per beneficiary; gathered = group photo only) enforced as a guard with capture date/time and GPS metadata, the duplicate-photo warning and the per-project photo source setting (UX-11: camera only by default for distribution proof, through an in-app capture screen); edge states (absent, later distribution on the same application, not distributed at close with no cost, shortage → waitlist, damaged/lost with photos and reason, partial with item ticks, death/relocation → profile status change and PM reassignment decision with reason); stock reconciliation per volunteer and project (sent = distributed + remaining + damaged) blocking project completion when unbalanced, differences needing a reason and raising a monitoring alert; distribution counts updating the beneficiary profile and the budget "distributed" bucket (ledger entries via T3.2 interfaces). Tests for every rule; E2E dispatch → receive → today's distribution with photo → reconciliation. Update openapi.yaml.
```

#### T3.2 🛠 স্বেচ্ছাসেবকের খরচ, ভাউচার, পরিশোধ ও বাজেট লেজার `[P6.8-এর অংশ ২ + B৬]`
- শেষে দেখে নিন: একই দাবিতে দ্বিতীয় পরিশোধ প্রত্যাখ্যাত (টেস্ট); লেজারের invariant টেস্ট; ফাইন্যান্স ভিউয়ার শুধু দেখে ও এক্সপোর্ট করে।

```text
Implement money per MASTER_SPEC B৬ and BD-29, BD-30, BD-31: the budget_ledger with the full bucket list (allocated, approved, spent/distributed, remaining, beneficiary support, advance, actual expense, voucher submitted/verified, returned, volunteer expense claimed/paid), fund-source tags per project with the rule that zakat funds pay only zakat-eligible beneficiaries (enforced when the fund source is zakat; eligibility comes from the application's zakat section in Phase 4, so model the check now), ledger entries written by workflow side effects (approval → approved bucket; distribution completed → distributed bucket); volunteer expense claims by category (project-configurable list: decoration, transport, food, photocopy, banner…) with voucher uploads, official verification, and the payment record (date, amount, method from the admin-editable list such as bKash, Nagad, Rocket, bank, cash per O-22, transaction id globally unique; a second payment on the same claim rejected; idempotency key); beneficiary support payment and advance payment records (used in Phase 4, model now); voucher submitted/verified buckets and returned amount (advance − actual); finance-team viewer screens (budgets, payments, vouchers, claims) with CSV/PDF export; project budget cards (planned / used / remaining, with per-beneficiary cost and volunteer operational expenses shown as two separate lines, never mixed). Tests: ledger balance invariants, unique transaction id, idempotent payment, fund-source rule, bucket math, finance role read-only. Update openapi.yaml.
```

#### T3.3 🛠 প্রকল্প ড্যাশবোর্ড ও মৌলিক মনিটরিং সতর্কবার্তা `[P6.16-এর অংশ ১]`
- শেষে দেখে নিন: ড্যাশবোর্ডের সংখ্যা সিড ডেটার সাথে মেলে (টেস্ট); সতর্কবার্তা তালিকা; ফিল্টার সাল/এলাকা।

```text
Implement the project dashboard (key screen, work progress first, UX-10) per MASTER_SPEC A১১: beneficiaries, application status funnel, distribution progress, volunteers and teams, budget cards from the ledger, monitoring alert list, volunteer summary; interactive filters by year, division, district, upazila, union; every number computed by one query service that tests can assert against the seeded data; cached sensibly and paginated where needed. Add the first monitoring alerts as scheduled jobs with the admin thresholds: approvals pending beyond N days, distribution marked without required photos, unbalanced stock, duplicate NID attempts, inactive volunteers; alerts appear on the dashboard and in the Monitoring Team inbox (the full control centre is Phase 5). Tests incl. scope: an RPM sees only their region's numbers.
```

#### T3.4 🧪 লোড টেস্ট ও কম দামি ফোনে পরীক্ষা `[P7.4-এর পারফরম্যান্স অংশ, আগে আনা]`
- শেষে দেখে নিন: k6 রিপোর্ট ২,০০০ concurrent-এ NFR-এর p95 লক্ষ্যের মধ্যে; N+1 তালিকা ঠিক করা; মোবাইল bundle সংখ্যা।

```text
Before the field pilot: write k6 scenarios simulating a distribution day with 2,000 concurrent volunteers (login, open today's distribution, save bulk rows with photos through the sync endpoints, NID lookups, application submits) against staging; measure against the NFR targets; find and fix N+1 queries and missing indexes (show query plans before/after); analyse the web bundle for the volunteer PWA and reduce the initial payload to the NFR target (code splitting, lazy routes, image handling); test on a throttled 3G profile and, if available, on a real 2 GB-RAM Android phone (document the steps). Report findings by severity with what was fixed and what remains; do not weaken any security or validation to gain speed.
```

#### T3.5 🧪 Phase 3 টেস্ট একত্রীকরণ

```text
Consolidate Phase 3 testing: BR coverage for photo rules, edge states, reconciliation, ledger buckets, fund-source rule, unique transaction id; API contract tests and drift; Playwright E2E: dispatch → receive → today's distribution with photos (online and offline) → reconciliation → completion blocked until balanced; expense claim → verification → payment with unique transaction id → finance export; dashboard numbers after the flow; axe on all Phase 3 screens. Report with executed commands and outputs; update BUSINESS_RULES test status.
```

#### T3.6 🚪 পাইলট গেট: এক রিজিওন → সব রিজিওন `[নতুন; D২]`
- পরীক্ষক: পাইলট রিজিওনের RPM, এক্সিকিউটিভ, ২০–৩০ স্বেচ্ছাসেবক (M6)। ধাপ: staging UAT → production-এ পাইলট রিজিওন → ফিডব্যাক → সব রিজিওন।

```text
/css-gate 3
Testers: the pilot region (RPM, Project Executive, 20–30 volunteers) on production after a staging UAT. Per O-49 the pilot may run with the dummy OTP only with my explicit written approval recorded in DECISION_LOG; a real SMS gateway must be live before rollout beyond the pilot region. In addition to the gate steps: produce a Bengali training pack in docs/training/ (a one-page quick guide per role for the winter/iftar flow, a champion-volunteer checklist, the helpline and "report a problem" instructions), a go-live checklist for the pilot (real accounts created, seed data absent, dummy OTP off or documented as still on with the owner's explicit approval, backups verified), and a rollout plan from the pilot region to all regions with the feedback loop (/css-uat).
```

---

### Phase 4 · Project-specific Workflows

> ক্রম অগ্রাধিকার অনুযায়ী বদলানো যায় (যেমন কুরবানী মৌসুম কাছে হলে T4.4 আগে)। কুরবানীর আগে SMS প্রোভাইডার ও SMTP লাগবে; T4.4-এর আগে ডোনার শীটের নমুনা `docs/source/samples/`-এ।

#### T4.1 🛠 ঘর নির্মাণ ও ইস্যু লগ `[P6.9]`
- শেষে দেখে নিন: PM-এর চূড়ান্ত অনুমোদন template-এ (কোডে নয়); পেইড ভলান্টিয়ারের "আজকের নির্মাণ" পর্দা; প্রকিউরমেন্ট শুধু দেখে + ইস্যু দেয়/সমাধান করে।

```text
Implement the construction workflow per MASTER_SPEC A৮.২ and BD-24, BD-25 on the engine (construction template): district-level intake by volunteers or any assigned official; selection with the score/quota tools and PM final approval (from the template, not hard-coded); per-area local দায়ী assignment (e.g. one per ten houses) reusing the dawah assignment model; 2–3 paid volunteers per district marked by the RPM; stage-based progress updates with photos on the "today's construction" bulk screen (stages from project setup; offline-capable); the issue log (raise with photos by paid volunteers, officials, local দায়ীs and the procurement team; assign; resolve with an entry visible to everyone on the project; status new / in progress / resolved; issue types from settings); procurement role: applications view-only, issues raise and resolve; optional vouchers; final photo of the beneficiary with the house as a completion guard; the local দায়ী and paid volunteer may be the same person (sees both sections). Tests incl. permission matrix for procurement and paid volunteers; E2E intake → selection → PM approval → stages → issue raise/resolve → completion. Update openapi.yaml.
```

#### T4.2 🛠 স্বাবলম্বী প্রকল্প `[P6.10]`
- আগে দরকার: PM বা তার উপরের কেউ বর্তমান নিসাবের মান সিস্টেমে বসাবেন (`nisab.set`), প্রথম যাকাত মূল্যায়নের আগে (BD-28, O-15)।
- শেষে দেখে নিন: যাকাত হিসাব ফর্মে লাইভ, নিসাব snapshot আবেদনে সেভ; পাশ না করলে পেমেন্ট গার্ড আটকায়; যাচাইয়ের পর ছবি/ভাউচার লক।

```text
Implement the self-reliance workflow per MASTER_SPEC A৮.৩ and BD-26, BD-27, BD-28 on the engine (implementation_evidence template): application with the zakat assessment section (the system computes total assets, debts and net assets with the shared evaluator and compares with the current nisab version to suggest eligibility; the Official দায়ী as approving আলেম decides; the nisab used is stored on the application at verification; implementing officer and approving আলেম names come from project assignments, never typed); field visit activity; approval; family-wide dawah assignment with female-দায়ী split by gender (full dawah module is Phase 5 — implement here only the minimal exam activity: exam type initial/final, score, pass/fail recorded by the Official দায়ী, results side by side, which T5.1 will reuse unchanged); beneficiary support payment gated on passing the final exam (date, amount, transaction id on the application; ledger bucket); material purchase activity; placard photo; voucher submission, official verification, then photos and vouchers locked; follow-up evaluations continuous with no schedule (BD-19), also after project close, stored on the beneficiary profile; zakat fund-source rule from T3.2 now effective. Tests for every rule incl. nisab snapshot immutability; E2E application → zakat suggestion → approval → exam → payment → vouchers → lock → follow-up. Update openapi.yaml.
```

#### T4.3 🛠 নিরাপদ পানি ও বৃক্ষরোপণ `[P6.11]`
- শেষে দেখে নিন: নিরাপদ পানিতে অ্যাডভান্স ≠ প্রকৃত খরচ, ফেরত হিসাব; বৃক্ষরোপণে পাবলিক ফর্ম → যাচাই → ভিজিট → বিতরণ → ক্লোজ।

```text
Implement the remaining two project types on the engine:
- Safe water (advance-voucher template, A৮.৪): detailed application; approval; advance payment to the volunteer or implementer recorded on the application and in the advance bucket; stage-based progress updates with the stage list from setup (general volunteers and paid volunteers alike); completion package (tube-well photo, vouchers, full expense statement); official verification → completed, photos and vouchers locked, actual expense and returned amount computed; the Implementer role's document responsibilities hooked to the document register interface (Phase 5).
- Tree planting (open-application-visit template, A৮.৫): public application link with two application kinds (institution, private garden); assignment of a local volunteer for site verification with comment, photos and recommendation (direct decision when the RPM grants it); official decision approve / re-review / reject; sapling dispatch and receipt with daily dispatch updates; group photo for institutions, placard garden photo for private gardens; stock reconciliation by sapling count; volunteer expense settlement and PM close.
Tests and E2E for both; openapi.yaml.
```

#### T4.4 🛠 কুরবানী: ডোনার, পশু, বরাদ্দ, ছবি, বার্তা `[P6.12]`
- আগে দরকার: নমুনা শীট; SMTP; SMS প্রোভাইডার (না থাকলে ইমেইল-only, SMS adapter stub)। শেষে দেখে নিন: বরাদ্দ পশু আরেকজনকে দেওয়া যায় না (DB + টেস্ট); ডোনারকে ছবি-ইমেইল ও sent-status; Excel import/export।

```text
Implement the Qurbani module per MASTER_SPEC A৮.৬ and BD-32, BD-33, BD-34 on the engine (qurbani template; the beneficiary side reuses the distribution workflow with meat as the item):
donor import from the SSL Excel/sheet (columns per the sample in docs/source/samples/; validation report; duplicate transaction ids rejected) and the system's own form for cash donors (name, mobile, email, amount, purpose, approval status, approver, comment, cow shares, goat count), merged into one donor list with source tags; animal list generated from donor shares (a cow = 7 shares; status empty / full; goats individually) with a recalculation that never reassigns an already allocated animal; manual allocation on the volunteer profile (several cows, or 1–4 goats; an allocated animal can never be given to another volunteer until the allocation is cancelled — enforce with the database constraint and a test); spot (district, upazila, union) and volunteer linkage shown with each animal and each donor's shares on one screen; pre-notification by email and SMS with per-donor sent status (SMS through the adapter; if no provider is configured, email only and a clear status); three photo types per animal (animal, meat, packet) uploaded on the day and emailed to the donors of that animal with sent-status tracking and retry; beneficiary meat distribution as in T3.1; expense settlement as in T3.2; donor list export to Excel with allocations. Donor data is field-level protected (officials only). Tests for allocation exclusivity, share math, import validation, email tracking; E2E import → animals → allocate → notify → photos → distribution. Update openapi.yaml.
```

#### T4.5 🛠 অ্যাক্টিভিটি ইঞ্জিন ও বাজেট বাকেট পূর্ণাঙ্গকরণ `[নতুন; D১ Phase 4]`
- শেষে দেখে নিন: সব activity type ও সব bucket সব প্রকল্পে একই সার্ভিসে; উৎস-ভিত্তিক রিপোর্ট; কোনো প্রকল্পে আলাদা হিসাব কোড নেই।

```text
Consolidation task: verify that every activity type of blueprint B৫ (Distribution, Construction, Purchase, Training, Visit, Payment, Voucher, Expense, Issue, Inspection, Follow-up) and every budget bucket of B৬ is implemented once in the shared engine and ledger services and used by all six project types without project-specific calculation code; that the bulk-update pattern is shared by today's distribution / class / construction / visit / follow-up screens; that fund-source reports work per project and program; that advance ≠ actual expense and volunteer operational expense ≠ per-beneficiary cost everywhere (dashboards, exports); and that adding a seventh project type needs only a workflow-template file and project configuration — prove it by adding a throwaway "meat distribution" template in a test. Refactor duplicates found, with tests, and update MASTER_SPEC/WORKFLOW_ENGINE docs.
```

#### T4.6 🧪 Phase 4 টেস্ট একত্রীকরণ

```text
Consolidate Phase 4 testing: BR coverage for construction stages and issue rules, zakat computation and nisab snapshot, exam-gated payment, voucher lock, advance/actual/returned math, site verification, animal allocation exclusivity and share math, donor import validation; API contract and drift; Playwright E2E: house-construction issue raise/resolve by procurement; self-reliance exam → payment → voucher lock; safe water advance → vouchers → returned amount; tree planting public form → verification → distribution; Qurbani allocation exclusivity and photo emails; axe on all Phase 4 screens. Report with executed commands and outputs; update BUSINESS_RULES test status.
```

#### T4.7 🚪 Phase 4 গেট (প্রকল্পভিত্তিক)

```text
/css-gate 4
Testers: one team per project type (house construction with a procurement member and a paid volunteer; self-reliance with an Official দায়ী; safe water with the Implementer; tree planting with a verifying volunteer; Qurbani with the donor-data officer). Produce one UAT script per project type.
```

---

### Phase 5 · Dawah + Monitoring + Follow-up + Documents + Media

#### T5.1 🛠 দাওয়াহ মডিউল (পূর্ণ) `[P6.13]`
- শেষে দেখে নিন: "আজকের ক্লাস" বাল্ক পর্দা অফলাইনে; "শিখেছে" বিষয় আর অপশনে আসে না; অফিসিয়াল দায়ীর ট্র্যাকিং ভিউ ও কল লগ; T4.2-এর exam টেবিলই ব্যবহার হচ্ছে।

```text
Implement the dawah module per MASTER_SPEC A৯ and BD-26, reusing the exam activity of T4.2 unchanged: syllabus topics from project setup; দায়ী-to-beneficiary assignment incl. female-দায়ী split and family members; class scheduling; the "today's class" bulk screen for local দায়ীs (present/absent with reason, today's topic per person with status ongoing / learned; learned topics disappear from the options; one save; offline-capable); exams initial and final by the Official দায়ী (local দায়ী when the RPM grants it) with results side by side and PDF export by beneficiary, দায়ী or area; the Official দায়ী tracking view (last class update per local দায়ী, class count, progress coverage, warning when updates stop beyond the threshold); beneficiary follow-up calls with the call log (date, duration, topic, remarks) on the profile and in the দায়ী's work summary; the dawah dashboard (topics learned, classes, attendance rate, local দায়ী regularity, exam comparison); separate dawah score set for দাঈ-স্বেচ্ছাসেবকs ready for T5.3. Tests and E2E; openapi.yaml.
```

#### T5.2 🛠 মনিটরিং কন্ট্রোল সেন্টার, অডিট ভিউয়ার, কাজের সারসংক্ষেপ `[P6.15-এর অংশ ১]`
- শেষে দেখে নিন: A১০-এর সব সতর্কবার্তা (থ্রেশহোল্ড সেটিং থেকে); কাজের সারসংক্ষেপ CSV/PDF; অডিট লগ entity ধরে ডাউনলোড।

```text
Implement the monitoring control centre per MASTER_SPEC A১০ and BD-42: project progress (target vs applications, reviewed, approved, distributed/completed; budget vs spend), stuck work (which applications wait how long with whom), regularity of local দায়ীs, volunteers and paid volunteers, and the full alert set as scheduled jobs with admin thresholds — review pending, approval pending, no update, distribution without photos, budget near limit, incomplete activity, inactive volunteer, implementation delay, duplicate NID attempts, unbalanced stock, overdue documents (hook for T5.4), repeated deficiency reports (hook for T5.4) — with acknowledge/resolve tracking. Extend the audit log viewer: by project, beneficiary or person, with download. Implement the work summary per staff member and volunteer (applications brought, reviewed, approved, distributions, photos, classes, calls, last activity, time per step such as submission → review completion), filterable by year, project and date range, exportable CSV/PDF, visible to Department Head, Monitoring Team and permitted officials. Tests incl. scope; E2E for alerts appearing after seeded conditions.
```

#### T5.3 🛠 রেটিং ও ক্যাটাগরি, প্রকল্প ক্লোজিং, ফলো-আপ মূল্যায়ন `[P6.15-এর অংশ ২; BD-19, 20, 40]`
- শেষে দেখে নিন: ক্লোজের সময় সিস্টেম-প্রস্তাবিত স্কোর, অফিসিয়াল চূড়ান্ত করেন; স্বেচ্ছাসেবক রেটিং দেখেন না (টেস্ট); ক্যাটাগরি বদলে মন্তব্য বাধ্যতামূলক।

```text
Implement ratings and categories per BD-40 and MASTER_SPEC A৫: at project close the system proposes a score per criterion (max 5 criteria, 1–5) from work data (timeliness, data accuracy from unlock/correction counts, photos and updates, rule compliance — document the formulas as BRs), officials (PM / RPM / Executive) finalize; separate score sets for application/distribution work and for dawah work, averaged only within the same kind; project-wise history on the profile; categories A / B / C / D plus the "inactive" flag with mandatory comment on change, fully logged; volunteers never see ratings, categories or comments (field-level test). Complete the project closing flow: closing state checks (pending photos, vouchers, reconciliation, documents), PM close with rating finalization, read-only enforcement, reopen with reason. Generalize follow-up evaluations (continuous, no schedule or reminders; date, who, method visit/phone, result, remarks, photos; project-specific result questions configurable, e.g. the self-reliance set) available after close for officials and Official দায়ীs, on the beneficiary profile and in the follow-up dashboard numbers. Tests and E2E; openapi.yaml.
```

#### T5.4 🛠 ডকুমেন্ট রেজিস্টার (SOP), ঘাটতি প্রতিবেদন, ত্রৈমাসিক অডিট `[P6.14]`
- ক্রম (O-34): এই কাজ সবার শেষে হবে — T6.1-এর পরে এবং T6.3 সিকিউরিটি অডিটের আগে; চেকলিস্ট-টেমপ্লেট এডিটরও (আগে T1.13-এ ছিল) এই কাজে তৈরি হবে। আগে দরকার: SOP v2.3-এর লেখা।
- আগে দরকার: SOP v2.3 `docs/source/`-এ (না থাকলে Claude চেকলিস্টের তালিকা জিজ্ঞেস করবে)। শেষে দেখে নিন: সময়সীমা পেরোলে সফট ওয়ার্নিং + ৩ কার্যদিবস গণনা; দ্বিতীয় ঘাটতি প্রতিবেদনে স্বয়ংক্রিয় escalation; স্বেচ্ছাসেবক রেজিস্টার দেখেন না।

```text
Implement the SOP-based document register per MASTER_SPEC A১০ and BD-35…BD-39: a document-checklist template editor per project type (name, required / if needed / optional, responsible official role, deadline rule) based on the SOP (moved here from T1.13 by O-34); per-project checklist instantiated from the templates at project creation or template copy; each row with name, required / if needed / optional, responsible official role (never volunteers; volunteers cannot see the register), deadline, status chain collection → verification → approval → archived, soft-copy upload into Program → Project → Year → District, hard-copy location code (CSS-ALM-… / CSS-LKR-…) with format validation, retention 5 years from submission with an expiry list; missed deadline → soft warning notification and a 3-working-day countdown (Bangladesh weekend and a configurable holiday list) → non-compliance mark for that official and a monitoring alert; deadline extension with reason (audited); deficiency report form with the 11 fields of SOP 7.4 and the central log, automatic escalation to the superior when the same person files a second report within a year, legacy (pre-SOP) deficiencies marked separately with recoverable / not recoverable and the admission note attachment, exempt from non-compliance; the quarterly audit report in one click (missing documents, on-time rate, deficiency summary, hard copies past 5 years) exportable; register export replacing the tracking sheet; handover integration (documents in a leaving official's name). Tests incl. working-day math; E2E; openapi.yaml.
```

#### T5.5 (বাদ) মিডিয়া সম্মতি ও গল্পের ট্র্যাকার
- D-101 (2026-10-18) অনুযায়ী এই কাজ Phase 2-এর T2.8b-তে এগিয়ে আনা হয়েছে; এখানে কিছু করার নেই।

#### T5.6 🧪 Phase 5 টেস্ট একত্রীকরণ

```text
Consolidate Phase 5 testing: BR coverage for attendance and topic rules, exam results, rating formulas and visibility, category change comment, close/reopen, follow-up, document deadlines and working days, escalation, retention, media consent gating; API contract and drift; Playwright E2E: today's class → exam results; alerts after seeded stuck conditions; project close with proposed ratings → finalize → volunteer cannot see; document upload → deadline warning → non-compliance; deficiency report → second report escalates; media consent → publishable list; axe on all Phase 5 screens. Report with executed commands and outputs; update BUSINESS_RULES test status.
```

#### T5.7 🚪 Phase 5 গেট

```text
/css-gate 5
Testers: the MEAL / Monitoring Team, two Official দায়ীs with their local দায়ীs, one PM for closing, the documentation officer for the register, and one media team member.
```

---

### Phase 6 · Central Reporting & Optimization

#### T6.1 🛠 প্রোগ্রাম, সেন্ট্রাল ও দাওয়াহ ড্যাশবোর্ড; রিপোর্ট `[P6.16]`
- শেষে দেখে নিন: ৭টি KPI গ্রুপ; উপকারভোগী জার্নি রিপোর্ট PDF; উৎস-ভিত্তিক বাজেট রিপোর্ট; প্রতিটি সংখ্যা স্কোপ মানে।

```text
Implement the program, central and dawah dashboards per MASTER_SPEC A১১ and BD-43 (the management home opens on work progress first, UX-10) with the approved seven KPI groups (unique beneficiaries and applications by year/program/project/division/district; application funnel with average time per step; budget planned/spent/remaining with program and project comparison; volunteers active by region with category and average rating for officials only; dawah classes, attendance, initial vs final improvement; follow-up coverage and result summary; alerts), interactive filters by year, program, project and area, statistics on every list, the beneficiary journey report (identified → support → dawah → follow-up) as screen and PDF, budget reports by fund source, and exports through the T2.8 service respecting field-level permissions. All numbers through tested query services; caching with invalidation; pagination for drill-downs. Tests incl. scope and KPI correctness against seeded data.
```

#### T6.2 🛠 অ্যাডমিন ও সেটিংস (বাকি অংশ) `[P6.17-এর অংশ ২]`

```text
Complete the admin area: workflow definition viewer/editor with validation against the JSON Schema and versioning (a change never alters in-flight applications' history), template settings, notification matrix and template management with test-send, localization management (missing keys, bilingual data editors), document settings (holiday list, retention, location-code formats), nisab history, SMS provider configuration with a test message, audit and security logs (failed logins, permission changes, exports of sensitive data), session monitoring, storage growth report for the IT team (BD-46), and an "about" page with version and build info. Main Admin protected. Tests; openapi.yaml.
```

#### T6.3 🧪 সিকিউরিটি অডিট `[P7.4-এর নিরাপত্তা অংশ]`
- শেষে দেখে নিন: severity অনুযায়ী findings; critical/high ঠিক করার আগে আপনার অনুমোদন; dependency scan রিপোর্ট।

```text
Run a security audit against docs/security/SECURITY_POLICY.md and the OWASP baseline (use subagents in parallel if available): authorization on every endpoint vs permissions.yaml, IDOR across regions/projects/volunteers, field-level leaks in responses, exports and PDFs, injection, XSS, CSRF, file upload (type, size, path, scan hook), signed URL expiry, session and token handling, OTP and lockout, secrets in code/logs/config, dependency vulnerabilities (pnpm audit and a lockfile review), error responses leaking stack traces or SQL, rate limits, audit-log completeness for every §13 event, dummy-OTP and seed guards in production configuration. Report findings by severity with evidence and recommended fixes; do not fix silently — list the fixes you propose and wait for my approval, then implement the approved ones with regression tests.
```

#### T6.4 🧪 পারফরম্যান্স অডিট ও অপটিমাইজেশন `[P7.4-এর পারফরম্যান্স অংশ]`

```text
Repeat the k6 load tests of T3.4 on the complete system (distribution day plus concurrent dashboards, exports and sync), add dashboard and report query benchmarks, N+1 and slow-query detection with query plans, index review, cache review, bundle analysis for the volunteer PWA and the official desktop app, and a storage growth projection (photos and documents per project per year) for the IT team. Fix what the NFR targets require, measure before/after, and report what remains with recommendations. Never weaken validation or authorization for speed.
```

#### T6.5 🛠 প্রোডাকশন হার্ডেনিং, ব্যাকআপ-রিস্টোর মহড়া, রানবুক `[P8.1-এর শেষ অংশ]`

```text
Finalize operations per docs/ops/DEPLOYMENT.md and RUNBOOK.md for production on the organization's server: hardened configuration (TLS, headers, CORS, cookie flags, rate limits, upload limits), log rotation and retention, monitoring and alerting (health, disk, storage growth, queue backlog, failed jobs, error rates), backup schedule with WAL archiving and MinIO mirroring, a full restore drill on a clean machine with timing against the RTO/RPO targets, the migration/rollback rehearsal with down.sql, the release checklist, the on-call/runbook procedures (lost phone revocation, locked accounts, stuck sync, failed notification queue, re-sending Qurbani emails, restoring a deleted file), and the storage-growth report wiring. Provide a Bengali quick runbook for the IT team. Prove the restore drill and the migration rollback with outputs.
```

#### T6.6 🚪 চূড়ান্ত কোয়ালিটি গেট ও go/no-go `[P8.2]`
- শেষে দেখে নিন: go/no-go রিপোর্টে প্রতিটি শর্তের প্রমাণ; `gate-phase-6` ট্যাগ; ম্যানেজমেন্ট রিভিউ।

```text
Run the full quality gate from constitution §14 and the Definition of Done in §15 across the whole system, then /css-gate 6 steps. Before go-live confirm specifically, with evidence: real SMS and email gateways configured and dummy OTP disabled in production; seed and test data absent from production; Main Admin protected; backups verified by an actual restore; audit logging active for every §13 event; all critical and high findings from T6.3 and T6.4 resolved or explicitly accepted by me in DECISION_LOG; every BR in BUSINESS_RULES.md either tested or explicitly marked manual with a reason; documentation synchronized (/css-docsync clean); UAT feedback from every phase closed or logged. Produce docs/gates/GO_NO_GO.md with a Bengali summary for management and tag gate-phase-6.
```

#### T6.7 📄 ম্যানুয়াল, প্রশিক্ষণ ও হ্যান্ডওভার ডকুমেন্ট `[নতুন; D২]`

```text
Write the handover documentation: docs/manuals/ in Bengali — an administrator manual (users, roles, permission panel, settings, nisab, templates, monitoring, document register, backups overview), a role-by-role user guide (Department Head / Monitoring, PM, RPM, Project Executive, Official দায়ী, Implementer, procurement, media, finance, volunteer, team member, local দায়ী, paid volunteer) with screenshots captured from the running app in both languages, the in-app help texts and short video scripts for the volunteer flows (installation, application, offline sync, today's distribution, today's class), a champion-volunteer training outline; and in English — developer onboarding (README, CONTRIBUTING, architecture tour, how to add a project type by configuration, how to add an endpoint, how to run every test layer) and a maintenance calendar (backups, restore drills, dependency updates, nisab update, holiday list, retention review). Keep everything consistent with the final code; update MODULE_CATALOG and STATUS.md to "delivered".
```

---

## ৫. নিয়মিত ব্যবহারের প্রম্পট (slash command)

রিপোর `.claude/commands/` ফোল্ডারে এগুলো আছে; দশটিই শুধু আপনি চালাতে পারেন (`disable-model-invocation`), Claude নিজে থেকে `/css-end` বা `/css-gate` চালিয়ে commit বা ট্যাগ করবে না; Claude Code-এ `/css-…` লিখলেই চলে (কোনো সংস্করণে `/project:css-…`)। পুরো লেখা পরিশিষ্ট B-তে, যাতে command কাজ না করলে পেস্ট করতে পারেন।

| Command | কখন | লাইব্রেরির মূল |
|---|---|---|
| `/css-start` | প্রতিটি সেশনের শুরুতে। STATUS.md, DECISION_LOG, git log পড়ে অবস্থা বলে; কিছু বদলায় না | নতুন |
| `/css-end` | প্রতিটি টাস্কের শেষে। টেস্ট রান, STATUS.md ও ডক আপডেট, commit, §15 রিপোর্ট বাংলায় | নতুন |
| `/css-fix <ব্যাখ্যা>` | ফলাফল ব্লুপ্রিন্ট/স্পেকের সাথে মেলেনি। আগে ব্যাখ্যা ও প্রস্তাব, অনুমোদনের পর ঠিক | A.1 |
| `/css-change <সিদ্ধান্ত>` | নতুন সিদ্ধান্ত বা ব্লুপ্রিন্ট বদল। আগে প্রভাব বিশ্লেষণ, অনুমোদন, DECISION_LOG, তারপর বাস্তবায়ন | A.2 |
| `/css-bug <বিবরণ>` | বাগ। আগে failing test দিয়ে root cause, তারপর fix + regression test | A.3 |
| `/css-review <module>` | মডিউল শেষে বা গেটের আগে। শুধু তালিকা, refactor নয় | A.4 |
| `/css-docsync` | গেটের আগে, বা ডক পুরোনো মনে হলে | A.5 |
| `/css-status` | সাপ্তাহিক। এক পৃষ্ঠার বাংলা অবস্থা-রিপোর্ট | A.6 |
| `/css-gate <N>` | ফেজের শেষে। ডক-সিঙ্ক, রিভিউ, পূর্ণ টেস্ট, বাংলা UAT স্ক্রিপ্ট, release notes, ট্যাগ | নতুন |
| `/css-uat <phase/module>` + ফিডব্যাক পেস্ট | UAT-এর পর। বাগ / ব্লুপ্রিন্ট-ঘাটতি / নতুন অনুরোধ / প্রশিক্ষণ — চার ভাগ করে কাজ | নতুন |

**বড় টাস্ক দ্বিতীয় সেশনে চালিয়ে নেওয়া:**

```text
Continue task [T2.3] from where docs/STATUS.md says it stopped. Re-read the task prompt below, do not redo finished steps, and report which steps remain before you start.
[টাস্কের মূল প্রম্পট আবার পেস্ট করুন]
```

**ব্লুপ্রিন্ট বদলালে:** docx-এ বদল → Markdown export → `docs/source/ERP_BLUEPRINT_BN.md` বদলে দিন (ছবি বদলালে `images/`-ও) → তারপর:

```text
/css-change The blueprint file docs/source/ERP_BLUEPRINT_BN.md was updated in section [A৮.১] on [তারিখ]: [এক লাইনে কী বদলেছে]. Diff the affected sections against MASTER_SPEC.md, BUSINESS_RULES.md and DECISION_LOG.md, report the impact, and wait for my approval.
```

**Claude কোনো ধারণা করে এগোতে চাইলে** ("I'll assume…"): থামিয়ে বলুন

```text
Do not assume. List the interpretations with consequences and your recommendation, then wait for my decision.
```

---

## ৬. সতর্কতা ও টিপস

1. **দুটি টাস্ক একসাথে নয়।** মাস্টার §15: এক প্রম্পট = এক controlled change। একসাথে দিলে স্কোপ ছড়ায়, রিপোর্ট অস্পষ্ট হয়।
2. **গেট বাদ দেবেন না।** বাস্তব ব্যবহারকারীর পরীক্ষা ছাড়া পরের ফেজে গেলে ভুল ভিত্তির ওপর তিন ফেজ কোড জমে।
3. **"টেস্ট পাশ করেছে" = আউটপুট দেখা।** রিপোর্টে `pnpm test` এর summary (passed/failed সংখ্যা) না থাকলে জিজ্ঞেস করুন "Show me the test run output". CI সবুজ কি না দেখুন।
4. **"যেভাবে হোক চালিয়ে দাও" বলবেন না।** এতে নিরাপত্তা চেক দুর্বল করা বা নিয়ম বানিয়ে নেওয়ার ঝুঁকি (মাস্টার §15 "Never")।
5. **নতুন নিয়ম চোখে পড়লে** (যেমন Claude নিজে ঠিক করল "৩ দিনের বেশি পেন্ডিং হলে auto-reject") — সেটা bug: `/css-fix`। প্রতিটি নিয়মের BR-id ও উৎস থাকতে হবে।
6. **প্রতিদিন push করুন।** রিপোই আপনার কাজের একমাত্র কপি; Claude Code-এর সেশন নয়।
7. **context ও খরচ।** প্রতি টাস্কে নতুন সেশন বা `/clear`; লম্বা হলে `/compact`। Phase 0-তে ফাইলগুলো বড়; Claude একবারে না পারলে বলবে, তখন পরের টাস্কে বাকিটা।
8. **demo account ও dummy OTP কখনো production-এ নয়** (BD-49)। T3.0 ও T6.6 এটা যাচাই করে; আপনিও করবেন।
9. **সংবেদনশীল ডেটা Claude-কে দেবেন না।** নমুনা শীট/ফর্ম anonymized; আসল NID, ফোন, ব্যাংক তথ্য রিপোতে নয়।
10. **প্রোডাকশন সার্ভারে Claude Code চালাবেন না।** ডিপ্লয় স্ক্রিপ্ট Claude লিখবে; চালাবেন আপনি বা IT।
11. **Claude Code যা পারে না:** আসল ফোনে পরীক্ষা (আপনি/স্বেচ্ছাসেবকরা), SMS প্রোভাইডারের credential, সার্ভারে ঢোকা। এগুলো আপনার দিক থেকে সময়মতো দিন।
12. **সংস্করণভেদে ফিচার:** plan mode না থাকলে প্রম্পটের শুরুতে লিখুন "First give me the plan per §15 step 3 and wait for my approval before changing any file."; `@import` না থাকলে CLAUDE.md-এ মাস্টার প্রম্পট পেস্ট; commands না থাকলে পরিশিষ্ট B-এর লেখা পেস্ট।
13. **একাধিক ডেভেলপার যুক্ত হলে** একই CLAUDE.md, একই নিয়ম; ব্রাঞ্চ ধরে কাজ, PR-এ `/css-review`।
14. **ফেজের ভেতরে ক্রম বদলানো যায়** (যেমন Phase 4-এ কুরবানী আগে), কিন্তু ফেজ টপকানো নয়; নির্ভরতা টাস্কের "আগে দরকার" লাইনে লেখা।
15. **প্রথম তিন সেশনে** Claude-এর আচরণ দেখে CLAUDE.md-এ নিয়ম যোগ/বদল করুন (যেমন বেশি প্রশ্ন করলে "batch questions" জোর দিন; কম করলে "ask before guessing" জোর দিন)। CLAUDE.md আপনার হাতিয়ার।

---

## পরিশিষ্ট A · পুরোনো লাইব্রেরি (charity_ERP.md) → এই প্ল্যানের টাস্ক

| লাইব্রেরি | এই প্ল্যান | মন্তব্য |
|---|---|---|
| P0.1 | T0.1 (+ CLAUDE.md import) | মাস্টার প্রম্পট আর পেস্ট নয় |
| P0.2 | T0.2 | fallback/deepen |
| P1.1 · P1.2 · P1.3 · P1.4 | T0.3 · T0.4 · T0.5 · T0.6 | P1.3-এর "47" গণনা সংশোধিত |
| P2.1 · P2.2 | T0.8 · T0.9 | + ADR |
| P2.3 | T0.10 (ডক) + T1.8 (কোড) | + permissions.yaml |
| P2.4 | T0.11 (ডক + ৬ YAML) + T2.5 (কোড) | |
| P2.5 | T0.12 + T2.7 | |
| P2.6 | T0.13 + T2.1 + T5.4 | |
| P2.7 | T0.14 + T1.14 | |
| P3.1 | T0.15 | + mermaid |
| P3.2 | T0.16 (ডক) + T1.2 (migrations) | Phase 0-তে কোড নয় |
| P3.3 | T1.3 | + পরিশিষ্ট খ-এর ফর্ম সিড |
| P4.1 · P4.2 | T0.17 · T0.18 | |
| P5.1 | T0.19 (ডক + SCREENS) + T0.19b (HTML মকআপ) + T1.4 (কোড) | |
| P5.2 | T0.20 + T1.5 | |
| P6.1 | T1.7 + T1.8 | |
| P6.2 | T1.9 | + edit request, handover বিস্তারিত |
| P6.3 | T2.2 | |
| P6.4 | T1.11 + T1.12 | + consent flow, assignment, teams |
| P6.5 | T2.3 + T2.4 | |
| P6.6 | T2.5 + T2.6 | |
| P6.7 | T2.7 | |
| P6.8 | T3.1 + T3.2 | লেজার আলাদা |
| P6.9 · P6.10 · P6.11 · P6.12 | T4.1 · T4.2 · T4.3 · T4.4 | T4.2-এ ন্যূনতম exam |
| P6.13 | T5.1 | |
| P6.14 | T5.4 | |
| P6.15 | T5.2 + T5.3 + T5.5 | |
| P6.16 | T3.3 + T6.1 | |
| P6.17 | T1.13 + T6.2 | |
| P7.1 | T0.21 (+ SECURITY_POLICY) | |
| P7.2 · P7.3 | T1.16, T2.9, T3.5, T4.6, T5.6 (ফেজ ধরে) | |
| P7.4 | T3.4 + T6.3 + T6.4 | লোড টেস্ট আগে |
| P8.1 | T3.0 + T6.5 | ডিপ্লয়মেন্ট আগে |
| P8.2 | T6.6 | "§49" → §14/§15 |
| A.1 · A.2 · A.3 · A.4 · A.5 · A.6 | /css-fix · /css-change · /css-bug · /css-review · /css-docsync · /css-status | |
| — (নতুন) | T0.7, T0.19b, T0.22, T1.1, T1.6, T1.10, T1.15, T1.17, T2.1, T2.8, T2.10, T3.6, T4.5, T4.7, T5.7, T6.7, /css-start, /css-end, /css-gate, /css-uat | |

---

## পরিশিষ্ট B · starter-kit ফাইলের বিষয়বস্তু

starter-kit ফোল্ডারে এগুলো তৈরি করা আছে; এখানে পুরো লেখা রাখা হলো যাতে এই একটি ফাইল থেকেই সব পুনর্গঠন করা যায়। (`docs/MASTER_PROMPT.md` = আপনার MASTER_PROMPT_CSS_ERP.md-এর কপি, §1.2-এর c, d ও §3-এর সংযোজনসহ; `docs/source/ERP_BLUEPRINT_BN.md` = docx-এর Markdown রূপ, `images/` ফোল্ডারে ৬টি ডায়াগ্রাম।)

### B.1 `CLAUDE.md`

```markdown
# CSS ERP — Claude Code project instructions

ERP for the Charity & Social Service Department of As-Sunnah Foundation. The project owner (the department) makes every business and architectural decision; Claude Code is the development team working under the constitution imported at the bottom of this file (docs/MASTER_PROMPT.md). The business authority is docs/source/ERP_BLUEPRINT_BN.md (Bengali). Precedence between sources is defined in the constitution §0.

## Session ritual (every session, no exceptions)
1. Start: read docs/STATUS.md, the last 40 lines of docs/DECISION_LOG.md (once it exists; task T0.1 creates it), and `git log --oneline -15`. Then tell the owner in 3-5 lines where the project stands, what the next planned task is, and whether anything is blocking. Do NOT start any work until the owner pastes the task prompt.
2. One task prompt = one controlled change (constitution §15). Read the relevant docs and code → identify dependencies and conflicts → state what you found, what you will change, what you will NOT change, risks and tests → (in plan mode: wait for approval) → implement only the requested scope → run the tests → report with the §15 template (Changed / Files / Database / API / Security / Tests / Documentation updated / Decisions needed / Remaining issues).
3. End: run the tests of every touched package, update docs/STATUS.md (phase, last completed task id, next task id, open decisions, known issues, last test run with date and result), update every document the change affects in the same commit, and commit with a conventional message: feat|fix|test|docs|chore|refactor(scope): summary. If anything is left uncommitted or failing, say so explicitly in the report.

## Language
- Talk to the owner in Bengali. Keep technical terms, identifiers, file names, commands and code in English inside the Bengali text.
- Code, comments, documentation, commit messages, OpenAPI, tests, ADRs: English. The blueprint stays Bengali. User-facing UI text exists only as bn/en i18n keys, never hard-coded.
- Naming: RM = RPM = Regional Program Manager; Monitoring Officer = Monitoring Team; Project Officer = Project Executive. Use the English role names from the constitution §5 in code and docs.

## Working rules for Claude Code
- Scope discipline: never expand beyond the task prompt. Something else broken? Report it under "Remaining issues"; do not fix it silently.
- Ask before guessing (§2), but batch the questions: collect them, ask once, and continue with everything that does not depend on the answers.
- "Tests pass" means you executed them in this session and show the command and its summary output. Never claim untested work as done.
- Reuse first: before creating a component, hook, service, utility, query or pattern, search the repository for an existing one and extend it.
- Security first: every endpoint declares its permission name and scope; default deny; field-level protection in serializers and exports; no secrets in code, logs or commits.
- Data integrity first: no hard delete of business data; unique constraints and idempotency keys as documented; every write audited where §13 requires it.
- Git safety: never run git reset --hard, push --force, branch -D, rebase on shared history, or delete migrations. Never modify .env files that hold real secrets. Small commits per task; tag phase gates as gate-phase-N.
- Large tasks: split into steps; finish, test and commit each step before starting the next. If the context gets long, write progress into docs/STATUS.md before continuing.
- Decisions: every new business or architectural decision is appended to docs/DECISION_LOG.md before implementation. Proposals stay "proposed" until the owner confirms in chat.

## UI rules decided by the owner (details: docs/ui/DESIGN_BRIEF.md)
- All numbers use English digits 0-9 in both languages.
- Officials work equally on desktop and phone: review, approval, lookup, profiles and dashboards must work at 360 px. Setup screens (form builder, project setup, permission panel) are desktop first.
- Calm institutional look. Colours and fonts come only from docs/ui/brand/colors.md (green family, font stack UbuntuSans, Bornomala, sans-serif, weights 400 and 700); do not invent colours. Read the brief before any UI task.

## Repository map and commands
(Filled in by task T1.1 after scaffolding; keep this section current whenever scripts or layout change.)
- Install: pnpm install · Dev: pnpm dev · Unit/API tests: pnpm test · E2E: pnpm e2e · Lint: pnpm lint · Typecheck: pnpm typecheck · DB: pnpm db:migrate, pnpm db:seed · Local services: docker compose up -d

@docs/MASTER_PROMPT.md
```

### B.2 `docs/STATUS.md` (প্রাথমিক)

```markdown
# Project status (Claude updates this at the end of every task; read it at the start of every session)

- Current phase: 0 (Requirement & Architecture Freeze) — NOT STARTED
- Last completed task: none
- Next task: T0.1 — Startup procedure (constitution §16)
- Blocking items: none

## Open decisions waiting on the owner
- D-050…D-053 technical stack proposals (constitution §9) — confirm or change in task T0.7

## Known issues / risks
- none yet

## Last test run
- none yet

## Notes for the next session
- Repository contains only docs/, CLAUDE.md, .claude/ and README.md. No application code until Phase 0 is signed off.
```

### B.3 `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install:*)", "Bash(pnpm test:*)", "Bash(pnpm e2e:*)", "Bash(pnpm lint:*)",
      "Bash(pnpm typecheck:*)", "Bash(pnpm build:*)", "Bash(pnpm db:*)", "Bash(pnpm dev:*)",
      "Bash(pnpm -r:*)", "Bash(pnpm --filter:*)",
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git add:*)",
      "Bash(git commit:*)", "Bash(git tag:*)", "Bash(docker compose:*)"
    ],
    "deny": [
      "Bash(git push --force:*)", "Bash(git push -f:*)", "Bash(git reset --hard:*)",
      "Bash(git branch -D:*)", "Bash(rm -rf:*)", "Read(./.env)", "Read(./.env.*)"
    ]
  }
}
```

### B.4 `.claude/commands/` (দশটি command)

**css-start.md**

```text
---
description: "Session start: report where the project stands in Bengali, change nothing"
disable-model-invocation: true
---
Session start. Do not change any file.
1. Read docs/STATUS.md and, once it exists (task T0.1 creates it), the last 40 lines of docs/DECISION_LOG.md; then run `git status` and `git log --oneline -15`.
2. Tell me in Bengali, in at most 8 lines: current phase, last completed task, the next task id and its one-line goal, open decisions waiting on me, anything uncommitted or failing.
3. Then wait for my task prompt.
```

**css-end.md**

```text
---
description: "Session end: run tests, update STATUS.md and docs, commit, give the report in Bengali"
disable-model-invocation: true
---
Session end for the current task.
1. Run the tests of every touched package (unit, API, and E2E if the task touched UI flows) and show the command and summary output.
2. Update docs/STATUS.md: phase, last completed task id, next task id, open decisions, known issues, last test run (date, command, result).
3. Verify every document affected by this task was updated in the same change (MASTER_SPEC, BUSINESS_RULES, DECISION_LOG, ERD/DATABASE_SCHEMA, openapi.yaml, RBAC/permissions.yaml, SCREENS, I18N, TEST_STRATEGY as applicable).
4. Commit with a conventional message. If anything cannot be committed or is failing, say so explicitly.
5. Give the §15 report (Changed / Files / Database / API / Security / Tests / Documentation updated / Decisions needed / Remaining issues) in Bengali with English technical terms.
```

**css-fix.md**

```text
---
description: "Report a mismatch with the blueprint or spec; propose a fix and wait for approval"
argument-hint: "[what does not match]"
disable-model-invocation: true
---
The last change does not match the blueprint/spec in this way: $ARGUMENTS
Explain the conflict, the affected modules, and the fix you propose, with the exact documents and rules (BR-ids, BD-ids) involved. Do not implement until I approve.
```

**css-change.md**

```text
---
description: "New owner decision: impact analysis first, then log it and implement after approval"
argument-hint: "[the decision]"
disable-model-invocation: true
---
New decision from the project owner: $ARGUMENTS
Per the No Silent Change policy: first report what it conflicts with (blueprint sections, BD/BR ids, DECISION_LOG entries), the affected modules, and the database / API / UI / security / testing / migration impact. Then wait for my approval. After approval: record it in docs/DECISION_LOG.md with a new id and today's date, update the affected documents, then implement with tests.
```

**css-bug.md**

```text
---
description: "Fix a bug: reproduce with a failing test first, then fix and keep the regression test"
argument-hint: "[what happens / expected / where / role]"
disable-model-invocation: true
---
Bug report: $ARGUMENTS
Expected format from me: what happens / what should happen / where (screen or endpoint) / which role / steps to reproduce.
Find the root cause before fixing: reproduce it with a failing test first. Then fix, keep the regression test, and report: cause, fix, affected modules, tests added and executed, documents updated. Do not change behaviour beyond the bug.
```

**css-review.md**

```text
---
description: "Review a module against spec, business rules, RBAC and API standards; list only, no fixes"
argument-hint: "[module name]"
disable-model-invocation: true
---
Review the "$ARGUMENTS" module against docs/MASTER_SPEC.md, docs/BUSINESS_RULES.md, docs/security/RBAC.md and docs/api/API_STANDARDS.md.
If subagents are available, split the review: (a) business-rule compliance, (b) authorization and field-level protection including IDOR, (c) tests and coverage, (d) code quality (duplicated logic, hard-coded strings or permissions, magic numbers, performance risks such as N+1 queries and unpaginated lists).
Report a prioritized list (critical / major / minor) with file references. Do not refactor or fix anything yet; give me the list first.
```

**css-docsync.md**

```text
---
description: "Check that code and documentation are in sync and update the documentation"
disable-model-invocation: true
---
Check whether the code and the documentation are still synchronized: MASTER_SPEC, MODULE_CATALOG, BUSINESS_RULES (including the test-status column), DECISION_LOG, ERD, DATABASE_SCHEMA, openapi.yaml (run the drift test), RBAC and permissions.yaml, SCREENS, I18N (missing keys in bn or en), TEST_STRATEGY, STATUS.
List every mismatch, then update the documentation to match the approved implementation. Where the code contradicts an approved decision, do not change the docs: report it as a defect instead.
```

**css-status.md**

```text
---
description: "One-page status report in Bengali: done, in progress, blocked, decisions, risks, next tasks"
disable-model-invocation: true
---
Give me a status report in Bengali (technical terms in English), under one page: what was completed since the last gate (task ids), what is in progress, what is blocked, open decisions waiting on me, test coverage per layer and the last full run, the current risk list with mitigations, and the next three tasks. Base it on docs/STATUS.md, git log and the test reports; do not guess.
```

**css-gate.md**

```text
---
description: "Phase gate: docs sync, review, full tests, Bengali UAT script, release notes, git tag"
argument-hint: "[phase number]"
disable-model-invocation: true
---
Phase gate for phase $ARGUMENTS. Run in this order and report each step; do not start work that belongs to the next phase.
1. Documentation sync for every module of this phase (same checks as /css-docsync); fix the docs.
2. Review each module of this phase against MASTER_SPEC, BUSINESS_RULES, RBAC, API_STANDARDS (use subagents in parallel if available): rule violations, missing authorization or field-level protection, missing tests, duplicated logic, hard-coded strings, performance risks. Fix critical findings now with tests; log the rest in docs/STATUS.md under known issues.
3. Run the complete test suite (unit, API/contract, E2E, axe) and paste the summary. List the BR-ids still untested and why.
4. Write docs/testing/uat/PHASE_<N>_UAT_BN.md: a Bengali UAT script for the real testers of this phase, scenario by scenario with expected results, the demo accounts to use, and a feedback table (ক্রমিক, পর্দা, কী হলো, কী হওয়ার কথা, গুরুত্ব).
5. Write docs/gates/PHASE_<N>_RELEASE_NOTES.md (English, with a Bengali summary at the top).
6. Update docs/STATUS.md (phase <N> complete pending UAT; next task id), commit, and tag gate-phase-<N>.
```

**css-uat.md**

```text
---
description: "Process tester feedback: classify as bug, missing requirement, new request or training issue"
argument-hint: "[phase or module]"
disable-model-invocation: true
---
UAT feedback for $ARGUMENTS, verbatim from the testers (Bengali), pasted below this line:

Classify each item: (a) bug, (b) requirement already in the blueprint but missing or wrong, (c) new request that needs an owner decision, (d) training or wording issue. Fix (a) and (b) now with regression tests and report them; put (c) into docs/DECISION_LOG.md as open items with your recommendation; propose i18n text changes for (d). Do not implement (c) without my approval.
```

### B.5 মাস্টার প্রম্পটে যা বদলানো হয়েছে (`docs/MASTER_PROMPT.md`, v1.1)

1. শিরোনামের নিচে "Version 1.1 (8 Oct 2026)" নোট।
2. §3-এর তালিকার পরে নতুন কাজের-ডকুমেন্ট: `docs/STATUS.md`, `docs/ui/SCREENS.md`, `docs/architecture/ADR/`, `docs/architecture/workflow-templates/`, `docs/security/permissions.yaml`, `docs/testing/uat/`, `docs/gates/`, `docs/ops/DEPLOYMENT.md`, `RUNBOOK.md`।
3. §9-এর "To confirm with the project owner" অংশে ফাঁকা backend/storage-এর জায়গায় প্রস্তাবিত স্ট্যাক (§২.১), "proposed" হিসেবে; SMS প্রোভাইডার, ব্র্যান্ড ও সার্ভার এখনো "to confirm"।
4. শেষ লাইন: "Now begin with the STARTUP PROCEDURE" → STATUS.md-এ Phase 0 শুরু না হলে তবেই স্টার্টআপ, নইলে CLAUDE.md-এর সেশন-রিচুয়াল।
5. (১০ অক্টোবর, v1.1.1) §9-এ প্রস্তাবিত Node.js 22 → 24 LTS।
6. (১০ অক্টোবর, v1.1.2) ডিজাইন ইন্টারভিউ: §9 ও §10-এ ডিভাইস (অফিসিয়াল ফোন ও ডেস্কটপ সমান, কিছু আইফোন), §11-এ সংখ্যা সবসময় ইংরেজি অঙ্কে, §12-এ Figma নেই বলে মকআপ T0.19b-তে এবং ব্র্যান্ড রংয়ের লাইন; §৩-এর ডকুমেন্ট তালিকায় নতুন `docs/ui/DESIGN_BRIEF.md`।
7. (১০ অক্টোবর, v1.1.3) §12-এ রং ও টাইপোগ্রাফি ওয়েবসাইট অনুসারে (UX-01, UX-13): সবুজ `#008E48` পরিবার, ফন্ট UbuntuSans ও Bornomala, ওজন ৪০০ ও ৭০০; নতুন `docs/ui/brand/colors.md`।

বাকি সব (§0–§18-এর নীতি, ভূমিকা, BD-01…49, রোডম্যাপ, টোকেন, স্ট্যান্ডার্ড, টেস্টিং, প্রক্রিয়া) অপরিবর্তিত।

---

*ফাইল শেষ। প্রশ্ন বা ব্লুপ্রিন্ট বদলালে §৫-এর `/css-change` দিয়ে শুরু করুন।*
