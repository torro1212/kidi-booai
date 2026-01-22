# הגדרת Google Drive Integration

## שלב 1: הגדרת Google Cloud Console

1. עבור ל-[Google Cloud Console](https://console.cloud.google.com/)
2. צור פרויקט חדש או בחר פרויקט קיים
3. עבור ל-**APIs & Services** > **Credentials**
4. לחץ על **+ CREATE CREDENTIALS** ובחר **OAuth client ID**
5. אם זו הפעם הראשונה, תצטרך להגדיר **OAuth consent screen**:
   - בחר **User Type: External**
   - מלא את שם האפליקציה
   - הוסף את האימייל שלך
   - שמור והמשך

## שלב 2: יצירת OAuth Client ID

1. חזור ל-**Credentials** ולחץ **+ CREATE CREDENTIALS** > **OAuth client ID**
2. בחר **Application type: Web application**
3. הוסף **Authorized JavaScript origins**:
   ```
   http://localhost:3000
   ```
4. אם אתה מתכנן לפרסם את האפליקציה, הוסף גם את ה-URL של האתר שלך
5. לחץ **Create**
6. העתק את ה-**Client ID** (נראה כמו: `xxxxx.apps.googleusercontent.com`)

## שלב 3: הפעלת Google Drive API

1. עבור ל-**APIs & Services** > **Library**
2. חפש "Google Drive API"
3. לחץ על **Enable**

## שלב 4: הגדרת קובץ .env.local

1. פתח את הקובץ `.env.local` בתיקיית הפרויקט
2. החלף את `your_google_client_id_here` ב-Client ID שהעתקת:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com
   ```
3. שמור את הקובץ
4. הפעל מחדש את שרת הפיתוח:
   ```bash
   npm run dev
   ```

## בדיקה

לאחר השלבים האלה:
1. רענן את הדפדפן
2. כפתור "התחבר ל-Drive" אמור להיות זמין ללחיצה
3. לחץ עליו והתחבר עם חשבון Google שלך
4. תקבל הודעה "מחובר ל-Drive" ✓

## פתרון בעיות

- **"Google Drive לא מוגדר"**: ודא שהוספת את ה-Client ID לקובץ `.env.local`
- **"ההתחברות נכשלה"**: ודא ש:
  - הוספת את `http://localhost:3000` ל-Authorized JavaScript origins
  - הפעלת את Google Drive API
  - הפעלת מחדש את שרת הפיתוח
